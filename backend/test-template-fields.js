const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const envPath = path.resolve(__dirname, '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const docusignUtils = require('./utils/docusign.js');

async function testTemplateFields() {
  try {
    console.log('Fetching template fields from DocuSign...\n');
    console.log('DOCUSIGN_PRIVATE_KEY_PATH:', process.env.DOCUSIGN_PRIVATE_KEY_PATH);
    console.log('DOCUSIGN_PRIVATE_KEY (exists?):', !!process.env.DOCUSIGN_PRIVATE_KEY);
    console.log('Env loaded from:', __dirname);
    const template = await docusignUtils.getTemplateFields();
    
    if (template.recipients?.signers?.length) {
      const signer = template.recipients.signers[0];
      console.log('Role Name:', signer.roleName);
      console.log('\nText Tabs:');
      if (signer.tabs?.textTabs?.length) {
        signer.tabs.textTabs.forEach((tab, idx) => {
          console.log(`  ${idx + 1}. Label: "${tab.tabLabel}" (tabId: ${tab.tabId})`);
          console.log(`     Page: ${tab.pageNumber}, Position: (${tab.xPosition}, ${tab.yPosition})`);
          console.log(`     Required: ${tab.required}, Locked: ${tab.locked}`);
          console.log('');
        });
      } else {
        console.log('  No text tabs found for this signer!');
      }
    } else {
      console.log('⚠️  DocuSign returned a template without any signers or tabs.');
      console.log('   Raw template response saved to template-dump.json for inspection.');
      fs.writeFileSync(path.join(__dirname, 'template-dump.json'), JSON.stringify(template, null, 2));
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
