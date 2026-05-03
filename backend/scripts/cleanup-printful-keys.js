require('dotenv').config();
const mongoose = require('mongoose');
const SystemConfig = require('../models/SystemConfig');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);

  // Show all printful keys currently in DB
  const all = await SystemConfig.find({ key: /printful/ }).lean();
  console.log('Current printful keys:');
  all.forEach(r => console.log(`  ${r.key} = ${r.value}`));

  // The only ones we need: printful_api_key, printful_store_id, printful_enabled, printful_text_fields
  const keepKeys = ['printful_api_key', 'printful_store_id', 'printful_enabled', 'printful_text_fields'];
  const toDelete = all.filter(r => !keepKeys.includes(r.key)).map(r => r.key);

  if (toDelete.length) {
    const result = await SystemConfig.deleteMany({ key: { $in: toDelete } });
    console.log(`\nDeleted ${result.deletedCount} unnecessary keys: ${toDelete.join(', ')}`);
  } else {
    console.log('\nNo unnecessary printful keys found.');
  }

  // Also clean up not_configured values
  const notConfigured = all.filter(r => r.value === 'not_configured' && keepKeys.includes(r.key) && r.key !== 'printful_api_key');
  if (notConfigured.length) {
    for (const r of notConfigured) {
      await SystemConfig.deleteOne({ key: r.key });
      console.log(`Removed not_configured entry: ${r.key}`);
    }
  }

  const remaining = await SystemConfig.find({ key: /printful/ }).lean();
  console.log('\nRemaining printful keys:');
  remaining.forEach(r => console.log(`  ${r.key} = ${r.value}`));

  await mongoose.disconnect();
}

run().catch(e => { console.error(e.message); process.exit(1); });
