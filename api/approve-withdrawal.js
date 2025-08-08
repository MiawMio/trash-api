const admin = require('firebase-admin');

try {
  if (!admin.apps.length) {
    const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('ascii'));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
} catch (error) {
  console.error("Firebase Admin initialization error:", error);
}

const db = admin.firestore();

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send({ error: 'Only POST method is allowed' });

  try {
    const { requestId } = req.body;
    console.log(`[HANDLER /api/approve-withdrawal] Approving request: ${requestId}`);

    if (!requestId) {
      return res.status(400).send({ error: 'Request ID is required.' });
    }

    const requestRef = db.collection('withdrawalRequests').doc(requestId);
    const requestDoc = await requestRef.get();

    if (!requestDoc.exists || requestDoc.data().status !== 'pending') {
      return res.status(400).send({ error: 'Request not found or already processed.' });
    }

    const { user_id: userId, amount } = requestDoc.data();
    const walletQuery = await db.collection('wallets').where('user_id', '==', userId).limit(1).get();
    if (walletQuery.empty) {
      return res.status(404).send({ error: 'Wallet not found.' });
    }

    const walletRef = walletQuery.docs[0].ref;
    const walletData = walletQuery.docs[0].data();

    if (walletData.balance < amount) {
      await requestRef.update({ status: 'rejected', reason: 'Insufficient balance' });
      return res.status(400).send({ error: 'Insufficient balance at time of approval.' });
    }

    const batch = db.batch();
    batch.update(walletRef, {
      balance: admin.firestore.FieldValue.increment(-amount)
    });
    batch.set(walletRef.collection('transactions').doc(), {
      amount: amount,
      type: 'debit',
      description: 'Penarikan Dana',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    batch.update(requestRef, {
      status: 'approved',
      processed_at: admin.firestore.FieldValue.serverTimestamp()
    });
    await batch.commit();

    return res.status(200).send({ success: true, message: 'Withdrawal approved.' });
  } catch (error) {
    console.error('[HANDLER /api/approve-withdrawal] Error:', error);
    return res.status(500).send({ error: 'Internal Server Error' });
  }
};
