const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load backend .env
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const { createAPAEnvelope } = require('../utils/docusign');

async function run() {
  try {
    console.log('=== Creating DocuSign Test Envelope ===');

    const sampleApplication = {
      personalInfo: {
        legalFirstName: 'Test',
        legalMiddleName: 'Q',
        legalLastName: 'User',
        dateOfBirth: new Date('1990-01-01'),
        mobilePhone: '555-123-4567',
        email: process.env.DOCUSIGN_TEST_EMAIL || 'lotusbiswaswork@gmail.com'
      }
    };

    const result = await createAPAEnvelope(sampleApplication);
    console.log('Envelope created:', result);
  } catch (error) {
    console.error('Failed to create DocuSign test envelope:', error.message);
    process.exitCode = 1;
  }
}

run();
