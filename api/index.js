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

// Export aplikasi Express agar Vercel bisa menjalankannya
module.exports = app;