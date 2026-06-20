/**
 * Seed a stub RHP business-card template into SystemConfig (key: printful_card_templates).
 *
 * This is a STUB for wiring/testing: white background, circular photo, centered
 * text. Replace backgroundImage + coordinates with the client's real design via
 * the admin config once it arrives.
 *
 * Run:  node scripts/seed-card-template.js
 * Undo: node scripts/seed-card-template.js --remove
 *
 * Verified Printful spec (product 724 "Set of Business Cards"):
 *   print file 1200x750 @ 300 DPI (portrait synced file 750x1200); placements front+back.
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const SystemConfig = require('../models/SystemConfig');

const KEY = 'printful_card_templates';

const STUB = [{
  id: 'rhp-business-card',
  name: 'RHP Business Card',
  syncProductId: 430918225,
  variants: [
    { label: '50 pieces',  syncVariantId: 5291995346, price: 15.50 },
    { label: '100 pieces', syncVariantId: 5291995347, price: 24.00 }
  ],
  orientation: 'portrait',
  printFile: { widthPx: 750, heightPx: 1200, dpi: 300 },
  sides: [
    {
      placement: 'default', label: 'Front',
      backgroundImage: '',   // TODO: '/uploads/card-templates/<front-bg>.png'
      fonts: [],             // TODO: client brand fonts (.ttf/.otf)
      photo: { x: 225, y: 140, w: 300, h: 300, fit: 'cover', shape: 'circle' },
      fields: [
        { key: 'name',  label: 'Full Name', required: true,  x: 75, y: 500, w: 600, align: 'center', family: 'Arial', weight: 700, size: 54, color: '#1a2b4a' },
        { key: 'title', label: 'Title',     required: false, x: 75, y: 580, w: 600, align: 'center', family: 'Arial', weight: 400, size: 32, color: '#555555' },
        { key: 'phone', label: 'Phone',     required: true,  x: 75, y: 780, w: 600, align: 'center', family: 'Arial', weight: 400, size: 30, color: '#333333' },
        { key: 'email', label: 'Email',     required: true,  x: 75, y: 840, w: 600, align: 'center', family: 'Arial', weight: 400, size: 30, color: '#333333' }
      ]
    },
    {
      placement: 'back', label: 'Back',
      backgroundImage: '',   // TODO: '/uploads/card-templates/<back-bg>.png'
      fonts: [],
      photo: null,           // back has no headshot in the stub
      fields: [
        { key: 'name', label: 'Full Name', required: true, x: 75, y: 560, w: 600, align: 'center', family: 'Arial', weight: 700, size: 44, color: '#1a2b4a' }
      ]
    }
  ]
}];

async function run() {
  const dbUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/rphoffice';
  await mongoose.connect(dbUri);

  if (process.argv.includes('--remove')) {
    await SystemConfig.deleteOne({ key: KEY });
    console.log('Removed', KEY);
  } else {
    await SystemConfig.findOneAndUpdate(
      { key: KEY },
      { key: KEY, value: JSON.stringify(STUB), category: 'application',
        description: 'Printful: business-card render templates' },
      { upsert: true, new: true }
    );
    console.log('Seeded stub template under', KEY);
  }
  await mongoose.disconnect();
}

run().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
