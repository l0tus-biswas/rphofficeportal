require('dotenv').config();
const mongoose = require('mongoose');
const SystemConfig = require('../models/SystemConfig');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);

  const oldKeys = [
    'vistaprint_affiliate_id',
    'vistaprint_english_preview',
    'vistaprint_english_url',
    'vistaprint_spanish_preview',
    'vistaprint_spanish_url'
  ];

  const result = await SystemConfig.deleteMany({ key: { $in: oldKeys } });
  console.log(`Deleted ${result.deletedCount} old Vistaprint config entries.`);

  const remaining = await SystemConfig.find({ key: /vistaprint/ }).lean();
  if (remaining.length) {
    console.log('Remaining vistaprint keys:', remaining.map(r => r.key));
  } else {
    console.log('No vistaprint keys remaining.');
  }

  await mongoose.disconnect();
}

run().catch(e => { console.error(e.message); process.exit(1); });
