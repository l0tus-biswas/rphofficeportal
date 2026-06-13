/**
 * Script to add missing model and util mocks to integration test files.
 * Run: node scripts/fix-integration-mocks.js
 */
const fs = require('fs');
const path = require('path');

const ALL_MODELS = [
  'ACAClientRecord', 'AcaTierConfig', 'AgentCarrierStatus', 'APAApplication',
  'AuditLog', 'Broadcast', 'Carrier', 'CommissionStatement', 'Coupon',
  'DocumentFolder', 'DocumentHubFile', 'DocumentRequest', 'ExamFXProgress',
  'LicensingProgress', 'Notification', 'NotificationPreference', 'Onboarding',
  'OnboardingDocType', 'OnboardingDocument', 'Payment', 'PrintfulOrder',
  'ProductionSubmission', 'ProductType', 'PromotionLevel', 'Subscription',
  'SystemConfig', 'TrainingCategory', 'TrainingFolder', 'TrainingMaterial', 'User'
];

const ALL_UTILS = ['neuzmail', 'docusign', 'quickbooks', 'stripe'];

const dir = path.join(__dirname, '..', 'tests', 'integration');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.js'));

files.forEach(file => {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Find existing model mocks
  const existingModels = new Set();
  const modelRegex = /jest\.mock\(['"]\.\.\/\.\.\/models\/(\w+)['"]/g;
  let m;
  while ((m = modelRegex.exec(content)) !== null) {
    existingModels.add(m[1]);
  }
  
  // Find existing util mocks
  const existingUtils = new Set();
  const utilRegex = /jest\.mock\(['"]\.\.\/\.\.\/utils\/(\w+)['"]/g;
  while ((m = utilRegex.exec(content)) !== null) {
    existingUtils.add(m[1]);
  }
  
  // Find the last simple jest.mock line (not mongoose factory)
  const lines = content.split('\n');
  let lastMockLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/jest\.mock\(['"]\.\.\/\.\.\/models\//.test(lines[i]) || 
        /jest\.mock\(['"]\.\.\/\.\.\/utils\//.test(lines[i])) {
      lastMockLine = i;
    }
  }
  
  if (lastMockLine === -1) {
    console.log(`${file}: no mock lines found, skipping`);
    return;
  }
  
  // Build missing mock lines
  const missingLines = [];
  ALL_MODELS.forEach(model => {
    if (!existingModels.has(model)) {
      missingLines.push(`jest.mock('../../models/${model}');`);
    }
  });
  ALL_UTILS.forEach(util => {
    if (!existingUtils.has(util)) {
      missingLines.push(`jest.mock('../../utils/${util}');`);
    }
  });
  
  if (missingLines.length > 0) {
    lines.splice(lastMockLine + 1, 0, ...missingLines);
    fs.writeFileSync(filePath, lines.join('\n'));
    console.log(`${file}: added ${missingLines.length} missing mocks`);
  } else {
    console.log(`${file}: all mocks present`);
  }
});
