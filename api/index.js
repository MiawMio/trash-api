const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// Konfigurasi Firebase Admin SDK
// Kita akan menggunakan environment variable di Vercel untuk ini
const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('ascii')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const app = express();

// Middleware
app.use(cors({ origin: true }));
app.use(express.json());

// Endpoint API untuk mendapatkan data dompet
app.get('/api/wallet/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const walletQuery = await db.collection('wallets').where('user_id', '==', userId).limit(1).get();

    if (walletQuery.empty) {
      return res.status(404).send({ error: 'Wallet not found for this user.' });
    }

    const walletDoc = walletQuery.docs[0];
    const walletData = walletDoc.data();
    const walletId = walletDoc.id;

    const transactionsQuery = await db.collection('wallets').doc(walletId).collection('transactions').orderBy('created_at', 'desc').get();
    
    const transactions = [];
    transactionsQuery.forEach(doc => {
      transactions.push({ transaction_id: doc.id, ...doc.data() });
    });

    return res.status(200).send({
      wallet_id: walletId,
      ...walletData,
      transactions: transactions
    });
  } catch (error) {
    console.error('Error fetching wallet data:', error);
    return res.status(500).send({ error: 'Internal Server Error' });
  }
});

app.post('/api/submissions', async (req, res) => {
  try {
    // 1. Ambil data yang dikirim dari aplikasi Flutter
    const { userId, categoryId, weightInGrams } = req.body;

    if (!userId || !categoryId || !weightInGrams) {
      return res.status(400).send({ error: 'Missing required fields: userId, categoryId, weightInGrams' });
    }

    // 2. Ambil data kategori sampah untuk mendapatkan harga
    const categoryDoc = await db.collection('wasteCategories').doc(categoryId).get();
    if (!categoryDoc.exists) {
      return res.status(404).send({ error: 'Waste category not found.' });
    }
    const pricePerGram = categoryDoc.data().price_per_gram;
    const categoryName = categoryDoc.data().name;

    // 3. Hitung total harga
    const totalPrice = weightInGrams * pricePerGram;

    // 4. Simpan data submission ke collection 'wasteSubmissions'
    const submissionRef = await db.collection('wasteSubmissions').add({
      user_id: userId,
      category_id: categoryId,
      weight_in_grams: weightInGrams,
      total_price: totalPrice,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 5. Update saldo di 'wallets' dan buat transaksi
    const walletQuery = await db.collection('wallets').where('user_id', '==', userId).limit(1).get();
    if (walletQuery.empty) {
      return res.status(404).send({ error: 'Wallet not found for this user.' });
    }
    const walletDoc = walletQuery.docs[0];
    const walletRef = walletDoc.ref;

    // Gunakan FieldValue.increment() untuk menambah saldo dengan aman
    await walletRef.update({
      balance: admin.firestore.FieldValue.increment(totalPrice),
      last_updated: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Buat catatan transaksi baru di sub-collection
    await walletRef.collection('transactions').add({
      amount: totalPrice,
      type: 'credit',
      description: `Setor ${categoryName} (${weightInGrams} gram)`,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).send({ success: true, message: 'Submission successful, balance updated.', submissionId: submissionRef.id });

  } catch (error) {
    console.error('Error processing submission:', error);
    return res.status(500).send({ error: 'Internal Server Error' });
  }
});

module.exports = app;
