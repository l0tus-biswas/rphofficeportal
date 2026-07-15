const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');

const USERS = [
  {
    name: 'Admin',
    email: 'admin@rhpoffice.com',
    password: 'admin123',
    phone: '0000000000',
    role: 'admin',
    isActive: true
  },
  {
    name: 'Contracting Agent',
    email: 'contracting@rhpoffice.com',
    password: '123456',
    phone: '0000000000',
    role: 'agent',
    isActive: true
  }
];

async function seedProdUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const created = [];

    for (const userData of USERS) {
      const existing = await User.findOne({ email: userData.email });

      if (existing) {
        console.log(`Skipped (already exists): ${userData.email}`);
        continue;
      }

      const user = await User.create(userData); // password hashed by pre-save hook
      created.push(user);
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (created.length === 0) {
      console.log('No new users created — both accounts already exist.');
    } else {
      console.log('Users created successfully:');
      for (const user of created) {
        const plain = USERS.find(u => u.email === user.email);
        console.log(`  - ${user.role}: ${user.email} / ${plain.password} (referral code: ${user.referralCode})`);
      }
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n⚠️  IMPORTANT: Change these passwords after first login!\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error seeding production users:', error);
    process.exit(1);
  }
}

seedProdUsers();
