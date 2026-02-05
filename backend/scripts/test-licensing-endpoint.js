require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');
const APAApplication = require('../models/APAApplication');
const LicensingProgress = require('../models/LicensingProgress');

async function testEndpoint() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find user
    const email = 'lotusbiswaswork@gmail.com';
    const user = await User.findOne({ email });
    const agentId = user._id.toString();
    
    console.log('Testing licensing endpoint for agent:', agentId);
    console.log('');

    // Simulate the endpoint logic
    let licensingProgress = await LicensingProgress.findOne({ agent: agentId })
      .populate('agent', 'name email phone')
      .populate('lastUpdatedBy', 'name');
    
    console.log('📊 Licensing Progress:', licensingProgress ? 'Found' : 'Not found');
    
    // Get license types from APAApplication
    const apaApplication = await APAApplication.findOne({ user: agentId });
    console.log('📄 APA Application:', apaApplication ? 'Found' : 'Not found');
    
    let licenseTypes = apaApplication?.licensingStatus?.licenseTypes || [];
    let isCurrentlyLicensed = apaApplication?.licensingStatus?.currentlyLicensed || false;
    
    console.log('');
    console.log('🔍 License Information:');
    console.log('- Currently Licensed:', isCurrentlyLicensed);
    console.log('- License Types:', licenseTypes);
    console.log('- License Types Length:', licenseTypes.length);
    console.log('');
    
    // Simulate response
    const responseData = licensingProgress ? licensingProgress.toObject() : {};
    responseData.licenseTypes = isCurrentlyLicensed ? licenseTypes : [];
    
    console.log('📤 Response that would be sent:');
    console.log('- licenseTypes:', responseData.licenseTypes);
    console.log('- isLicensed:', responseData.isLicensed);
    console.log('');
    
    console.log('✅ Timer should be hidden:', responseData.licenseTypes.length > 0);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testEndpoint();
