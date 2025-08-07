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
    console.log(`[HANDLER /api/approve] Approving submission: ${submissionId}`);

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

    const { user_id: userId, total_price: totalPrice, category_name: categoryName, weight_in_grams: weightInGrams } = submissionDoc.data();
    const walletQuery = await db.collection('wallets').where('user_id', '==', userId).limit(1).get();
    if (walletQuery.empty) {
        return res.status(404).send({ error: 'Wallet not found for this user.' });
    }
    const walletRef = walletQuery.docs[0].ref;

    // Lakukan operasi satu per satu
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

    await submissionRef.update({
        status: 'approved',
        processed_at: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(200).send({ success: true, message: 'Submission approved.' });
  } catch (error) {
    console.error('[HANDLER /api/approve] Error:', error);
    return res.status(500).send({ error: 'Internal Server Error' });
  }
};
