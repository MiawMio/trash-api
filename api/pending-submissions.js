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

// Handler untuk API
export default async function handler(req, res) {
  // Hanya izinkan metode GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Ambil userId dari query parameter
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  try {
    // Query ke Firestore untuk mendapatkan data submission dengan status 'pending'
    // untuk userId yang spesifik.
    const submissionsSnapshot = await db.collection('wasteSubmissions')
                                        .where('user_id', '==', userId)
                                        .where('status', '==', 'pending')
                                        .orderBy('created_at', 'desc')
                                        .get();

    if (submissionsSnapshot.empty) {
      return res.status(200).json([]);
    }

    // Ubah data menjadi format JSON
    const pendingList = submissionsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    return res.status(200).json(pendingList);

  } catch (error) {
    console.error('Error fetching pending submissions:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch pending submissions from server.', 
      details: error.message 
    });
  }
}
