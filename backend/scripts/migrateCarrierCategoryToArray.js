/**
 * Migrate carrier `category` from a single string to an array of strings.
 * If the same carrier name exists under multiple categories (duplicate entries),
 * they are merged into a single document with all categories combined.
 * Also drops the old compound unique index (name + category) and ensures the new name-only index.
 *
 * Run:  node backend/scripts/migrateCarrierCategoryToArray.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

async function migrate() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('carriers');

    // ---------------------------------------------------------------
    // Step 1: Find and merge duplicate carrier names
    // ---------------------------------------------------------------
    const duplicates = await collection.aggregate([
      { $group: { _id: { name: { $toLower: '$name' } }, count: { $sum: 1 }, docs: { $push: '$$ROOT' } } },
      { $match: { count: { $gt: 1 } } }
    ]).toArray();

    let merged = 0;
    for (const dup of duplicates) {
      const docs = dup.docs;
      // Keep the first doc, merge category + fields from the rest
      const keep = docs[0];
      const allCategories = new Set();
      const allProductFactors = keep.productFactors ? [...keep.productFactors] : [];

      for (const doc of docs) {
        // Collect categories (handle both string and array)
        const cats = Array.isArray(doc.category) ? doc.category : [doc.category];
        cats.forEach(c => { if (c) allCategories.add(c); });

        // Merge product factors from other docs
        if (doc._id.toString() !== keep._id.toString() && doc.productFactors) {
          allProductFactors.push(...doc.productFactors);
        }
      }

      // Update the kept doc with merged data
      const updateData = { category: [...allCategories] };
      if (allProductFactors.length > 0) updateData.productFactors = allProductFactors;
      // Merge optional fields: prefer non-empty values
      for (const field of ['contractingLink', 'contractingInstructions', 'whatToExpect', 'supplementalLevelGuide', 'notes']) {
        const best = docs.find(d => d[field] && d[field].trim());
        if (best && best[field]) updateData[field] = best[field];
      }
      // Use the higher factor if set
      const factors = docs.map(d => d.factor).filter(f => f != null);
      if (factors.length > 0) updateData.factor = Math.max(...factors);

      await collection.updateOne({ _id: keep._id }, { $set: updateData });

      // Delete the duplicate docs
      const idsToRemove = docs.filter(d => d._id.toString() !== keep._id.toString()).map(d => d._id);
      await collection.deleteMany({ _id: { $in: idsToRemove } });

      console.log(`  ⚡ Merged ${docs.length} duplicates of "${keep.name}" → categories: [${[...allCategories].join(', ')}]`);
      merged += idsToRemove.length;
    }

    if (merged > 0) {
      console.log(`\nMerged ${merged} duplicate carrier(s).`);
    } else {
      console.log('No duplicate carrier names found.');
    }

    // ---------------------------------------------------------------
    // Step 2: Convert remaining string categories → arrays
    // ---------------------------------------------------------------
    const cursor = collection.find({ category: { $type: 'string' } });
    let converted = 0;

    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      await collection.updateOne(
        { _id: doc._id },
        { $set: { category: [doc.category] } }
      );
      converted++;
      console.log(`  ✓ ${doc.name}: "${doc.category}" → ["${doc.category}"]`);
    }

    console.log(`\nConverted ${converted} carrier(s) to array category.`);

    // ---------------------------------------------------------------
    // Step 3: Drop old indexes and create new one
    // ---------------------------------------------------------------
    try {
      await collection.dropIndex('name_1_category_1');
      console.log('Dropped old compound index: name_1_category_1');
    } catch (e) {
      if (e.codeName === 'IndexNotFound') {
        console.log('Old compound index name_1_category_1 not found (already removed).');
      } else {
        console.warn('Warning dropping old index:', e.message);
      }
    }

    // Ensure the new unique name-only index
    await collection.createIndex({ name: 1 }, { unique: true });
    console.log('Created unique index on { name: 1 }');

    console.log('\nMigration complete!');
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

migrate();
