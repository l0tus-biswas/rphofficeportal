/**
 * Seed script: Create default onboarding document types
 * Run: node backend/scripts/seedOnboardingDocTypes.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const OnboardingDocType = require('../models/OnboardingDocType');

const DEFAULT_DOC_TYPES = [
  {
    name: 'APA Agreement',
    description: 'Agent Producer Agreement — signed via DocuSign. This is auto-populated after signing.',
    required: true,
    agentCanUpload: false,
    agentCanDelete: false,
    isReadOnlyLink: true,
    sortOrder: 1
  },
  {
    name: 'CMS Certificate',
    description: 'Centers for Medicare & Medicaid Services certification document.',
    required: true,
    agentCanUpload: true,
    agentCanDelete: true,
    isReadOnlyLink: false,
    sortOrder: 2
  },
  {
    name: 'E&O Insurance',
    description: 'Errors & Omissions insurance certificate.',
    required: true,
    agentCanUpload: true,
    agentCanDelete: true,
    isReadOnlyLink: false,
    sortOrder: 3
  },
  {
    name: 'W-9',
    description: 'IRS W-9 Request for Taxpayer Identification Number form.',
    required: true,
    agentCanUpload: true,
    agentCanDelete: true,
    isReadOnlyLink: false,
    sortOrder: 4
  },
  {
    name: 'Direct Deposit',
    description: 'Direct deposit authorization form for commission payments.',
    required: true,
    agentCanUpload: true,
    agentCanDelete: true,
    isReadOnlyLink: false,
    sortOrder: 5
  }
];

async function seedOnboardingDocTypes() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    let created = 0;
    let skipped = 0;

    for (const docTypeData of DEFAULT_DOC_TYPES) {
      const existing = await OnboardingDocType.findOne({ name: docTypeData.name });
      if (existing) {
        console.log(`Skipped (exists): ${docTypeData.name}`);
        skipped++;
      } else {
        await OnboardingDocType.create(docTypeData);
        console.log(`Created: ${docTypeData.name}`);
        created++;
      }
    }

    console.log('\n--- Seed Summary ---');
    console.log(`Created: ${created}`);
    console.log(`Skipped: ${skipped}`);

  } catch (err) {
    console.error('Fatal error:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

seedOnboardingDocTypes();
