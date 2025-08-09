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

    // ================== LOGIKA PERHITUNGAN HARGA YANG DIPERBAIKI ==================
    const categoryData = categoryDoc.data();
    const weight = Number(weightInGrams) || 0;
    let totalPrice = 0;

    // Cek jika harga per kilogram ada, jika tidak, pakai harga per gram
    if (categoryData.price_per_kilogram != null) {
      const pricePerKg = Number(categoryData.price_per_kilogram) || 0;
      totalPrice = (weight / 1000) * pricePerKg; // Ubah gram ke kg, lalu kalikan
    } else if (categoryData.price_per_gram != null) {
      const pricePerGram = Number(categoryData.price_per_gram) || 0;
      totalPrice = weight * pricePerGram;
    }
    // ==============================================================================

    await db.collection('wasteSubmissions').add({
      user_id: userId,
      user_name: userDoc.data().name || 'Unknown User',
      category_id: categoryId,
      category_name: categoryData.name,
      weight_in_grams: weight,
      total_price: totalPrice,
      status: 'pending',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).send({ success: true, message: 'Submission created and is pending approval.' });

  } catch (error) {
    console.error('[HANDLER /api/submissions] Error:', error);
    return res.status(500).send({ error: 'Internal Server Error' });
  }
};
