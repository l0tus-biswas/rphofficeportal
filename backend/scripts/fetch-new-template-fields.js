const docusign = require('docusign-esign');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// New template ID
const NEW_TEMPLATE_ID = '59914a8d-766e-469e-a29b-e955bf2df4da';

async function authenticateWithJWT() {
  try {
    const apiClient = new docusign.ApiClient();
    apiClient.setBasePath(process.env.DOCUSIGN_BASE_PATH || 'https://demo.docusign.net/restapi');
    
    let privateKey;
    if (process.env.DOCUSIGN_PRIVATE_KEY_PATH) {
      privateKey = fs.readFileSync(
        path.resolve(process.env.DOCUSIGN_PRIVATE_KEY_PATH),
        'utf8'
      );
    } else if (process.env.DOCUSIGN_PRIVATE_KEY) {
      privateKey = Buffer.from(process.env.DOCUSIGN_PRIVATE_KEY, 'base64').toString('utf8');
    } else {
      throw new Error('DocuSign private key not configured');
    }

    const jwtLifeSec = 10 * 60;
    const scopes = ['signature', 'impersonation'];

    const results = await apiClient.requestJWTUserToken(
      process.env.DOCUSIGN_INTEGRATION_KEY,
      process.env.DOCUSIGN_USER_ID,
      scopes,
      privateKey,
      jwtLifeSec
    );

    apiClient.addDefaultHeader('Authorization', 'Bearer ' + results.body.access_token);
    return apiClient;
  } catch (error) {
    console.error('Authentication Error:', error.message);
    throw error;
  }
}

async function fetchTemplateFields() {
  try {
    console.log('\n=== Fetching New DocuSign Template Fields ===');
    console.log('Template ID:', NEW_TEMPLATE_ID);
    console.log('Account ID:', process.env.DOCUSIGN_ACCOUNT_ID);
    
    const apiClient = await authenticateWithJWT();
    const templatesApi = new docusign.TemplatesApi(apiClient);
    const accountId = process.env.DOCUSIGN_ACCOUNT_ID;

    // Fetch template with all details
    const template = await templatesApi.get(accountId, NEW_TEMPLATE_ID, { 
      include: 'recipients,tabs,documents' 
    });

    console.log('\n=== Template Details ===');
    console.log('Template Name:', template.name);
    console.log('Description:', template.description || 'N/A');
    console.log('Created:', template.created);
    console.log('Last Modified:', template.lastModified);
    console.log('Page Count:', template.pageCount);
    
    console.log('\n=== Documents ===');
    if (template.documents) {
      template.documents.forEach(doc => {
        console.log(`  - Document ID: ${doc.documentId}`);
        console.log(`    Name: ${doc.name}`);
        console.log(`    Pages: ${doc.pages}`);
        console.log(`    Order: ${doc.order}`);
      });
    }

    console.log('\n=== Recipients/Roles ===');
    if (template.recipients?.signers) {
      template.recipients.signers.forEach((signer, idx) => {
        console.log(`\nSigner ${idx + 1}:`);
        console.log(`  Role Name: ${signer.roleName}`);
        console.log(`  Recipient ID: ${signer.recipientId}`);
        console.log(`  Routing Order: ${signer.routingOrder}`);
        
        if (signer.tabs) {
          console.log('\n  === Tabs ===');
          
          if (signer.tabs.textTabs && signer.tabs.textTabs.length > 0) {
            console.log('\n  Text Tabs:');
            signer.tabs.textTabs.forEach(tab => {
              console.log(`    - Label: "${tab.tabLabel}"`);
              console.log(`      Tab ID: ${tab.tabId}`);
              console.log(`      Document ID: ${tab.documentId}`);
              console.log(`      Page Number: ${tab.pageNumber}`);
              console.log(`      Required: ${tab.required || 'false'}`);
              console.log(`      Locked: ${tab.locked || 'false'}`);
              console.log('');
            });
          }
          
          if (signer.tabs.checkboxTabs && signer.tabs.checkboxTabs.length > 0) {
            console.log('\n  Checkbox Tabs:');
            signer.tabs.checkboxTabs.forEach(tab => {
              console.log(`    - Label: "${tab.tabLabel}"`);
              console.log(`      Tab ID: ${tab.tabId}`);
              console.log(`      Document ID: ${tab.documentId}`);
              console.log(`      Page Number: ${tab.pageNumber}`);
              console.log('');
            });
          }
          
          if (signer.tabs.radioGroupTabs && signer.tabs.radioGroupTabs.length > 0) {
            console.log('\n  Radio Group Tabs:');
            signer.tabs.radioGroupTabs.forEach(group => {
              console.log(`    - Group Name: "${group.groupName}"`);
              console.log(`      Document ID: ${group.documentId}`);
              if (group.radios) {
                group.radios.forEach(radio => {
                  console.log(`        Radio: "${radio.value}" (Page ${radio.pageNumber})`);
                });
              }
              console.log('');
            });
          }
          
          if (signer.tabs.signHereTabs && signer.tabs.signHereTabs.length > 0) {
            console.log('\n  Signature Tabs:');
            signer.tabs.signHereTabs.forEach(tab => {
              console.log(`    - Label: "${tab.tabLabel || 'Signature'}"`);
              console.log(`      Tab ID: ${tab.tabId}`);
              console.log(`      Document ID: ${tab.documentId}`);
              console.log(`      Page Number: ${tab.pageNumber}`);
              console.log('');
            });
          }
          
          if (signer.tabs.dateSignedTabs && signer.tabs.dateSignedTabs.length > 0) {
            console.log('\n  Date Signed Tabs:');
            signer.tabs.dateSignedTabs.forEach(tab => {
              console.log(`    - Label: "${tab.tabLabel || 'Date Signed'}"`);
              console.log(`      Tab ID: ${tab.tabId}`);
              console.log(`      Document ID: ${tab.documentId}`);
              console.log(`      Page Number: ${tab.pageNumber}`);
              console.log('');
            });
          }
        }
      });
    }

    // Save to JSON file
    const outputPath = path.join(__dirname, '../scripts/new-template-fields.json');
    fs.writeFileSync(outputPath, JSON.stringify(template, null, 2));
    console.log('\n=== Template data saved to:', outputPath, '===\n');

    // Create a field mapping summary
    console.log('\n=== Field Mapping Summary ===');
    console.log('Use these field labels when mapping APA application data:\n');
    
    if (template.recipients?.signers?.[0]?.tabs?.textTabs) {
      console.log('TEXT FIELDS:');
      template.recipients.signers[0].tabs.textTabs.forEach(tab => {
        console.log(`  "${tab.tabLabel}"`);
      });
    }
    
    if (template.recipients?.signers?.[0]?.tabs?.checkboxTabs) {
      console.log('\nCHECKBOX FIELDS:');
      template.recipients.signers[0].tabs.checkboxTabs.forEach(tab => {
        console.log(`  "${tab.tabLabel}"`);
      });
    }
    
    console.log('\n=====================================\n');

  } catch (error) {
    console.error('\nError fetching template:', error.message);
    if (error.response?.body) {
      console.error('Response:', JSON.stringify(error.response.body, null, 2));
    }
    process.exit(1);
  }
}

// Run the script
fetchTemplateFields().then(() => {
  console.log('Script completed successfully!');
  process.exit(0);
});
