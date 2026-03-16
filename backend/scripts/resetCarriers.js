/**
 * Reset & re-seed carriers with a small curated set.
 * Run: node backend/scripts/resetCarriers.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Carrier = require('../models/Carrier');

const SEED_CARRIERS = [
  // --- Life Insurance ---
  { name: 'Trans America',          category: 'Life Insurance',         factor: 80,  isActive: true, notes: 'Major life insurance provider' },
  { name: 'American Amicable',      category: 'Life Insurance',         factor: 90,  isActive: true, notes: 'Competitive term and whole life products' },
  { name: 'Mutual of Omaha',        category: 'Life Insurance',         factor: null, isActive: true, notes: 'Multiple products — factor per product schedule' },

  // --- Supplemental Insurance ---
  { name: 'Assurity Life Insurance', category: 'Supplemental Insurance', factor: null, isActive: true, notes: 'Level-based factors — see level guide' },
  { name: 'Globe Term Life (GTL)',   category: 'Supplemental Insurance', factor: null, isActive: true, notes: 'Supplemental carrier — level guide available' },

  // --- Health Insurance (ACA) ---
  { name: 'Ambetter (Centene)',      category: 'Health Insurance',       factor: null, isActive: true },
  { name: 'Blue Cross Blue Shield',  category: 'Health Insurance',       factor: null, isActive: true },
  { name: 'UnitedHealthcare',        category: 'Health Insurance',       factor: null, isActive: true },
  { name: 'Molina Healthcare',       category: 'Health Insurance',       factor: null, isActive: true },
  { name: 'Oscar Health',            category: 'Health Insurance',       factor: null, isActive: true },

  // --- Medicare ---
  { name: 'Humana',                  category: 'Medicare',               factor: null, isActive: true },
  { name: 'Aetna',                   category: 'Medicare',               factor: null, isActive: true },
  { name: 'Wellcare',                category: 'Medicare',               factor: null, isActive: true },
  { name: 'Kaiser Permanente',       category: 'Medicare',               factor: null, isActive: true },
];

async function resetCarriers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Wipe all existing carriers
    const { deletedCount } = await Carrier.deleteMany({});
    console.log(`Deleted ${deletedCount} existing carrier(s)`);

    // Insert fresh seed data
    await Carrier.insertMany(SEED_CARRIERS);
    console.log(`Inserted ${SEED_CARRIERS.length} carrier(s):`);
    SEED_CARRIERS.forEach(c => console.log(`  • [${c.category}] ${c.name}`));

    console.log(`\nTotal carriers in DB: ${await Carrier.countDocuments()}`);
  } catch (err) {
    console.error('Fatal error:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

resetCarriers();
