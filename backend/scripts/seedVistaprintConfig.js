/**
 * Seed Vistaprint configuration keys into SystemConfig.
 * Safe to re-run: uses upsert so existing values are not overwritten.
 * To update a value, edit it manually via the admin Vistaprint Config page.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const SystemConfig = require('../models/SystemConfig');

const CONFIGS = [
  {
    key: 'vistaprint_english_url',
    value: 'https://www.vistaprint.com/business-cards',
    description: 'Vistaprint order link for English business card template'
  },
  {
    key: 'vistaprint_spanish_url',
    value: 'https://www.vistaprint.com/business-cards',
    description: 'Vistaprint order link for Spanish business card template'
  },
  {
    key: 'vistaprint_affiliate_id',
    value: 'not_configured',
    description: 'Vistaprint affiliate tracking ID (from affiliate program dashboard)'
  },
  {
    key: 'vistaprint_english_preview',
    value: 'not_configured',
    description: 'File path to English business card design preview image'
  },
  {
    key: 'vistaprint_spanish_preview',
    value: 'not_configured',
    description: 'File path to Spanish business card design preview image'
  }
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  let created = 0;
  let skipped = 0;

  for (const cfg of CONFIGS) {
    const existing = await SystemConfig.findOne({ key: cfg.key });
    if (existing) {
      console.log(`Skipped (exists): ${cfg.key}`);
      skipped++;
    } else {
      await SystemConfig.create({
        key: cfg.key,
        value: cfg.value,
        category: 'application',
        description: cfg.description,
        isSecret: false,
        isEditable: true
      });
      console.log(`Created: ${cfg.key}`);
      created++;
    }
  }

  console.log(`\n--- Seed Summary ---`);
  console.log(`Created: ${created}`);
  console.log(`Skipped: ${skipped}`);
  await mongoose.disconnect();
  console.log('Disconnected from MongoDB');
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
