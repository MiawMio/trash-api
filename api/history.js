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
    console.log(`[HANDLER /api/history] Request received.`);
    
    // Ambil semua submission yang statusnya BUKAN 'pending'
    const snapshot = await db.collection('wasteSubmissions')
                              .where('status', 'in', ['approved', 'rejected'])
                              .orderBy('processed_at', 'desc') // Urutkan berdasarkan waktu diproses
                              .get();

    if (snapshot.empty) {
      return res.status(200).send([]); // Kirim array kosong jika tidak ada riwayat
    }

    const history = snapshot.docs.map(doc => {
        const data = doc.data();
        // Konversi Timestamp ke string agar mudah di-parse di Dart
        if (data.processed_at && data.processed_at.toDate) {
            data.processed_at = data.processed_at.toDate().toISOString();
        }
        return { id: doc.id, ...data };
    });

    return res.status(200).send(history);

  } catch (error) {
    console.error('[HANDLER /api/history] Error:', error);
    return res.status(500).send({ error: 'Internal Server Error' });
  }
};
