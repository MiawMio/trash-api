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
    
    // Pengecekan untuk memastikan totalPrice adalah angka
    if (typeof totalPrice !== 'number') {
      console.error(`Invalid 'total_price' for submission ${submissionId}. Found:`, totalPrice);
      return res.status(400).send({ error: `Data 'total_price' tidak valid untuk setoran ini.` });
    }

    const walletQuery = await db.collection('wallets').where('user_id', '==', userId).limit(1).get();
    if (walletQuery.empty) {
        return res.status(404).send({ error: 'Wallet not found for this user.' });
    }
    const walletRef = walletQuery.docs[0].ref;

    // Lakukan operasi dalam batch agar aman
    const batch = db.batch();
    
    // 1. Update saldo dompet
    batch.update(walletRef, {
        balance: admin.firestore.FieldValue.increment(totalPrice),
        last_updated: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 2. Buat catatan transaksi baru
    const transactionRef = walletRef.collection('transactions').doc();
    batch.set(transactionRef, {
        amount: totalPrice, // Memastikan totalPrice yang benar digunakan di sini
        type: 'credit',
        description: `Setor ${categoryName} (${weightInGrams} gram)`,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 3. Update status pengajuan
    batch.update(submissionRef, {
        status: 'approved',
        processed_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    await batch.commit();
    
    return res.status(200).send({ success: true, message: 'Submission approved.' });
  } catch (error) {
    console.error('[HANDLER /api/approve] Error:', error);
    return res.status(500).send({ error: 'Internal Server Error' });
  }
};
