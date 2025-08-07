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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).send({ error: 'Only GET method is allowed' });
  }

  try {
    const { userId } = req.query; // Mengambil userId dari query parameter
    console.log(`[HANDLER /api/wallet] Getting wallet for userId: ${userId}`);

    if (!userId) {
      return res.status(400).send({ error: 'userId is required.' });
    }

    const walletQuery = await db.collection('wallets').where('user_id', '==', userId).limit(1).get();

    if (walletQuery.empty) {
      return res.status(404).send({ error: 'Wallet not found.' });
    }

    const walletDoc = walletQuery.docs[0];
    const transactionsQuery = await walletDoc.ref.collection('transactions').orderBy('created_at', 'desc').get();

    const transactions = transactionsQuery.docs.map(doc => {
        const data = doc.data();
        // Konversi Firestore Timestamp ke string ISO 8601 agar mudah di-parse di Dart
        if (data.created_at && data.created_at.toDate) {
            data.created_at = data.created_at.toDate().toISOString();
        }
        return { transaction_id: doc.id, ...data };
    });

    return res.status(200).send({
      wallet_id: walletDoc.id,
      ...walletDoc.data(),
      transactions
    });

  } catch (error) {
    console.error('[HANDLER /api/wallet] Error:', error);
    return res.status(500).send({ error: 'Internal Server Error' });
  }
};
