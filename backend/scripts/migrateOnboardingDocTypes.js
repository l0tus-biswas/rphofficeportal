/**
 * One-time migration: copy Onboarding Document Types from a source database
 * into the database this app's own .env points at.
 *
 * Source connection string is NOT hardcoded — pass it via SOURCE_MONGODB_URI so it
 * never ends up committed to the repo.
 *
 * Run:  SOURCE_MONGODB_URI="mongodb+srv://..." node scripts/migrateOnboardingDocTypes.js
 *
 * Safe to re-run: upserts by _id, so already-migrated documents are just overwritten
 * with the latest source value rather than duplicated. _id is preserved so any
 * OnboardingDocument records referencing a doc type stay linked correctly.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');

const SOURCE_URI = process.env.SOURCE_MONGODB_URI;
const DEST_URI = process.env.MONGODB_URI;

if (!SOURCE_URI) {
  console.error('Set SOURCE_MONGODB_URI to the source database connection string.');
  process.exit(1);
}
if (!DEST_URI) {
  console.error('MONGODB_URI is not set (expected in backend/.env).');
  process.exit(1);
}

const COLLECTION = 'onboardingdoctypes';

async function run() {
  const sourceConn = await mongoose.createConnection(SOURCE_URI).asPromise();
  const destConn = await mongoose.createConnection(DEST_URI).asPromise();
  console.log('Connected to source and destination databases.\n');

  try {
    const docs = await sourceConn.db.collection(COLLECTION).find({}).toArray();
    console.log(`Found ${docs.length} document(s) in source ${COLLECTION}.`);

    let upserted = 0;
    for (const doc of docs) {
      await destConn.db.collection(COLLECTION).replaceOne({ _id: doc._id }, doc, { upsert: true });
      console.log(`  copied: ${doc.name}`);
      upserted++;
    }

    console.log(`\nDone — ${upserted} document(s) migrated to ${COLLECTION}.`);
  } finally {
    await sourceConn.close();
    await destConn.close();
  }
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
