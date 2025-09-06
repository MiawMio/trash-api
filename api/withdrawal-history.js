import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Inisialisasi Firebase Admin SDK dari environment variable
const serviceAccount = JSON.parse(
  process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
);

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
  });
}

const db = getFirestore();

// Handler untuk request API
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    console.log("Mencoba mengambil riwayat penarikan...");

    // Mengambil data dari koleksi 'withdrawalRequests' yang statusnya BUKAN 'pending'
    const historySnapshot = await db.collection('withdrawalRequests')
                                    .where('status', 'in', ['approved', 'rejected'])
                                    .orderBy('processed_at', 'desc')
                                    .get();
    
    if (historySnapshot.empty) {
      console.log("Tidak ada riwayat penarikan.");
      return res.status(200).json([]);
    }

    // Ubah data menjadi format JSON
    const historyList = historySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`Berhasil mengambil ${historyList.length} data riwayat penarikan.`);
    return res.status(200).json(historyList);

  } catch (error) {
    console.error('Error saat mengambil riwayat penarikan:', error);
    return res.status(500).json({ 
      error: 'Gagal mengambil data dari server.', 
      details: error.message 
    });
  }
}
