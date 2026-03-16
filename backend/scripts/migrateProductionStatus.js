/**
 * Migration: Update ProductionSubmission status enum values and productCategory.
 *
 * Status maps (old → new):
 *   'submitted' → 'Submitted'
 *   'pending'   → 'Pending'
 *   'approved'  → 'In Force'
 *   'paid'      → 'In Force'
 *   'rejected'  → 'Cancelled'
 *
 * Category maps (old → new, March 2026 client update):
 *   'Life & Supplemental' (product-based) → 'Life Insurance' or 'Supplemental Insurance'
 *   'ACA'                                 → 'Health Insurance'
 *   'Medicare'                            → 'Medicare' (unchanged)
 *   missing                               → derived from productSold
 *
 * Usage: node backend/scripts/migrateProductionStatus.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('ERROR: MONGODB_URI environment variable is not set.');
  process.exit(1);
}

// Raw model to bypass enum validation on old values
const rawSchema = new mongoose.Schema({}, { strict: false, collection: 'productionsubmissions' });
const RawSubmission = mongoose.model('RawSubmission', rawSchema);

const STATUS_MAP = {
  submitted: 'Submitted',
  pending: 'Pending',
  approved: 'In Force',
  paid: 'In Force',
  rejected: 'Cancelled',
};

// Full product → new category mapping
const PRODUCT_CATEGORY_MAP = {
  // Medicare
  'Medicare Advantage':                    'Medicare',
  'Medicare Supplement (Medigap)':         'Medicare',
  'Medicare Part D (Prescription Drug Plan)': 'Medicare',
  // Health Insurance
  'ACA Marketplace Health Insurance':      'Health Insurance',
  'Private Health Insurance':              'Health Insurance',
  'Short-Term Health Insurance':           'Health Insurance',
  // Life Insurance (new names)
  'Term Life Insurance':                   'Life Insurance',
  'Whole Life Insurance':                  'Life Insurance',
  'Universal Life (UL)':                   'Life Insurance',
  'Indexed Universal Life (IUL)':          'Life Insurance',
  'Final Expense / Burial Insurance':      'Life Insurance',
  // Life Insurance (legacy names)
  'Life Insurance \u2013 Term':            'Life Insurance',
  'Life Insurance \u2013 IUL':             'Life Insurance',
  'Life Insurance \u2013 Whole Life':      'Life Insurance',
  'Life Insurance \u2013 VUL':             'Life Insurance',
  'Final Expense':                         'Life Insurance',
  // Supplemental Insurance (new names)
  'Short-Term Disability Insurance':       'Supplemental Insurance',
  'Long-Term Disability Insurance':        'Supplemental Insurance',
  'Dental Insurance':                      'Supplemental Insurance',
  'Vision Insurance':                      'Supplemental Insurance',
  'Hospital Indemnity':                    'Supplemental Insurance',
  'Cancer Insurance':                      'Supplemental Insurance',
  'Critical Illness Insurance':            'Supplemental Insurance',
  'Accident Insurance':                    'Supplemental Insurance',
  'Long-Term Care Insurance':              'Supplemental Insurance',
  // Supplemental Insurance (legacy names)
  'Critical Illness':                      'Supplemental Insurance',
  'Dental / Vision / Hearing':             'Supplemental Insurance',
  'Disability':                            'Supplemental Insurance',
  'Long Term Care':                        'Supplemental Insurance',
  // Retirement / Annuities
  'Fixed Annuities':                       'Retirement / Annuities',
  'Indexed Annuities':                     'Retirement / Annuities',
  // Property & Casualty - Personal
  'Auto Insurance':                        'Property & Casualty - Personal',
  'Homeowners Insurance':                  'Property & Casualty - Personal',
  'Renters Insurance':                     'Property & Casualty - Personal',
  'Landlord Insurance':                    'Property & Casualty - Personal',
  'Motorcycle Insurance':                  'Property & Casualty - Personal',
  'RV Insurance':                          'Property & Casualty - Personal',
  'Boat / Watercraft Insurance':           'Property & Casualty - Personal',
  'Umbrella Insurance':                    'Property & Casualty - Personal',
  // Property & Casualty - Commercial
  'General Liability Insurance':           'Property & Casualty - Commercial',
  "Workers' Compensation Insurance":       'Property & Casualty - Commercial',
  'Commercial Property Insurance':         'Property & Casualty - Commercial',
  'Commercial Auto Insurance':             'Property & Casualty - Commercial',
  "Business Owner's Policy (BOP)":         'Property & Casualty - Commercial',
  'Professional Liability Insurance':      'Property & Casualty - Commercial',
};

// Map old category value to new (for records that already had a category set)
const OLD_CATEGORY_REMAP = {
  'Life & Supplemental': null,  // re-derive from productSold
  'ACA':                 'Health Insurance',
  'Medicare':            'Medicare',
};

const getCategory = (productSold, oldCategory) => {
  // If old category maps cleanly, use that
  if (oldCategory && OLD_CATEGORY_REMAP[oldCategory] !== undefined) {
    const remapped = OLD_CATEGORY_REMAP[oldCategory];
    if (remapped !== null) return remapped;
    // null means re-derive from product
  }
  // Derive from product name
  if (productSold && PRODUCT_CATEGORY_MAP[productSold]) {
    return PRODUCT_CATEGORY_MAP[productSold];
  }
  // Default for anything unmapped
  return 'Life Insurance';
};

async function migrate() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected.\n');

  const all = await RawSubmission.find({});
  console.log(`Found ${all.length} production submissions to check.\n`);

  let statusUpdated = 0;
  let categoryUpdated = 0;
  let skipped = 0;

  for (const doc of all) {
    const updates = {};

    // Remap status
    const oldStatus = doc.status;
    const newStatus = STATUS_MAP[oldStatus];
    if (newStatus) {
      updates.status = newStatus;
      statusUpdated++;
    } else if (!oldStatus) {
      updates.status = 'Submitted';
      statusUpdated++;
    }

    // Remap category to new values
    const newCategory = getCategory(doc.productSold, doc.productCategory);
    const needsCategoryUpdate =
      !doc.productCategory ||
      doc.productCategory === 'Life & Supplemental' ||
      doc.productCategory === 'ACA' ||
      doc.productCategory !== newCategory;

    if (needsCategoryUpdate) {
      updates.productCategory = newCategory;
      categoryUpdated++;
    }

    if (Object.keys(updates).length > 0) {
      await RawSubmission.updateOne({ _id: doc._id }, { $set: updates });
    } else {
      skipped++;
    }
  }

  console.log('Migration complete:');
  console.log(`  Status updated:    ${statusUpdated}`);
  console.log(`  Category updated:  ${categoryUpdated}`);
  console.log(`  Skipped (no changes): ${skipped}`);
  console.log(`  Total processed:   ${all.length}`);

  await mongoose.disconnect();
  console.log('\nDisconnected. Done.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
