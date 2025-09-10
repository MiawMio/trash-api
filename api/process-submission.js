const admin = require('firebase-admin');

// Inisialisasi Firebase Admin (hanya sekali)
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
    // Ambil 'action' dan 'submissionId' dari body request
    const { submissionId, action } = req.body;
    
    console.log(`[HANDLER /api/process-submission] Action: ${action}, ID: ${submissionId}`);

    if (!submissionId || !action) {
      return res.status(400).send({ error: 'submissionId and action are required.' });
    }
    
    // Logika umum untuk kedua aksi
    const submissionRef = db.collection('wasteSubmissions').doc(submissionId);
    const submissionDoc = await submissionRef.get();

    if (!submissionDoc.exists) {
      return res.status(404).send({ error: 'Submission not found.' });
    }
    if (submissionDoc.data().status !== 'pending') {
      return res.status(400).send({ error: 'Submission has already been processed.' });
    }

    // --- BAGIAN KONDISIONAL BERDASARKAN AKSI ---

    if (action === 'approve') {
      // Logika dari approve.js
      const { user_id: userId, total_price: totalPrice, category_name: categoryName, weight_in_grams: weightInGrams } = submissionDoc.data();
      
      if (typeof totalPrice !== 'number') {
        return res.status(400).send({ error: 'Invalid total_price data for this submission.' });
      }

      const walletQuery = await db.collection('wallets').where('user_id', '==', userId).limit(1).get();
      if (walletQuery.empty) {
        return res.status(404).send({ error: 'Wallet not found for this user.' });
      }
      const walletRef = walletQuery.docs[0].ref;

      const batch = db.batch();
      
      batch.update(walletRef, {
        balance: admin.firestore.FieldValue.increment(totalPrice),
        last_updated: admin.firestore.FieldValue.serverTimestamp(),
      });

      const transactionRef = walletRef.collection('transactions').doc();
      batch.set(transactionRef, {
        amount: totalPrice,
        type: 'credit',
        description: `Setor ${categoryName} (${weightInGrams} gram)`,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      batch.update(submissionRef, {
        status: 'approved',
        processed_at: admin.firestore.FieldValue.serverTimestamp()
      });
      
      await batch.commit();
      return res.status(200).send({ success: true, message: 'Submission approved.' });

    } else if (action === 'reject') {
      // Logika dari reject.js
      await submissionRef.update({
        status: 'rejected',
        processed_at: admin.firestore.FieldValue.serverTimestamp()
      });
      return res.status(200).send({ success: true, message: 'Submission rejected.' });

    } else {
      return res.status(400).send({ error: 'Invalid action provided.' });
    }

  } catch (error) {
    console.error('[HANDLER /api/process-submission] Error:', error);
    return res.status(500).send({ error: 'Internal Server Error' });
  }
};
