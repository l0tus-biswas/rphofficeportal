const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const User = require('../models/User');

async function addReferralCodes() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected...');
    
    // Find all users without referral codes
    const users = await User.find({ referralCode: { $exists: false } });
    console.log(`Found ${users.length} users without referral codes`);
    
    for (const user of users) {
      user.referralCode = user.generateReferralCode();
      await user.save();
      console.log(`✓ Added referral code ${user.referralCode} for ${user.email}`);
    }
    
    console.log('\nAll done! All users now have referral codes.');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

addReferralCodes();
