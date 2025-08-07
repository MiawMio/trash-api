const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// Inisialisasi Firebase Admin SDK
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

// Endpoint untuk mendapatkan data dompet
app.get('/api/wallet/:userId', async (req, res) => {
  console.log(`[GET /api/wallet/:userId] Request for userId: ${req.params.userId}`);
  try {
    const userId = req.params.userId;
    const walletQuery = await db.collection('wallets').where('user_id', '==', userId).limit(1).get();

    if (walletQuery.empty) {
      return res.status(404).send({ error: 'Wallet not found.' });
    }

    const walletDoc = walletQuery.docs[0];
    const transactionsQuery = await walletDoc.ref.collection('transactions').orderBy('created_at', 'desc').get();
    
    const transactions = transactionsQuery.docs.map(doc => ({ transaction_id: doc.id, ...doc.data() }));

    return res.status(200).send({
      wallet_id: walletDoc.id,
      ...walletDoc.data(),
      transactions
    });
  } catch (error) {
    console.error('[GET /api/wallet/:userId] Error:', error);
    return res.status(500).send({ error: 'Internal Server Error' });
  }
});

// Endpoint untuk mendapatkan kategori sampah
app.get('/api/waste-categories', async (req, res) => {
  console.log(`[GET /api/waste-categories] Request received.`);
  try {
    const snapshot = await db.collection('wasteCategories').get();
    if (snapshot.empty) {
      return res.status(404).send({ error: 'No waste categories found.' });
    }
    const categories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return res.status(200).send(categories);
  } catch (error) {
    console.error('[GET /api/waste-categories] Error:', error);
    return res.status(500).send({ error: 'Internal Server Error' });
  }
});


// Endpoint User mengajukan setoran (status pending)
app.post('/api/submissions', async (req, res) => {
  console.log('[POST /api/submissions] Request received with body:', req.body);
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

    // INI BAGIAN PENTINGNYA
    await db.collection('wasteSubmissions').add({
      user_id: userId,
      user_name: userDoc.data().name || 'Unknown User',
      category_id: categoryId,
      category_name: categoryName,
      weight_in_grams: weightInGrams,
      total_price: totalPrice,
      status: 'pending', // Status awal adalah 'pending'
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).send({ success: true, message: 'Submission created and is pending approval.' });

  } catch (error) {
    console.error('[POST /api/submissions] Error:', error);
    return res.status(500).send({ error: 'Internal Server Error' });
  }
});

// Endpoint Admin menyetujui setoran
app.post('/api/submissions/:submissionId/approve', async (req, res) => {
  console.log(`[POST /approve] Approving submission: ${req.params.submissionId}`);
  try {
    const submissionId = req.params.submissionId;
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
    console.error('[POST /approve] Error:', error);
    return res.status(500).send({ error: 'Internal Server Error' });
  }
});

// Endpoint Admin menolak setoran
app.post('/api/submissions/:submissionId/reject', async (req, res) => {
  console.log(`[POST /reject] Rejecting submission: ${req.params.submissionId}`);
  try {
    const submissionId = req.params.submissionId;
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
    console.error('[POST /reject] Error:', error);
    return res.status(500).send({ error: 'Internal Server Error' });
  }
});


module.exports = app;
