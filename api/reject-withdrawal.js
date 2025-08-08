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
    console.log(`[HANDLER /api/reject-withdrawal] Rejecting request: ${requestId}`);

    if (!requestId) {
      return res.status(400).send({ error: 'Request ID is required.' });
    }

    const requestRef = db.collection('withdrawalRequests').doc(requestId);
    await requestRef.update({
      status: 'rejected',
      processed_at: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(200).send({ success: true, message: 'Withdrawal rejected.' });
  } catch (error) {
    console.error('[HANDLER /api/reject-withdrawal] Error:', error);
    return res.status(500).send({ error: 'Internal Server Error' });
  }
};
