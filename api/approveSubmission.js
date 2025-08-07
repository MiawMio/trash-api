const admin = require('firebase-admin');
const initializeApp = require('./_firebaseAdmin'); // Buat file ini agar tidak mengulang init terus
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const db = admin.firestore();
    const { submissionId } = req.body;
    
    if (!submissionId) return res.status(400).send({ error: 'submissionId is required.' });

    const submissionRef = db.collection('wasteSubmissions').doc(submissionId);
    const submissionDoc = await submissionRef.get();
    if (!submissionDoc.exists) return res.status(404).send({ error: 'Submission not found.' });
    if (submissionDoc.data().status !== 'pending') {
      return res.status(400).send({ error: 'Submission has already been processed.' });
    }

    const { user_id, total_price, category_name, weight_in_grams } = submissionDoc.data();
    const walletQuery = await db.collection('wallets').where('user_id', '==', user_id).limit(1).get();
    if (walletQuery.empty) return res.status(404).send({ error: 'Wallet not found for this user.' });

    const walletRef = walletQuery.docs[0].ref;

    const batch = db.batch();
    batch.update(walletRef, {
      balance: admin.firestore.FieldValue.increment(total_price),
      last_updated: admin.firestore.FieldValue.serverTimestamp(),
    });

    const transactionRef = walletRef.collection('transactions').doc();
    batch.set(transactionRef, {
      amount: total_price,
      type: 'credit',
      description: `Setor ${category_name} (${weight_in_grams} gram)`,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    batch.update(submissionRef, {
      status: 'approved',
      processed_at: admin.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();
    return res.status(200).send({ success: true, message: 'Submission approved.' });
  } catch (error) {
    console.error(error);
    return res.status(500).send({ error: 'Internal Server Error' });
  }
};
