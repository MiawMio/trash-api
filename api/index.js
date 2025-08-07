const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

try {
  const serviceAccount = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('ascii')
  );

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }
} catch (error) {
  console.error("Firebase Admin initialization error:", error);
}

const db = admin.firestore();
const app = express();

app.use(cors({ origin: true }));
app.use(express.json());

// Endpoint untuk mendapatkan kategori sampah
app.get('/api/waste-categories', async (req, res) => {
  try {
    const snapshot = await db.collection('wasteCategories').get();
    if (snapshot.empty) {
      return res.status(404).send({ error: 'No waste categories found.' });
    }
    const categories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return res.status(200).send(categories);
  } catch (error) {
    return res.status(500).send({ error: 'Internal Server Error' });
  }
});

// Endpoint User mengajukan setoran
app.post('/api/submissions', async (req, res) => {
  try {
    const { userId, categoryId, weightInGrams } = req.body;
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
    const { price_per_gram: pricePerGram, name: categoryName } = categoryDoc.data();
    const totalPrice = weightInGrams * pricePerGram;

    await db.collection('wasteSubmissions').add({
      user_id: userId,
      user_name: userDoc.data().name || 'Unknown User',
      category_id: categoryId,
      category_name: categoryName,
      weight_in_grams: weightInGrams,
      total_price: totalPrice,
      status: 'pending',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    return res.status(200).send({ success: true, message: 'Submission created and is pending approval.' });
  } catch (error) {
    console.error('[POST /api/submissions] Error:', error);
    return res.status(500).send({ error: 'Internal Server Error' });
  }
});

// ENDPOINT APPROVE (VERSI PRODUKSI)
app.post('/api/confirm-submission', async (req, res) => {
  try {
    const { submissionId } = req.body;
    console.log(`[POST /confirm-submission] PRODUCTION MODE: Approving submission: ${submissionId}`);

    if (!submissionId) {
        return res.status(400).send({ error: 'submissionId is required.' });
    }

    const submissionRef = db.collection('wasteSubmissions').doc(submissionId);
    const submissionDoc = await submissionRef.get();

    if (!submissionDoc.exists) {
      return res.status(404).send({ error: 'Submission not found.' });
    }
    if (submissionDoc.data().status !== 'pending') {
      return res.status(400).send({ error: 'Submission has already been processed.' });
    }

    const { user_id: userId, total_price: totalPrice, category_name: categoryName, weight_in_grams: weightInGrams } = submissionDoc.data();
    const walletQuery = await db.collection('wallets').where('user_id', '==', userId).limit(1).get();
    if (walletQuery.empty) {
        return res.status(404).send({ error: 'Wallet not found for this user.' });
    }
    const walletRef = walletQuery.docs[0].ref;

    const batch = db.batch();
    batch.update(walletRef, {
        balance: admin.firestore.FieldValue.increment(totalPrice),
        last_updated: admin.firestore.FieldValue.serverTimestamp(),
    });

    const transactionRef = walletRef.collection('transactions').doc();
    batch.set(transactionRef, {
        amount: totalPrice,
        type: 'credit',
        description: `Setor ${categoryName} (${weightInGrams} gram)`,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    batch.update(submissionRef, {
        status: 'approved',
        processed_at: admin.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();
    
    return res.status(200).send({ success: true, message: 'Submission approved and balance updated.' });
  } catch (error) {
    console.error('[POST /confirm-submission] Error:', error);
    return res.status(500).send({ error: 'Internal Server Error' });
  }
});

// ENDPOINT REJECT (TIDAK BERUBAH)
app.post('/api/rejectSubmission', async (req, res) => {
  try {
    const { submissionId } = req.body;
    console.log(`[POST /rejectSubmission] Rejecting submission: ${submissionId}`);

     if (!submissionId) {
        return res.status(400).send({ error: 'submissionId is required.' });
    }

    const submissionRef = db.collection('wasteSubmissions').doc(submissionId);
    const submissionDoc = await submissionRef.get();

    if (!submissionDoc.exists) {
      return res.status(404).send({ error: 'Submission not found.' });
    }
     if (submissionDoc.data().status !== 'pending') {
      return res.status(400).send({ error: 'Submission has already been processed.' });
    }

    await submissionRef.update({
        status: 'rejected',
        processed_at: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.status(200).send({ success: true, message: 'Submission rejected.' });
  } catch (error) {
    console.error('[POST /rejectSubmission] Error:', error);
    return res.status(500).send({ error: 'Internal Server Error' });
  }
});

module.exports = app;
