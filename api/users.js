import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Inisialisasi Firebase Admin SDK
const serviceAccount = JSON.parse(
  process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
);

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount)
  });
}

const db = getFirestore();

// Handler untuk API
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const usersSnapshot = await db.collection('users').get();
    
    if (usersSnapshot.empty) {
      return res.status(200).json([]);
    }

    // Gunakan Promise.all untuk mengambil data dompet secara paralel agar lebih efisien
    const usersWithBalance = await Promise.all(
      usersSnapshot.docs.map(async (userDoc) => {
        const userData = userDoc.data();
        let balance = 0; // Default balance

        // Cari dokumen di koleksi 'wallets' yang cocok dengan user_id
        const walletQuery = await db.collection('wallets').where('user_id', '==', userDoc.id).limit(1).get();
        
        if (!walletQuery.empty) {
          const walletData = walletQuery.docs[0].data();
          balance = walletData.balance || 0;
        }

        // Gabungkan data pengguna dengan saldo
        return {
          id: userDoc.id,
          name: userData.name || 'No Name',
          email: userData.email || 'No Email',
          role: userData.role || 'user',
          balance: balance, // Tambahkan field balance
        };
      })
    );

    return res.status(200).json(usersWithBalance);

  } catch (error) {
    console.error('Error fetching users with balance:', error);
    return res.status(500).json({ error: 'Failed to load users from server', details: error.message });
  }
}
