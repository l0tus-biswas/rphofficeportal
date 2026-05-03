/**
 * Seed Printful configuration keys into SystemConfig.
 * Safe to re-run: uses upsert so existing values are not overwritten.
 * To update a value, edit it manually via the admin Printful Config page.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const SystemConfig = require('../models/SystemConfig');

const CONFIGS = [
  {
    key: 'printful_api_key',
    value: 'not_configured',
    description: 'Printful API access token (Bearer token)',
    isSecret: true
  },
  {
    key: 'printful_store_id',
    value: 'not_configured',
    description: 'Printful store ID (auto-detected from API key if blank)'
  },
  {
    key: 'printful_english_preview',
    value: 'not_configured',
    description: 'Preview image path for English business card design'
  },
  {
    key: 'printful_spanish_preview',
    value: 'not_configured',
    description: 'Preview image path for Spanish business card design'
  },
  {
    key: 'printful_english_design_url',
    value: 'not_configured',
    description: 'Public URL to English business card design file (PDF/PNG) for printing'
  },
  {
    key: 'printful_spanish_design_url',
    value: 'not_configured',
    description: 'Public URL to Spanish business card design file (PDF/PNG) for printing'
  },
  {
    key: 'printful_product_variant_id',
    value: 'not_configured',
    description: 'Printful product variant ID for business cards'
  },
  {
    key: 'printful_price_per_unit',
    value: '0.10',
    description: 'Display price per business card shown to agents (USD)'
  },
  {
    key: 'printful_enabled',
    value: 'false',
    description: 'Whether business card ordering is enabled for agents'
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
