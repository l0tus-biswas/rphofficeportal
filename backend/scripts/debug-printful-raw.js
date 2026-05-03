/**
 * Debug script: fetch raw Printful product data to inspect text field structure
 */
const axios = require('axios');
const mongoose = require('mongoose');
const SystemConfig = require('../models/SystemConfig');
const path = require('path');

// Load env
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function run() {
  const dbUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/rphoffice';
  await mongoose.connect(dbUri);

  const records = await SystemConfig.find({
    key: { $in: ['printful_api_key', 'printful_store_id'] }
  }).lean();

  const map = {};
  for (const r of records) map[r.key] = r.value;

  const apiKey = map['printful_api_key'];
  const storeId = map['printful_store_id'];

  if (!apiKey) {
    console.log('No API key found in DB');
    process.exit(1);
  }

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };
  if (storeId && storeId !== 'not_configured') {
    headers['X-PF-Store-Id'] = storeId;
  }

  console.log('Fetching products...\n');
  const res = await axios.get('https://api.printful.com/store/products', { headers });
  const products = res.data.result;
  console.log('Products found:', products.length);
  products.forEach(p => console.log(`  - [${p.id}] ${p.name}`));

  if (products.length === 0) {
    console.log('No products to inspect.');
    await mongoose.disconnect();
    return;
  }

  // Inspect first product in detail
  const productId = products[0].id;
  console.log(`\n\n========== RAW DETAIL for product ${productId} ==========\n`);

  const detail = await axios.get(`https://api.printful.com/store/products/${productId}`, { headers });
  const raw = detail.data.result;

  // Print sync_product
  console.log('sync_product:', JSON.stringify(raw.sync_product, null, 2));

  // Print each variant's files in detail
  console.log('\n\nsync_variants:');
  for (const v of raw.sync_variants || []) {
    console.log(`\n--- Variant: ${v.name} (id: ${v.id}) ---`);
    console.log('  variant_id:', v.variant_id);
    console.log('  retail_price:', v.retail_price);
    console.log('  options:', JSON.stringify(v.options, null, 4));
    console.log('  files:');
    for (const f of v.files || []) {
      console.log(`    file type="${f.type}", id=${f.id}`);
      console.log('      options:', JSON.stringify(f.options, null, 6));
      console.log('      option_groups:', JSON.stringify(f.option_groups, null, 6));
      // Show all keys on the file object
      console.log('      all keys:', Object.keys(f).join(', '));
    }
  }

  await mongoose.disconnect();
}

run().catch(e => {
  console.error('ERROR:', e.response?.data || e.message);
  process.exit(1);
});
