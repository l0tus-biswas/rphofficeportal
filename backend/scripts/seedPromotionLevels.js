/**
 * Seed Promotion Levels — Producer / Builder Career Path taxonomy
 *
 * Replaces the old 8-level ladder (associate...senior national executive)
 * with the 11-level ladder from the RHP Financial career-path charts.
 * Each level carries BOTH a Producer-track requirement set (personal
 * premium + personal income) and a Builder-track requirement set (team
 * premium + team rank composition + personal income) — promotion is
 * granted via EITHER track, same as before.
 *
 * Existing agents on the old levels are remapped to the nearest new level
 * by commission percentage (see OLD_TO_NEW_MAP below) — their promotedAt
 * date is preserved.
 *
 * Run: node backend/scripts/seedPromotionLevels.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const PromotionLevel = require('../models/PromotionLevel');
const User = require('../models/User');

// Old level name -> new level name, chosen by nearest commissionPercent
const OLD_TO_NEW_MAP = {
  'associate': 'representative',                 // 60% -> 70%
  'senior associate': 'representative',           // 70% -> 70%
  'manager': 'advisor',                           // 80% -> 80%
  'senior manager': 'executive advisor',          // 90% -> 90%
  'regional executive': 'senior agency owner',    // 100% -> 100%
  'senior regional executive': 'national agency owner', // 110% -> 110%
  'national executive': 'senior elite agency owner',    // 120% -> 120%
  'senior national executive': 'senior elite agency owner', // 130% -> 120% (nearest, no higher tier exists)
  // Levels from an even older structure, kept for safety
  'field manager': 'advisor',
  'division executive': 'senior agency owner'
};

const levels = [
  {
    name: 'representative',
    rank: 1,
    commissionPercent: 70,
    producerPremiumThreshold: 0,
    producerWindowDays: 30,
    producerIncomeThreshold: 0,
    producerIncomeWindowDays: 180,
    builderPremiumThreshold: 0,
    builderWindowDays: 30,
    builderAgentCountThreshold: 0,
    builderRequiredRanks: [],
    builderIncomeThreshold: 0,
    builderIncomeWindowDays: 180,
    canSkipTo: false
  },
  {
    name: 'broker',
    rank: 2,
    commissionPercent: 75,
    producerPremiumThreshold: 5000,
    producerWindowDays: 30,             // rolling 30 days
    producerIncomeThreshold: 0,
    producerIncomeWindowDays: 180,
    builderPremiumThreshold: 10000,
    builderWindowDays: 30,              // 1 Licensed Agent in 30 days
    builderAgentCountThreshold: 1,
    builderRequiredRanks: [],
    builderIncomeThreshold: 0,
    builderIncomeWindowDays: 180,
    canSkipTo: false
  },
  {
    name: 'advisor',
    rank: 3,
    commissionPercent: 80,
    producerPremiumThreshold: 7500,
    producerWindowDays: 60,             // 2 consecutive months
    producerIncomeThreshold: 0,
    producerIncomeWindowDays: 180,
    builderPremiumThreshold: 15000,
    builderWindowDays: 60,              // 2 Licensed Agents for 2 consecutive months
    builderAgentCountThreshold: 2,
    builderRequiredRanks: [],
    builderIncomeThreshold: 0,
    builderIncomeWindowDays: 180,
    canSkipTo: false
  },
  {
    name: 'senior advisor',
    rank: 4,
    commissionPercent: 85,
    producerPremiumThreshold: 10000,
    producerWindowDays: 60,
    producerIncomeThreshold: 0,
    producerIncomeWindowDays: 180,
    builderPremiumThreshold: 20000,
    builderWindowDays: 60,              // 3 Licensed Agents for 2 consecutive months
    builderAgentCountThreshold: 3,
    builderRequiredRanks: [],
    builderIncomeThreshold: 0,
    builderIncomeWindowDays: 180,
    canSkipTo: false
  },
  {
    name: 'executive advisor',
    rank: 5,
    commissionPercent: 90,
    producerPremiumThreshold: 12500,
    producerWindowDays: 60,             // 2 consecutive months
    producerIncomeThreshold: 30000,
    producerIncomeWindowDays: 180,      // rolling 6 months
    builderPremiumThreshold: 25000,
    builderWindowDays: 60,              // 2 consecutive months
    builderAgentCountThreshold: 0,
    builderRequiredRanks: [{ rank: 'advisor', count: 1 }], // 1 Advisor on team
    builderIncomeThreshold: 30000,
    builderIncomeWindowDays: 180,       // rolling 6 months
    canSkipTo: false
  },
  {
    name: 'agency owner',
    rank: 6,
    commissionPercent: 95,
    producerPremiumThreshold: 15000,
    producerWindowDays: 90,             // 3 consecutive months
    producerIncomeThreshold: 50000,
    producerIncomeWindowDays: 180,      // last 6 months
    builderPremiumThreshold: 35000,
    builderWindowDays: 90,              // 3 consecutive months
    builderAgentCountThreshold: 0,
    builderRequiredRanks: [             // 2 Advisors OR 1 Senior Advisor
      { rank: 'advisor', count: 2 },
      { rank: 'senior advisor', count: 1 }
    ],
    builderIncomeThreshold: 50000,
    builderIncomeWindowDays: 180,       // last 6 months
    canSkipTo: false
  },
  {
    name: 'senior agency owner',
    rank: 7,
    commissionPercent: 100,
    producerPremiumThreshold: 15000,
    producerWindowDays: 90,
    producerIncomeThreshold: 65000,
    producerIncomeWindowDays: 180,      // last 6 months
    builderPremiumThreshold: 40000,
    builderWindowDays: 90,
    builderAgentCountThreshold: 0,
    builderRequiredRanks: [{ rank: 'senior advisor', count: 2 }], // 2 Senior Advisors
    builderIncomeThreshold: 75000,
    builderIncomeWindowDays: 365,       // rolling 12 months
    canSkipTo: false
  },
  {
    name: 'regional agency owner',
    rank: 8,
    commissionPercent: 105,
    producerPremiumThreshold: 15000,
    producerWindowDays: 90,
    producerIncomeThreshold: 100000,
    producerIncomeWindowDays: 365,      // last 12 months
    builderPremiumThreshold: 45000,
    builderWindowDays: 90,
    builderAgentCountThreshold: 0,
    builderRequiredRanks: [{ rank: 'agency owner', count: 1 }], // 1 Agency Owner
    builderIncomeThreshold: 100000,
    builderIncomeWindowDays: 365,
    canSkipTo: false
  },
  {
    name: 'national agency owner',
    rank: 9,
    commissionPercent: 110,
    producerPremiumThreshold: 15000,
    producerWindowDays: 90,
    producerIncomeThreshold: 200000,
    producerIncomeWindowDays: 365,      // last 12 months
    builderPremiumThreshold: 50000,
    builderWindowDays: 90,
    builderAgentCountThreshold: 0,
    builderRequiredRanks: [{ rank: 'agency owner', count: 1 }], // 1 Agency Owner
    builderIncomeThreshold: 200000,
    builderIncomeWindowDays: 365,
    canSkipTo: false
  },
  {
    name: 'elite agency owner',
    rank: 10,
    commissionPercent: 115,
    producerPremiumThreshold: 0,        // income-only requirement
    producerWindowDays: 90,
    producerIncomeThreshold: 300000,
    producerIncomeWindowDays: 365,      // last 12 months
    builderPremiumThreshold: 70000,
    builderWindowDays: 90,              // 3 consecutive months
    builderAgentCountThreshold: 0,
    builderRequiredRanks: [],
    builderIncomeThreshold: 300000,
    builderIncomeWindowDays: 365,
    canSkipTo: false
  },
  {
    name: 'senior elite agency owner',
    rank: 11,
    commissionPercent: 120,
    producerPremiumThreshold: 0,        // income-only requirement
    producerWindowDays: 90,
    producerIncomeThreshold: 500000,
    producerIncomeWindowDays: 365,      // last 12 months
    builderPremiumThreshold: 125000,
    builderWindowDays: 90,              // 3 consecutive months
    builderAgentCountThreshold: 0,
    builderRequiredRanks: [],
    builderIncomeThreshold: 500000,
    builderIncomeWindowDays: 365,
    canSkipTo: false
  }
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // 1. Remap agents currently on old levels to their nearest new level,
    //    BEFORE the old PromotionLevel documents are removed.
    let remapped = 0;
    for (const [oldName, newName] of Object.entries(OLD_TO_NEW_MAP)) {
      const result = await User.updateMany(
        { level: { $regex: new RegExp(`^${oldName}$`, 'i') } },
        { $set: { level: newName } }
      );
      if (result.modifiedCount > 0) {
        console.log(`  REMAP ${result.modifiedCount} agent(s): "${oldName}" -> "${newName}"`);
        remapped += result.modifiedCount;
      }
    }

    // 2. Remove all old PromotionLevel documents that aren't part of the new taxonomy.
    const newNames = levels.map(l => l.name);
    const removed = await PromotionLevel.deleteMany({ name: { $nin: newNames } });
    if (removed.deletedCount > 0) {
      console.log(`  REMOVE ${removed.deletedCount} old level document(s)`);
    }

    // 3. Create/update the new taxonomy.
    let created = 0;
    let updated = 0;

    for (const lvl of levels) {
      const existing = await PromotionLevel.findOne({ name: lvl.name });
      if (existing) {
        await PromotionLevel.findByIdAndUpdate(existing._id, lvl, { runValidators: true });
        console.log(`  UPDATE "${lvl.name}" (rank ${lvl.rank}, ${lvl.commissionPercent}%)`);
        updated++;
      } else {
        await PromotionLevel.create(lvl);
        console.log(`  CREATE "${lvl.name}" (rank ${lvl.rank}, ${lvl.commissionPercent}%)`);
        created++;
      }
    }

    console.log(`\nDone — Agents remapped: ${remapped}, Levels created: ${created}, updated: ${updated}`);
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  }
}

seed();
