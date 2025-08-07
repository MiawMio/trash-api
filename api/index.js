const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('ascii')
);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();
const app = express();

app.use(cors({ origin: true }));
app.use(express.json());

app.get('/api/wallet/:userId', async (req, res) => {
  console.log(`[GET /api/wallet/:userId] Request received for userId: ${req.params.userId}`);
  try {
    const userId = req.params.userId;
    const walletQuery = await db.collection('wallets').where('user_id', '==', userId).limit(1).get();

    if (walletQuery.empty) {
      console.log(`[GET /api/wallet/:userId] Wallet not found for user: ${userId}`);
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

    console.log(`[GET /api/wallet/:userId] Successfully fetched data for user: ${userId}`);
    return res.status(200).send({
      wallet_id: walletId,
      ...walletData,
      transactions: transactions
    });
  } catch (error) {
    console.error('[GET /api/wallet/:userId] Critical Error:', error);
    return res.status(500).send({ error: 'Internal Server Error' });
  }
});

app.post('/api/submissions', async (req, res) => {
  console.log('[POST /api/submissions] Request received.');
  console.log('[POST /api/submissions] Request Body:', req.body);
  try {
    const { userId, categoryId, weightInGrams } = req.body;

    if (!userId || !categoryId || !weightInGrams) {
      return res.status(400).send({ error: 'Missing required fields' });
    }

    const categoryDoc = await db.collection('wasteCategories').doc(categoryId).get();
    if (!categoryDoc.exists) {
      return res.status(404).send({ error: 'Waste category not found.' });
    }
    const { price_per_gram: pricePerGram, name: categoryName } = categoryDoc.data();

    const totalPrice = weightInGrams * pricePerGram;

    await db.collection('wasteSubmissions').add({
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
    const walletRef = walletQuery.docs[0].ref;

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

    console.log('[POST /api/submissions] Submission successful.');
    return res.status(200).send({ success: true, message: 'Submission successful, balance updated.' });

  } catch (error) {
    console.error('[POST /api/submissions] Critical Error:', error);
    return res.status(500).send({ error: 'Internal Server Error' });
  }
});

module.exports = app;
