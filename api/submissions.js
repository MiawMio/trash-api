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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send({ error: 'Only POST method is allowed' });

  try {
    const { userId, categoryId, weightInGrams } = req.body;
    console.log(`[HANDLER /api/submissions] Request received:`, req.body);

    if (!userId || !categoryId || !weightInGrams) {
      return res.status(400).send({ error: 'Missing required fields.' });
    }
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
        return res.status(404).send({ error: 'User not found.' });
    }
    const categoryDoc = await db.collection('wasteCategories').doc(categoryId).get();
    if (!categoryDoc.exists) {
      return res.status(404).send({ error: 'Waste category not found.' });
    }
    
    // ================== BAGIAN YANG DIPERBAIKI ==================
    // Pastikan kedua nilai adalah angka sebelum dikalikan
    const pricePerGram = Number(categoryDoc.data().price_per_gram || 0);
    const weight = Number(weightInGrams || 0);
    const totalPrice = weight * pricePerGram;
    // ==========================================================

    const categoryName = categoryDoc.data().name;

    await db.collection('wasteSubmissions').add({
      user_id: userId,
      user_name: userDoc.data().name || 'Unknown User',
      category_id: categoryId,
      category_name: categoryName,
      weight_in_grams: weight,
      total_price: totalPrice, // Sekarang dijamin angka
      status: 'pending',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).send({ success: true, message: 'Submission created and is pending approval.' });
    
  } catch (error) {
    console.error('[HANDLER /api/submissions] Error:', error);
    return res.status(500).send({ error: 'Internal Server Error' });
  }
};
