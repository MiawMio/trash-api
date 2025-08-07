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

// Export fungsi serverless
module.exports = async (req, res) => {
  // Izinkan CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).send({ error: 'Only POST method is allowed' });
  }

  try {
    const { submissionId } = req.body;
    console.log(`[HANDLER /api/reject] Rejecting submission: ${submissionId}`);

    if (!submissionId) {
        return res.status(400).send({ error: 'submissionId is required.' });
    }

    const submissionRef = db.collection('wasteSubmissions').doc(submissionId);
    const submissionDoc = await submissionRef.get();

    if (!submissionDoc.exists) {
      return res.status(404).send({ error: 'Submission not found.' });
    }
     if (submissionDoc.data().status !== 'pending') {
      return res.status(400).send({ error: 'Submission has already been processed.' });
    }

    await submissionRef.update({
        status: 'rejected',
        processed_at: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.status(200).send({ success: true, message: 'Submission rejected.' });
  } catch (error) {
    console.error('[HANDLER /api/reject] Error:', error);
    return res.status(500).send({ error: 'Internal Server Error' });
  }
};
