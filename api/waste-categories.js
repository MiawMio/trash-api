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
    console.log(`[HANDLER /api/waste-categories] Request received.`);
    const snapshot = await db.collection('wasteCategories').get();

    if (snapshot.empty) {
      return res.status(404).send({ error: 'No waste categories found.' });
    }

    const categories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return res.status(200).send(categories);

  } catch (error) {
    console.error('[HANDLER /api/waste-categories] Error:', error);
    return res.status(500).send({ error: 'Internal Server Error' });
  }
};
