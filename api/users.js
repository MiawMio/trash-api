const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Ambil kredensial dari environment variable yang sudah diset di Vercel
const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);

// Inisialisasi Firebase Admin SDK (hanya sekali)
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
    // Dengan Admin SDK, kita bisa langsung mengambil seluruh koleksi 'users'
    const usersSnapshot = await db.collection('users').get();
    
    if (usersSnapshot.empty) {
      return res.status(200).json([]);
    }

    const usersList = usersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json(usersList);

  } catch (error) {
    console.error('Error fetching users:', error);
    // Kirim pesan error yang lebih deskriptif
    return res.status(500).json({ error: 'Failed to load users from server', details: error.message });
  }
}
