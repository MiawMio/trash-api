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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).send({ error: 'Only GET method is allowed' });

  try {
    const { type } = req.query; // Mengambil tipe dari query parameter
    console.log(`[HANDLER /api/history] Request received for type: ${type}`);

    let collectionName = '';
    let dateField = '';

    if (type === 'submission') {
      collectionName = 'wasteSubmissions';
      dateField = 'processed_at';
    } else if (type === 'withdrawal') {
      collectionName = 'withdrawalRequests';
      dateField = 'processed_at';
    } else {
      return res.status(400).send({ error: "Invalid 'type' parameter. Use 'submission' or 'withdrawal'." });
    }
    
    const snapshot = await db.collection(collectionName)
                              .where('status', 'in', ['approved', 'rejected'])
                              .orderBy(dateField, 'desc')
                              .get();

    if (snapshot.empty) {
      return res.status(200).send([]);
    }

    const history = snapshot.docs.map(doc => {
        const data = doc.data();
        if (data[dateField] && data[dateField].toDate) {
            data[dateField] = data[dateField].toDate().toISOString();
        }
        return { id: doc.id, ...data };
    });

    return res.status(200).send(history);

  } catch (error) {
    console.error(`[HANDLER /api/history] Error for type ${req.query.type}:`, error);
    return res.status(500).send({ error: 'Internal Server Error' });
  }
};
