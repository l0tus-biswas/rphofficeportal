/**
 * Migration: Re-map productCategory on existing ProductionSubmission records
 * to the new 7-category structure (March 2026 client update).
 *
 * What this does:
 *   - Finds all records where productCategory is one of the OLD values:
 *       'Life & Supplemental', 'ACA', or is missing/null
 *   - Re-derives the correct new category from productSold using the full map
 *   - Records with 'Medicare' are verified (unchanged)
 *   - Dry-run mode available: pass --dry-run to see changes without applying them
 *
 * Usage:
 *   node backend/scripts/migrateProductCategory.js           (apply changes)
 *   node backend/scripts/migrateProductCategory.js --dry-run (preview only)
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const DRY_RUN = process.argv.includes('--dry-run');

if (!MONGO_URI) {
  console.error('ERROR: MONGODB_URI environment variable is not set.');
  process.exit(1);
}

if (DRY_RUN) {
  console.log('*** DRY-RUN MODE — no changes will be saved ***\n');
}

// Raw schema to bypass enum validation on old values
const rawSchema = new mongoose.Schema({}, { strict: false, collection: 'productionsubmissions' });
const RawSubmission = mongoose.model('RawSubmission', rawSchema);

// Full product name → new category mapping (includes legacy names)
const PRODUCT_CATEGORY_MAP = {
  // Medicare
  'Medicare Advantage':                        'Medicare',
  'Medicare Supplement (Medigap)':             'Medicare',
  'Medicare Part D (Prescription Drug Plan)':  'Medicare',

  // Health Insurance
  'ACA Marketplace Health Insurance':          'Health Insurance',
  'Private Health Insurance':                  'Health Insurance',
  'Short-Term Health Insurance':               'Health Insurance',

  // Life Insurance — new names
  'Term Life Insurance':                       'Life Insurance',
  'Whole Life Insurance':                      'Life Insurance',
  'Universal Life (UL)':                       'Life Insurance',
  'Indexed Universal Life (IUL)':              'Life Insurance',
  'Final Expense / Burial Insurance':          'Life Insurance',

  // Life Insurance — legacy names
  'Life Insurance \u2013 Term':                'Life Insurance',
  'Life Insurance \u2013 IUL':                 'Life Insurance',
  'Life Insurance \u2013 Whole Life':          'Life Insurance',
  'Life Insurance \u2013 VUL':                 'Life Insurance',
  'Final Expense':                             'Life Insurance',

  // Supplemental Insurance — new names
  'Short-Term Disability Insurance':           'Supplemental Insurance',
  'Long-Term Disability Insurance':            'Supplemental Insurance',
  'Dental Insurance':                          'Supplemental Insurance',
  'Vision Insurance':                          'Supplemental Insurance',
  'Hospital Indemnity':                        'Supplemental Insurance',
  'Cancer Insurance':                          'Supplemental Insurance',
  'Critical Illness Insurance':                'Supplemental Insurance',
  'Accident Insurance':                        'Supplemental Insurance',
  'Long-Term Care Insurance':                  'Supplemental Insurance',

  // Supplemental Insurance — legacy names
  'Critical Illness':                          'Supplemental Insurance',
  'Dental / Vision / Hearing':                 'Supplemental Insurance',
  'Disability':                                'Supplemental Insurance',
  'Long Term Care':                            'Supplemental Insurance',

  // Retirement / Annuities
  'Fixed Annuities':                           'Retirement / Annuities',
  'Indexed Annuities':                         'Retirement / Annuities',

  // Property & Casualty - Personal
  'Auto Insurance':                            'Property & Casualty - Personal',
  'Homeowners Insurance':                      'Property & Casualty - Personal',
  'Renters Insurance':                         'Property & Casualty - Personal',
  'Landlord Insurance':                        'Property & Casualty - Personal',
  'Motorcycle Insurance':                      'Property & Casualty - Personal',
  'RV Insurance':                              'Property & Casualty - Personal',
  'Boat / Watercraft Insurance':               'Property & Casualty - Personal',
  'Umbrella Insurance':                        'Property & Casualty - Personal',

  // Property & Casualty - Commercial
  'General Liability Insurance':               'Property & Casualty - Commercial',
  "Workers' Compensation Insurance":           'Property & Casualty - Commercial',
  'Commercial Property Insurance':             'Property & Casualty - Commercial',
  'Commercial Auto Insurance':                 'Property & Casualty - Commercial',
  "Business Owner's Policy (BOP)":             'Property & Casualty - Commercial',
  'Professional Liability Insurance':          'Property & Casualty - Commercial',
};

// Old categories that need to be re-mapped
const OLD_CATEGORIES = ['Life & Supplemental', 'ACA'];

const deriveCategory = (productSold) => {
  if (productSold && PRODUCT_CATEGORY_MAP[productSold]) {
    return PRODUCT_CATEGORY_MAP[productSold];
  }
  return 'Life Insurance'; // safe default
};

async function migrate() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected.\n');

  // Find records with old or missing category
  const query = {
    $or: [
      { productCategory: { $in: OLD_CATEGORIES } },
      { productCategory: { $exists: false } },
      { productCategory: null },
      { productCategory: '' },
    ],
  };

  const records = await RawSubmission.find(query).lean();
  console.log(`Found ${records.length} records needing category migration.\n`);

  if (records.length === 0) {
    console.log('Nothing to migrate. All records already have new category values.');
    await mongoose.disconnect();
    return;
  }

  // Tally by old category for reporting
  const tally = {};
  let updated = 0;
  let unmapped = 0;

  for (const doc of records) {
    const oldCat = doc.productCategory || '(none)';
    const newCat = deriveCategory(doc.productSold);

    tally[oldCat] = tally[oldCat] || {};
    tally[oldCat][newCat] = (tally[oldCat][newCat] || 0) + 1;

    if (!PRODUCT_CATEGORY_MAP[doc.productSold]) {
      console.log(`  UNMAPPED productSold: "${doc.productSold}" (id: ${doc._id}) -> defaulting to 'Life Insurance'`);
      unmapped++;
    }

    if (!DRY_RUN) {
      await RawSubmission.updateOne(
        { _id: doc._id },
        { $set: { productCategory: newCat } }
      );
    }
    updated++;
  }

  console.log('\nMigration summary (old category -> new category -> count):');
  for (const [oldCat, targets] of Object.entries(tally)) {
    for (const [newCat, count] of Object.entries(targets)) {
      console.log(`  "${oldCat}" -> "${newCat}": ${count}`);
    }
  }

  if (unmapped > 0) {
    console.log(`\nWARNING: ${unmapped} record(s) had unrecognized productSold values and were defaulted to 'Life Insurance'.`);
    console.log('Review those records manually if needed.');
  }

  if (DRY_RUN) {
    console.log(`\nDRY-RUN: Would have updated ${updated} record(s). No changes saved.`);
  } else {
    console.log(`\nUpdated ${updated} record(s) successfully.`);
  }

  await mongoose.disconnect();
  console.log('Disconnected. Done.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
