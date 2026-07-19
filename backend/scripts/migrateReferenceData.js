/**
 * One-time migration: copy reference data (Carrier Management, Product Management,
 * Promotion Management, Training Materials, Printful Configuration) from a source
 * database into the database this app's own .env points at.
 *
 * Source connection string is NOT hardcoded — pass it via SOURCE_MONGODB_URI so it
 * never ends up committed to the repo.
 *
 * Run:  SOURCE_MONGODB_URI="mongodb+srv://..." node scripts/migrateReferenceData.js
 *
 * Safe to re-run: upserts by _id, so already-migrated documents are just overwritten
 * with the latest source value rather than duplicated.
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

// Straight collection copies (Carrier Management, Product Management, Promotion
// Management, Training Materials) — preserve _id so cross-references stay intact.
const PLAIN_COLLECTIONS = [
  'carriers',
  'producttypes',
  'promotionlevels',
  'trainingcategories',
  'trainingfolders',
  'trainingmaterials',
];

// trainingcategories has a unique index on `name`. If the destination already has a
// real, independently-created category with the same name (different _id), rename
// the incoming one on import instead of overwriting/skipping it.
const UNIQUE_NAME_COLLECTIONS = new Set(['trainingcategories']);

// Printful Configuration lives in SystemConfig, mixed in with unrelated app config —
// only copy keys that are actually Printful-related.
const PRINTFUL_KEY_PREFIX = 'printful';

async function copyCollection(sourceDb, destDb, name) {
  const docs = await sourceDb.collection(name).find({}).toArray();
  let upserted = 0;
  let renamed = 0;
  for (const doc of docs) {
    if (UNIQUE_NAME_COLLECTIONS.has(name) && doc.name) {
      const conflict = await destDb.collection(name).findOne({ name: doc.name, _id: { $ne: doc._id } });
      if (conflict) {
        doc.name = `${doc.name} (imported)`;
        renamed++;
      }
    }
    await destDb.collection(name).replaceOne({ _id: doc._id }, doc, { upsert: true });
    upserted++;
  }
  console.log(`  ${name}: ${upserted} document(s) copied${renamed ? ` (${renamed} renamed to avoid a name conflict)` : ''}`);
  return upserted;
}

async function copyPrintfulConfig(sourceDb, destDb) {
  const docs = await sourceDb.collection('systemconfigs')
    .find({ key: { $regex: `^${PRINTFUL_KEY_PREFIX}`, $options: 'i' } })
    .toArray();
  let upserted = 0;
  for (const doc of docs) {
    await destDb.collection('systemconfigs').replaceOne({ _id: doc._id }, doc, { upsert: true });
    upserted++;
  }
  console.log(`  systemconfigs (printful_* keys): ${upserted} document(s) copied`);
  return upserted;
}

async function run() {
  const sourceConn = await mongoose.createConnection(SOURCE_URI).asPromise();
  const destConn = await mongoose.createConnection(DEST_URI).asPromise();
  console.log('Connected to source and destination databases.\n');

  try {
    console.log('Copying reference data:');
    let total = 0;
    for (const name of PLAIN_COLLECTIONS) {
      total += await copyCollection(sourceConn.db, destConn.db, name);
    }
    total += await copyPrintfulConfig(sourceConn.db, destConn.db);

    console.log(`\nDone — ${total} document(s) migrated in total.`);
  } finally {
    await sourceConn.close();
    await destConn.close();
  }
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
