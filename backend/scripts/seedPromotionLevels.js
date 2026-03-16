/**
 * Seed Promotion Levels
 *
 * Maps to the existing User.level enum:
 *   associate, senior associate, field manager, senior manager,
 *   division executive, regional executive, national executive
 *
 * Thresholds are editable at runtime from the Admin UI.
 * Run: node backend/scripts/seedPromotionLevels.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const PromotionLevel = require('../models/PromotionLevel');

const levels = [
  {
    name: 'associate',
    rank: 1,
    commissionPercent: 60,
    producerPremiumThreshold: 0,       // starting level — no threshold
    producerWindowDays: 30,
    builderPremiumThreshold: 0,
    builderAgentCountThreshold: 0,
    builderWindowDays: 60,
    canSkipTo: false,
    skipRequirements: ''
  },
  {
    name: 'senior associate',
    rank: 2,
    commissionPercent: 70,
    producerPremiumThreshold: 10000,
    producerWindowDays: 30,
    builderPremiumThreshold: 25000,
    builderAgentCountThreshold: 3,
    builderWindowDays: 60,
    canSkipTo: false,
    skipRequirements: ''
  },
  {
    name: 'field manager',
    rank: 3,
    commissionPercent: 80,
    producerPremiumThreshold: 25000,
    producerWindowDays: 30,
    builderPremiumThreshold: 50000,
    builderAgentCountThreshold: 5,
    builderWindowDays: 60,
    canSkipTo: true,
    skipRequirements: 'Achieve 2× the premium threshold in the standard window'
  },
  {
    name: 'senior manager',
    rank: 4,
    commissionPercent: 90,
    producerPremiumThreshold: 50000,
    producerWindowDays: 30,
    builderPremiumThreshold: 100000,
    builderAgentCountThreshold: 8,
    builderWindowDays: 60,
    canSkipTo: true,
    skipRequirements: 'Achieve 2× the premium threshold in the standard window'
  },
  {
    name: 'division executive',
    rank: 5,
    commissionPercent: 100,
    producerPremiumThreshold: 100000,
    producerWindowDays: 30,
    builderPremiumThreshold: 200000,
    builderAgentCountThreshold: 12,
    builderWindowDays: 60,
    canSkipTo: true,
    skipRequirements: 'Achieve 2× the premium threshold in the standard window'
  },
  {
    name: 'regional executive',
    rank: 6,
    commissionPercent: 110,
    producerPremiumThreshold: 200000,
    producerWindowDays: 30,
    builderPremiumThreshold: 400000,
    builderAgentCountThreshold: 20,
    builderWindowDays: 60,
    canSkipTo: false,
    skipRequirements: ''
  },
  {
    name: 'national executive',
    rank: 7,
    commissionPercent: 130,
    producerPremiumThreshold: 500000,
    producerWindowDays: 30,
    builderPremiumThreshold: 1000000,
    builderAgentCountThreshold: 35,
    builderWindowDays: 60,
    canSkipTo: false,
    skipRequirements: ''
  }
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    let created = 0;
    let skipped = 0;

    for (const lvl of levels) {
      const existing = await PromotionLevel.findOne({ name: lvl.name });
      if (existing) {
        console.log(`  SKIP  "${lvl.name}" — already exists`);
        skipped++;
      } else {
        await PromotionLevel.create(lvl);
        console.log(`  CREATE "${lvl.name}" (rank ${lvl.rank}, ${lvl.commissionPercent}%)`);
        created++;
      }
    }

    console.log(`\nDone — Created: ${created}, Skipped: ${skipped}`);
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  }
}

seed();
