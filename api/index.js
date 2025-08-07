const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// Konfigurasi Firebase Admin SDK
const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('ascii')
);

// Hindari inisialisasi ganda
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();
const app = express();

// Middleware
app.use(cors({ origin: true }));
app.use(express.json());

// Endpoint untuk mendapatkan data dompet
// Path diubah dari '/api/wallet/:userId' menjadi '/wallet/:userId'
app.get('/wallet/:userId', async (req, res) => {
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

// Endpoint untuk submission sampah
// Path diubah dari '/api/submissions' menjadi '/submissions'
app.post('/submissions', async (req, res) => {
  try {
    const { userId, categoryId, weightInGrams } = req.body;

    if (!userId || !categoryId || !weightInGrams) {
      return res.status(400).send({ error: 'Missing required fields: userId, categoryId, weightInGrams' });
    }

    const categoryDoc = await db.collection('wasteCategories').doc(categoryId).get();
    if (!categoryDoc.exists) {
      return res.status(404).send({ error: 'Waste category not found.' });
    }
    const pricePerGram = categoryDoc.data().price_per_gram;
    const categoryName = categoryDoc.data().name;

    const totalPrice = weightInGrams * pricePerGram;

    const submissionRef = await db.collection('wasteSubmissions').add({
      user_id: userId,
      category_id: categoryId,
      weight_in_grams: weightInGrams,
      total_price: totalPrice,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    const walletQuery = await db.collection('wallets').where('user_id', '==', userId).limit(1).get();
    if (walletQuery.empty) {
      return res.status(404).send({ error: 'Wallet not found for this user.' });
    }
    const walletDoc = walletQuery.docs[0];
    const walletRef = walletDoc.ref;

    await walletRef.update({
      balance: admin.firestore.FieldValue.increment(totalPrice),
      last_updated: admin.firestore.FieldValue.serverTimestamp(),
    });

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


// Export aplikasi Express agar Vercel bisa menjalankannya
module.exports = app;
