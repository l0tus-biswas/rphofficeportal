require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');
const APAApplication = require('../models/APAApplication');

async function checkLicenseData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find user by email
    const email = 'lotusbiswaswork@gmail.com';
    const user = await User.findOne({ email });
    
    if (!user) {
      console.log('❌ User not found');
      process.exit(0);
    }

    console.log('\n📋 User Info:');
    console.log('- ID:', user._id);
    console.log('- Name:', user.name);
    console.log('- Email:', user.email);
    console.log('- Role:', user.role);

    // Find APA Application
    const apaApp = await APAApplication.findOne({ user: user._id });
    
    if (!apaApp) {
      console.log('\n❌ No APA Application found for this user');
      console.log('\nChecking metadata...');
      if (user.metadata) {
        console.log('User metadata:', Object.fromEntries(user.metadata));
      }
    } else {
      console.log('\n✅ APA Application found:');
      console.log('- Application ID:', apaApp._id);
      console.log('- Currently Licensed:', apaApp.licensingStatus?.currentlyLicensed);
      console.log('- License Types:', apaApp.licensingStatus?.licenseTypes);
      console.log('- States Licensed:', apaApp.licensingStatus?.statesLicensed);
      console.log('- License Number:', apaApp.licensingStatus?.licenseNumber);
      console.log('- License Status:', apaApp.licensingStatus?.licenseStatus);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkLicenseData();
