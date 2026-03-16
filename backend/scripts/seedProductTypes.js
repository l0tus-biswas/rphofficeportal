/**
 * Seed ProductType collection with the full client-provided product list.
 * Updated: March 2026 -- Client provided complete category/product structure.
 * Run: node backend/scripts/seedProductTypes.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const ProductType = require('../models/ProductType');

const defaultProducts = [
  // Life Insurance
  { name: 'Term Life Insurance',                       category: 'Life Insurance' },
  { name: 'Whole Life Insurance',                      category: 'Life Insurance' },
  { name: 'Universal Life (UL)',                       category: 'Life Insurance' },
  { name: 'Indexed Universal Life (IUL)',              category: 'Life Insurance' },
  { name: 'Final Expense / Burial Insurance',          category: 'Life Insurance' },

  // Health Insurance
  { name: 'ACA Marketplace Health Insurance',          category: 'Health Insurance' },
  { name: 'Private Health Insurance',                  category: 'Health Insurance' },
  { name: 'Short-Term Health Insurance',               category: 'Health Insurance' },

  // Medicare
  { name: 'Medicare Advantage',                        category: 'Medicare' },
  { name: 'Medicare Supplement (Medigap)',             category: 'Medicare' },
  { name: 'Medicare Part D (Prescription Drug Plan)',  category: 'Medicare' },

  // Supplemental Insurance
  { name: 'Short-Term Disability Insurance',           category: 'Supplemental Insurance' },
  { name: 'Long-Term Disability Insurance',            category: 'Supplemental Insurance' },
  { name: 'Dental Insurance',                          category: 'Supplemental Insurance' },
  { name: 'Vision Insurance',                          category: 'Supplemental Insurance' },
  { name: 'Hospital Indemnity',                        category: 'Supplemental Insurance' },
  { name: 'Cancer Insurance',                          category: 'Supplemental Insurance' },
  { name: 'Critical Illness Insurance',                category: 'Supplemental Insurance' },
  { name: 'Accident Insurance',                        category: 'Supplemental Insurance' },
  { name: 'Long-Term Care Insurance',                  category: 'Supplemental Insurance' },

  // Retirement / Annuities
  { name: 'Fixed Annuities',                           category: 'Retirement / Annuities' },
  { name: 'Indexed Annuities',                         category: 'Retirement / Annuities' },

  // Property & Casualty - Personal
  { name: 'Auto Insurance',                            category: 'Property & Casualty - Personal' },
  { name: 'Homeowners Insurance',                      category: 'Property & Casualty - Personal' },
  { name: 'Renters Insurance',                         category: 'Property & Casualty - Personal' },
  { name: 'Landlord Insurance',                        category: 'Property & Casualty - Personal' },
  { name: 'Motorcycle Insurance',                      category: 'Property & Casualty - Personal' },
  { name: 'RV Insurance',                              category: 'Property & Casualty - Personal' },
  { name: 'Boat / Watercraft Insurance',               category: 'Property & Casualty - Personal' },
  { name: 'Umbrella Insurance',                        category: 'Property & Casualty - Personal' },

  // Property & Casualty - Commercial
  { name: 'General Liability Insurance',               category: 'Property & Casualty - Commercial' },
  { name: "Workers' Compensation Insurance",           category: 'Property & Casualty - Commercial' },
  { name: 'Commercial Property Insurance',             category: 'Property & Casualty - Commercial' },
  { name: 'Commercial Auto Insurance',                 category: 'Property & Casualty - Commercial' },
  { name: "Business Owner's Policy (BOP)",             category: 'Property & Casualty - Commercial' },
  { name: 'Professional Liability Insurance',          category: 'Property & Casualty - Commercial' },
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const p of defaultProducts) {
    try {
      const existing = await ProductType.findOne({ name: p.name });
      if (existing) {
        if (existing.category !== p.category) {
          await ProductType.updateOne({ _id: existing._id }, { $set: { category: p.category } });
          console.log(`  UPDATED category: ${p.name} -> ${p.category}`);
          updated++;
        } else {
          console.log(`  SKIP (already exists): ${p.name}`);
          skipped++;
        }
      } else {
        await ProductType.create(p);
        console.log(`  CREATED: ${p.name} (${p.category})`);
        created++;
      }
    } catch (err) {
      console.error(`  ERROR for ${p.name}:`, err.message);
    }
  }

  console.log(`\nDone: ${created} created, ${updated} updated, ${skipped} skipped.`);
  await mongoose.connection.close();
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
