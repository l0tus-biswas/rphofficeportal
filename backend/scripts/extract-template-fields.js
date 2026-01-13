const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, '../../NEWRHPAPAAGREEMENT.json');
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

console.log('Template ID:', data.templateId);
console.log('Template Name:', data.name);
console.log('\nFields in template:');

const signer = data.recipients?.signers?.[0];
if (signer && signer.tabs) {
  Object.keys(signer.tabs).forEach(tabType => {
    console.log(`\n${tabType.toUpperCase()}:`);
    signer.tabs[tabType].forEach(tab => {
      console.log(`  - ${tab.tabLabel || tab.name} (${tab.documentId})`);
    });
  });
}

process.exit(0);
