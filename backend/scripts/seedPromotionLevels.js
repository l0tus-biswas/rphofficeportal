/**
 * Seed Promotion Levels
 *
 * Maps to the User.level enum:
 *   associate, senior associate, manager, senior manager,
 *   regional executive, senior regional executive, national executive, senior national executive
 *
 * Producer Fast-Track: Skip one level if you produce 1.4× the premium requirement of the target level.
 * Builder Fast-Track: Skip one level if you achieve 1.4× the team premium of the target level.
 *   No more than 50% of the team premium may come from one leg or personal production.
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
    producerPremiumThreshold: 5000,
    producerWindowDays: 30,            // Rolling 30 days
    builderPremiumThreshold: 10000,
    builderAgentCountThreshold: 2,
    builderWindowDays: 60,             // Rolling 60 days
    canSkipTo: true,
    skipRequirements: 'Produce 1.4× the premium requirement of the target level (Producer) or achieve 1.4× team premium (Builder, max 50% from one leg)'
  },
  {
    name: 'manager',
    rank: 3,
    commissionPercent: 80,
    producerPremiumThreshold: 30000,
    producerWindowDays: 180,           // Rolling 6 months
    builderPremiumThreshold: 30000,
    builderAgentCountThreshold: 5,
    builderWindowDays: 60,             // Rolling 2 months
    canSkipTo: true,
    skipRequirements: 'Produce 1.4× the premium requirement of the target level (Producer) or achieve 1.4× team premium (Builder, max 50% from one leg)'
  },
  {
    name: 'senior manager',
    rank: 4,
    commissionPercent: 90,
    producerPremiumThreshold: 50000,
    producerWindowDays: 180,           // Rolling 6 months
    builderPremiumThreshold: 60000,
    builderAgentCountThreshold: 10,
    builderWindowDays: 60,             // Rolling 2 months
    canSkipTo: true,
    skipRequirements: 'Produce 1.4× the premium requirement of the target level (Producer) or achieve 1.4× team premium (Builder, max 50% from one leg)'
  },
  {
    name: 'regional executive',
    rank: 5,
    commissionPercent: 100,
    producerPremiumThreshold: 75000,
    producerWindowDays: 180,           // Rolling 6 months
    builderPremiumThreshold: 105000,
    builderAgentCountThreshold: 15,
    builderWindowDays: 90,             // Rolling 3 months
    canSkipTo: true,
    skipRequirements: 'Produce 1.4× the premium requirement of the target level (Producer) or achieve 1.4× team premium (Builder, max 50% from one leg)'
  },
  {
    name: 'senior regional executive',
    rank: 6,
    commissionPercent: 110,
    producerPremiumThreshold: 100000,
    producerWindowDays: 180,           // Rolling 6 months
    builderPremiumThreshold: 120000,
    builderAgentCountThreshold: 30,
    builderWindowDays: 90,             // Rolling 3 months
    canSkipTo: true,
    skipRequirements: 'Produce 1.4× the premium requirement of the target level (Producer) or achieve 1.4× team premium (Builder, max 50% from one leg)'
  },
  {
    name: 'national executive',
    rank: 7,
    commissionPercent: 120,
    producerPremiumThreshold: 125000,
    producerWindowDays: 180,           // Rolling 6 months
    builderPremiumThreshold: 150000,
    builderAgentCountThreshold: 70,
    builderWindowDays: 90,             // Rolling 3 months
    canSkipTo: true,
    skipRequirements: 'Produce 1.4× the premium requirement of the target level (Producer) or achieve 1.4× team premium (Builder, max 50% from one leg)'
  },
  {
    name: 'senior national executive',
    rank: 8,
    commissionPercent: 130,
    producerPremiumThreshold: 150000,
    producerWindowDays: 180,           // Rolling 6 months
    builderPremiumThreshold: 225000,
    builderAgentCountThreshold: 200,
    builderWindowDays: 90,             // Rolling 3 months
    canSkipTo: false,
    skipRequirements: ''
  }
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Remove old levels that no longer exist in the new structure
    const oldLevelNames = ['field manager', 'division executive'];
    for (const oldName of oldLevelNames) {
      const removed = await PromotionLevel.findOneAndDelete({ name: oldName });
      if (removed) {
        console.log(`  REMOVE "${oldName}" — replaced in new level structure`);
      }
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const lvl of levels) {
      const existing = await PromotionLevel.findOne({ name: lvl.name });
      if (existing) {
        // Update existing level with new thresholds
        await PromotionLevel.findByIdAndUpdate(existing._id, lvl, { runValidators: true });
        console.log(`  UPDATE "${lvl.name}" (rank ${lvl.rank}, ${lvl.commissionPercent}%)`);
        updated++;
      } else {
        await PromotionLevel.create(lvl);
        console.log(`  CREATE "${lvl.name}" (rank ${lvl.rank}, ${lvl.commissionPercent}%)`);
        created++;
      }
    }

    console.log(`\nDone — Created: ${created}, Updated: ${updated}`);
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  }
}

seed();
