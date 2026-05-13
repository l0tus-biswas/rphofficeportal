#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const User = require('../models/User');

  // Check who has these referral codes
  const codes = ['ADMF3D8631D', 'AGTJ7', 'AGTK5'];
  const byRefCode = await User.find({ referralCode: { $in: codes } }).select('_id email name referralCode').lean();
  console.log('Users by referral code:', JSON.stringify(byRefCode, null, 2));

  // Admin referral code
  const admin = await User.findById('6939d1974c487ff1012830e6').select('referralCode').lean();
  console.log('Admin referral code:', admin?.referralCode);

  // Lotus user referral code
  const lotus = await User.findById('69b799b12d210ba08343aa59').select('referralCode referredBy').lean();
  console.log('Lotus referral code:', lotus?.referralCode, 'referredBy:', lotus?.referredBy);

  await mongoose.disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
