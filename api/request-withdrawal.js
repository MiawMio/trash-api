const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// Inisialisasi Firebase Admin
try {
  if (!admin.apps.length) {
    const serviceAccount = JSON.parse(
      Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('ascii')
    );
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }
} catch (error) {
  console.error("Firebase Admin initialization error:", error);
}

const db = admin.firestore();
const app = express();

app.use(cors({ origin: true }));
app.use(express.json());

// Endpoint untuk mengajukan penarikan
app.post('/api/request-withdrawal', async (req, res) => {
  try {
    const { userId, amount } = req.body;
    console.log(`[HANDLER /api/request-withdrawal] Request from ${userId} for ${amount}`);

    if (!userId || !amount || amount <= 0) {
      return res.status(400).send({ error: 'User ID and a valid amount are required.' });
    }

    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
        return res.status(404).send({ error: 'User not found.' });
    }

    const walletQuery = await db.collection('wallets').where('user_id', '==', userId).limit(1).get();
    if (walletQuery.empty) {
        return res.status(404).send({ error: 'Wallet not found for this user.' });
    }

    const walletData = walletQuery.docs[0].data();
    if (walletData.balance < amount) {
        return res.status(400).send({ error: 'Insufficient balance.' });
    }

    await db.collection('withdrawalRequests').add({
      user_id: userId,
      user_name: userDoc.data().name || 'Unknown User',
      amount: amount,
      status: 'pending',
      requested_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).send({ success: true, message: 'Withdrawal request submitted successfully.' });
  } catch (error) {
    console.error('[HANDLER /api/request-withdrawal] Error:', error);
    return res.status(500).send({ error: 'Internal Server Error' });
  }
});

module.exports = app;
