import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Inisialisasi Firebase Admin SDK
const serviceAccount = JSON.parse(
  process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
);

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
  });
}

const db = getFirestore();

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  try {
    // Query ke Firestore untuk mendapatkan data penarikan dengan status 'pending'
    const snapshot = await db.collection('withdrawalRequests')
                               .where('user_id', '==', userId)
                               .where('status', '==', 'pending')
                               .orderBy('requested_at', 'desc')
                               .get();

    if (snapshot.empty) {
      return res.status(200).json([]);
    }

    const pendingList = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    return res.status(200).json(pendingList);

  } catch (error) {
    console.error('Error fetching pending withdrawals:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch pending withdrawals from server.', 
      details: error.message 
    });
  }
}
