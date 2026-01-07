#!/usr/bin/env node

/**
 * DocuSign Integration Quick Start
 * Interactive setup assistant
 * 
 * Usage: node scripts/docusign-quickstart.js
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║       DocuSign Integration Quick Start Assistant      ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  console.log('This assistant will help you set up DocuSign integration.\n');
  console.log('Prerequisites:');
  console.log('  ✓ DocuSign Developer Account created');
  console.log('  ✓ Integration Key generated');
  console.log('  ✓ RSA private key downloaded\n');

  const ready = await question('Are you ready to proceed? (yes/no): ');
  if (ready.toLowerCase() !== 'yes' && ready.toLowerCase() !== 'y') {
    console.log('\n📖 Please read DOCUSIGN_SETUP.md for prerequisites.');
    console.log('   Then run this script again.\n');
    rl.close();
    return;
  }

  console.log('\n─────────────────────────────────────────────────────────\n');

  // Step 1: Check for .env file
  const envPath = path.join(__dirname, '../.env');
  const envExamplePath = path.join(__dirname, '../.env.example');
  
  if (!fs.existsSync(envPath)) {
    console.log('⚠️  .env file not found. Creating from .env.example...');
    if (fs.existsSync(envExamplePath)) {
      fs.copyFileSync(envExamplePath, envPath);
      console.log('✅ .env file created!\n');
    } else {
      console.log('❌ .env.example not found. Please create .env manually.\n');
      rl.close();
      return;
    }
  }

  // Step 2: Collect DocuSign credentials
  console.log('📝 Please enter your DocuSign credentials:\n');

  const integrationKey = await question('Integration Key (GUID): ');
  const accountId = await question('Account ID (GUID): ');
  const userId = await question('User ID (API Username/GUID): ');
  const templateId = await question('Template ID (GUID): ');
  
  console.log('\n');
  const environment = await question('Environment (demo/production) [demo]: ');
  const env = environment.toLowerCase() === 'production' ? 'production' : 'demo';
  
  const basePath = env === 'production' 
    ? 'https://www.docusign.net/restapi'
    : 'https://demo.docusign.net/restapi';

  // Step 3: Private key setup
  console.log('\n─────────────────────────────────────────────────────────\n');
  console.log('🔑 Private Key Setup:\n');
  
  const keyMethod = await question('How do you want to store the private key?\n  1) File path (recommended)\n  2) Base64 in .env\nChoose (1/2) [1]: ');
  
  let privateKeyConfig = '';
  if (keyMethod === '2') {
    console.log('\n📄 Please paste your private key (multi-line, press Ctrl+D when done):');
    const privateKey = await new Promise(resolve => {
      let data = '';
      process.stdin.on('data', chunk => data += chunk);
      process.stdin.on('end', () => resolve(data));
    });
    const base64Key = Buffer.from(privateKey).toString('base64');
    privateKeyConfig = `DOCUSIGN_PRIVATE_KEY=${base64Key}`;
  } else {
    const configDir = path.join(__dirname, '../config');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
      console.log(`\n📁 Created directory: ${configDir}`);
    }
    
    const keyPath = path.join(configDir, 'docusign_private.key');
    console.log(`\n📄 Please save your private key to: ${keyPath}`);
    console.log('   (Download from DocuSign Admin > Apps and Keys)\n');
    
    const keyExists = await question('Have you saved the key? (yes/no): ');
    if (keyExists.toLowerCase() === 'yes' || keyExists.toLowerCase() === 'y') {
      if (fs.existsSync(keyPath)) {
        console.log('✅ Private key file found!');
      } else {
        console.log('⚠️  File not found. Please save it before continuing.');
      }
    }
    
    privateKeyConfig = 'DOCUSIGN_PRIVATE_KEY_PATH=./config/docusign_private.key';
  }

  // Step 4: Optional webhook secret
  console.log('\n─────────────────────────────────────────────────────────\n');
  const webhookSecret = await question('Webhook HMAC Secret (optional, press Enter to skip): ');

  // Step 5: Write to .env
  console.log('\n─────────────────────────────────────────────────────────\n');
  console.log('💾 Updating .env file...\n');

  const envContent = fs.readFileSync(envPath, 'utf8');
  let updatedContent = envContent;

  // Update or append DocuSign variables
  const updates = {
    'DOCUSIGN_INTEGRATION_KEY': integrationKey,
    'DOCUSIGN_ACCOUNT_ID': accountId,
    'DOCUSIGN_USER_ID': userId,
    'DOCUSIGN_TEMPLATE_ID': templateId,
    'DOCUSIGN_BASE_PATH': basePath,
    'DOCUSIGN_WEBHOOK_SECRET': webhookSecret
  };

  for (const [key, value] of Object.entries(updates)) {
    if (value) {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(updatedContent)) {
        updatedContent = updatedContent.replace(regex, `${key}=${value}`);
      } else {
        updatedContent += `\n${key}=${value}`;
      }
    }
  }

  // Add private key config
  if (keyMethod === '2') {
    const regex = /^DOCUSIGN_PRIVATE_KEY=.*$/m;
    if (regex.test(updatedContent)) {
      updatedContent = updatedContent.replace(regex, privateKeyConfig);
    } else {
      updatedContent += `\n${privateKeyConfig}`;
    }
  } else {
    const regex = /^DOCUSIGN_PRIVATE_KEY_PATH=.*$/m;
    if (regex.test(updatedContent)) {
      updatedContent = updatedContent.replace(regex, privateKeyConfig);
    } else {
      updatedContent += `\n${privateKeyConfig}`;
    }
  }

  fs.writeFileSync(envPath, updatedContent);
  console.log('✅ .env file updated!\n');

  // Step 6: Test configuration
  console.log('─────────────────────────────────────────────────────────\n');
  const runTest = await question('Would you like to test the configuration now? (yes/no): ');
  
  if (runTest.toLowerCase() === 'yes' || runTest.toLowerCase() === 'y') {
    console.log('\n🧪 Running configuration test...\n');
    rl.close();
    
    // Reload environment variables
    require('dotenv').config();
    
    // Run test script
    try {
      require('./test-docusign.js');
    } catch (error) {
      console.error('❌ Test failed:', error.message);
      console.log('\n💡 Check DOCUSIGN_SETUP.md for troubleshooting.\n');
    }
  } else {
    console.log('\n✅ Configuration saved!');
    console.log('\n📝 Next steps:');
    console.log('   1. Grant consent: Visit the consent URL (see DOCUSIGN_SETUP.md Step 11)');
    console.log('   2. Test configuration: node scripts/test-docusign.js');
    console.log('   3. Start server: npm run dev');
    console.log('   4. Submit test application\n');
    console.log('📖 Full documentation: DOCUSIGN_SETUP.md');
    console.log('📋 Quick reference: DOCUSIGN_CHECKLIST.md\n');
    rl.close();
  }
}

main().catch(error => {
  console.error('\n❌ Error:', error.message);
  rl.close();
  process.exit(1);
});
