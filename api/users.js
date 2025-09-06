// Impor library yang dibutuhkan dari Firebase Admin SDK
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// --- Langkah Kritis: Inisialisasi Firebase Admin ---

// 1. Ambil kredensial dari environment variable yang sudah Anda set di Vercel.
// Pastikan nama variabelnya SAMA PERSIS: GOOGLE_APPLICATION_CREDENTIALS_JSON
const serviceAccount = JSON.parse(
  process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
);

// 2. Inisialisasi aplikasi Firebase Admin HANYA JIKA belum ada.
// Ini penting agar tidak terjadi error inisialisasi ganda di lingkungan serverless.
if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
  });
}

// 3. Dapatkan akses ke database Firestore.
const db = getFirestore();

// --- Handler untuk request API ---
export default async function handler(req, res) {
  // Hanya izinkan metode GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    console.log("Mencoba mengambil koleksi 'users'...");
    
    // Dengan Admin SDK, kita bisa langsung mengambil seluruh koleksi 'users'
    // Aturan keamanan Firestore akan diabaikan oleh panggilan ini.
    const usersSnapshot = await db.collection('users').get();
    
    // Jika tidak ada dokumen sama sekali
    if (usersSnapshot.empty) {
      console.log("Koleksi 'users' kosong.");
      return res.status(200).json([]);
    }

    // Ubah data dari Firestore menjadi format JSON yang kita inginkan
    const usersList = usersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`Berhasil mengambil ${usersList.length} pengguna.`);
    return res.status(200).json(usersList);

  } catch (error) {
    // Jika terjadi error, catat di log Vercel dan kirim response error
    console.error('Terjadi error saat mengambil data pengguna:', error);
    return res.status(500).json({ 
      error: 'Gagal mengambil data dari server.', 
      details: error.message 
    });
  }
}
