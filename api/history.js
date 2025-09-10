import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore'; // Impor Timestamp

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
    const limit = parseInt(req.query.limit) || 8;
    const searchQuery = req.query.search || '';
    const dateQuery = req.query.date; // Ambil parameter tanggal (format YYYY-MM-DD)
    const offset = (page - 1) * limit;

    let historyRef = db.collection('wasteSubmissions').where('status', 'in', ['approved', 'rejected']);

    // Filter berdasarkan nama pengguna
    if (searchQuery) {
      historyRef = historyRef.where('user_name', '>=', searchQuery)
                             .where('user_name', '<=', searchQuery + '\uf8ff');
    }

    // Filter berdasarkan tanggal
    if (dateQuery) {
      const startDate = new Date(dateQuery);
      startDate.setHours(0, 0, 0, 0); // Awal hari
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 1); // Akhir hari

      historyRef = historyRef.where('processed_at', '>=', Timestamp.fromDate(startDate))
                             .where('processed_at', '<', Timestamp.fromDate(endDate));
    }
    
    // Urutan query harus konsisten dengan indeks yang akan dibuat
    let orderedQuery = historyRef.orderBy('processed_at', 'desc');
    if (searchQuery) {
      orderedQuery = historyRef.orderBy('user_name').orderBy('processed_at', 'desc');
    }


    const totalSnapshot = await orderedQuery.count().get();
    const totalItems = totalSnapshot.data().count;
    const totalPages = Math.ceil(totalItems / limit);

    const historySnapshot = await orderedQuery
                                  .limit(limit)
                                  .offset(offset)
                                  .get();
    
    const historyList = historySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    return res.status(200).json({
      totalPages: totalPages,
      currentPage: page,
      data: historyList
    });

  } catch (error) {
    console.error('Error fetching submission history:', error);
    return res.status(500).json({ error: 'Failed to load submission history', details: error.message });
  }
}
