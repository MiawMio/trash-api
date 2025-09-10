import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount)
  });
}

const db = getFirestore();

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 8; // Default 8 data per halaman
    const offset = (page - 1) * limit;

    const historyRef = db.collection('withdrawalRequests').where('status', 'in', ['approved', 'rejected']);
    
    // 1. Ambil total data untuk menghitung total halaman
    const totalSnapshot = await historyRef.count().get();
    const totalItems = totalSnapshot.data().count;
    const totalPages = Math.ceil(totalItems / limit);

    // 2. Ambil data untuk halaman yang diminta
    const historySnapshot = await historyRef
                                  .orderBy('processed_at', 'desc')
                                  .limit(limit)
                                  .offset(offset)
                                  .get();
    
    const historyList = historySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // 3. Kembalikan data beserta informasi halaman
    return res.status(200).json({
      totalPages: totalPages,
      currentPage: page,
      data: historyList,
    });

  } catch (error) {
    console.error('Error fetching withdrawal history:', error);
    return res.status(500).json({ error: 'Failed to load withdrawal history', details: error.message });
  }
}
