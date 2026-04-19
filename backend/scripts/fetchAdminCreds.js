const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');

async function fetchAdminCreds() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const admins = await User.find({ role: 'admin' })
      .select('name email phone isActive referralCode createdAt lastLogin')
      .lean();

    if (admins.length === 0) {
      console.log('No admin users found. Run: node scripts/createAdmin.js');
      process.exit(0);
    }

    console.log(`Found ${admins.length} admin(s):\n`);
    console.log('━'.repeat(50));

    admins.forEach((admin, i) => {
      console.log(`\n  Admin #${i + 1}`);
      console.log(`  Name:          ${admin.name}`);
      console.log(`  Email:         ${admin.email}`);
      console.log(`  Phone:         ${admin.phone || 'N/A'}`);
      console.log(`  Active:        ${admin.isActive}`);
      console.log(`  Referral Code: ${admin.referralCode || 'N/A'}`);
      console.log(`  Created:       ${admin.createdAt}`);
      console.log(`  Last Login:    ${admin.lastLogin || 'Never'}`);
    });

    console.log('\n' + '━'.repeat(50));
    console.log('\nDefault password (if unchanged): admin123');
    console.log('If password was changed, use the password reset flow.\n');

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

fetchAdminCreds();
