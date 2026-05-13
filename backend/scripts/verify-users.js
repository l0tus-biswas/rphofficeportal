#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const User = require('../models/User');

  const users = await User.find({}).select('_id email name role isActive referralCode').sort({ createdAt: 1 }).lean();
  console.log(`Total users: ${users.length}\n`);
  for (const u of users) {
    console.log(`${u.email.padEnd(35)} | ${u.name.padEnd(25)} | ${u.role.padEnd(6)} | active=${u.isActive} | ref=${u.referralCode || 'none'} | id=${u._id}`);
  }

  await mongoose.disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
