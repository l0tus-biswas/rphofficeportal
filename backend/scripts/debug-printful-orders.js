/**
 * Debug: see raw Printful orders response
 */
const axios = require('axios');
const mongoose = require('mongoose');
const SystemConfig = require('../models/SystemConfig');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);

  const records = await SystemConfig.find({
    key: { $in: ['printful_api_key', 'printful_store_id'] }
  }).lean();
  const map = {};
  for (const r of records) map[r.key] = r.value;

  const apiKey = map['printful_api_key'];
  const storeId = map['printful_store_id'];
  const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
  if (storeId && storeId !== 'not_configured') headers['X-PF-Store-Id'] = storeId;

  const res = await axios.get('https://api.printful.com/orders', { headers, params: { limit: 5 } });
  const orders = res.data?.result || [];

  console.log(`Total orders: ${orders.length}\n`);
  for (const o of orders) {
    console.log('=== ORDER ===');
    console.log(JSON.stringify(o, null, 2));
    console.log('');
  }

  await mongoose.disconnect();
}

run().catch(e => { console.error(e.response?.data || e.message); process.exit(1); });
