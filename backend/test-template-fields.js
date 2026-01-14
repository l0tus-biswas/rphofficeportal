const docusignUtils = require('./utils/docusign.js');

async function testTemplateFields() {
  try {
    console.log('Fetching template fields from DocuSign...\n');
    const template = await docusignUtils.getTemplateFields();
    
    if (template.recipients && template.recipients.signers) {
      const signer = template.recipients.signers[0];
      console.log('Role Name:', signer.roleName);
      console.log('\nText Tabs:');
      if (signer.tabs && signer.tabs.textTabs) {
        signer.tabs.textTabs.forEach((tab, idx) => {
          console.log(`  ${idx + 1}. Label: "${tab.tabLabel}"`);
          console.log(`     Page: ${tab.pageNumber}, Position: (${tab.xPosition}, ${tab.yPosition})`);
          console.log(`     Required: ${tab.required}, Locked: ${tab.locked}`);
          console.log('');
        });
      } else {
        console.log('  No text tabs found!');
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.body);
    }
  }
  process.exit(0);
}

testTemplateFields();
