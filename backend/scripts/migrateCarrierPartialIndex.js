/**
 * One-time migration: convert the Carrier `name` unique index from a plain
 * unique index to a partial one scoped to `isActive: true`, so a soft-deleted
 * (isActive: false) carrier no longer blocks a new carrier from reusing its name.
 *
 * Without this migration, Mongoose's autoIndex will try to create the new
 * partial index on startup and MongoDB will reject it (IndexOptionsConflict)
 * because an index with the same name/keys but different options already
 * exists — the old plain unique index must be dropped first.
 *
 * Run:  node backend/scripts/migrateCarrierPartialIndex.js
 * Safe to re-run: dropIndex/createIndex are both idempotent no-ops if already done.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  try {
    const collection = mongoose.connection.db.collection('carriers');

    try {
      await collection.dropIndex('name_1');
      console.log('Dropped old plain unique index: name_1');
    } catch (e) {
      if (e.codeName === 'IndexNotFound') {
        console.log('Old plain index name_1 not found (already removed).');
      } else {
        console.warn('Warning dropping old index:', e.message);
      }
    }

    await collection.createIndex({ name: 1 }, { unique: true, partialFilterExpression: { isActive: true } });
    console.log('Created partial unique index on { name: 1 } (isActive: true only)');

    console.log('\nMigration complete!');
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

run();
