/**
 * DocuSign Configuration Test Script
 * Run this to verify your DocuSign setup is correct
 * 
 * Usage: node scripts/test-docusign.js
 */

require('dotenv').config();
const { 
  authenticateWithJWT, 
  getEnvelopeStatus 
} = require('../utils/docusign');

async function testDocuSignConfig() {
  console.log('\n🧪 Testing DocuSign Configuration...\n');

  // Check environment variables
  console.log('1️⃣ Checking environment variables...');
  const requiredVars = [
    'DOCUSIGN_INTEGRATION_KEY',
    'DOCUSIGN_ACCOUNT_ID',
    'DOCUSIGN_USER_ID',
    'DOCUSIGN_BASE_PATH',
    'DOCUSIGN_TEMPLATE_ID'
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error('❌ Missing environment variables:');
    missingVars.forEach(varName => console.error(`   - ${varName}`));
    console.log('\n💡 Add these to your .env file');
    process.exit(1);
  }

  console.log('✅ All required environment variables are set\n');

  // Check private key
  console.log('2️⃣ Checking private key...');
  const hasKeyPath = !!process.env.DOCUSIGN_PRIVATE_KEY_PATH;
  const hasKeyDirect = !!process.env.DOCUSIGN_PRIVATE_KEY;

  if (!hasKeyPath && !hasKeyDirect) {
    console.error('❌ Private key not configured');
    console.log('   Set either DOCUSIGN_PRIVATE_KEY_PATH or DOCUSIGN_PRIVATE_KEY');
    process.exit(1);
  }

  if (hasKeyPath) {
    const fs = require('fs');
    const path = require('path');
    const keyPath = path.resolve(process.env.DOCUSIGN_PRIVATE_KEY_PATH);
    
    if (!fs.existsSync(keyPath)) {
      console.error(`❌ Private key file not found: ${keyPath}`);
      console.log('   Download the key from DocuSign Admin and save it to this path');
      process.exit(1);
    }
    
    console.log(`✅ Private key file found: ${keyPath}\n`);
  } else {
    console.log('✅ Private key configured via environment variable\n');
  }

  // Test JWT authentication
  console.log('3️⃣ Testing JWT authentication...');
  try {
    const accessToken = await authenticateWithJWT();
    console.log('✅ Successfully authenticated with DocuSign');
    console.log(`   Access Token: ${accessToken.substring(0, 20)}...\n`);
  } catch (error) {
    console.error('❌ Authentication failed:', error.message);
    console.log('\n💡 Troubleshooting steps:');
    console.log('   1. Verify Integration Key and User ID are correct');
    console.log('   2. Ensure private key matches the public key in DocuSign');
    console.log('   3. Grant consent: https://account-d.docusign.com/oauth/auth?response_type=code&scope=signature%20impersonation&client_id=' + process.env.DOCUSIGN_INTEGRATION_KEY + '&redirect_uri=http://localhost:4200');
    process.exit(1);
  }

  // Display configuration summary
  console.log('4️⃣ Configuration Summary:');
  console.log(`   Integration Key: ${process.env.DOCUSIGN_INTEGRATION_KEY}`);
  console.log(`   Account ID: ${process.env.DOCUSIGN_ACCOUNT_ID}`);
  console.log(`   User ID: ${process.env.DOCUSIGN_USER_ID}`);
  console.log(`   Base Path: ${process.env.DOCUSIGN_BASE_PATH}`);
  console.log(`   Template ID: ${process.env.DOCUSIGN_TEMPLATE_ID}`);
  console.log(`   Webhook Secret: ${process.env.DOCUSIGN_WEBHOOK_SECRET ? '✅ Set' : '⚠️ Not set (optional)'}`);

  console.log('\n✅ DocuSign configuration is valid!');
  console.log('   You can now use DocuSign integration in your application.\n');
}

// Run the test
testDocuSignConfig().catch(error => {
  console.error('\n❌ Test failed:', error.message);
  process.exit(1);
});
