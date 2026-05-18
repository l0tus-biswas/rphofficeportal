/**
 * Temporary script to fetch DocuSign template fields
 * Run: node fetch-template-fields.js
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

async function main() {
  try {
    const docusign = require('docusign-esign');
    const fs = require('fs');
    
    // Use the correct account ID for the new template
    const accountId = process.argv[3] || process.env.DOCUSIGN_ACCOUNT_ID;
    // Test with OLD template first to verify creds work, then new template
    const templateId = process.argv[2] || '2eb68861-e53b-4995-aa98-138c8173492f';
    
    console.log(`Fetching fields for template: ${templateId}`);
    console.log(`Using account: ${accountId}\n`);
    
    // Authenticate directly (bypass SystemConfig DB dependency)
    const apiClient = new docusign.ApiClient();
    apiClient.setBasePath(process.env.DOCUSIGN_BASE_PATH || 'https://demo.docusign.net/restapi');
    
    let privateKey;
    if (process.env.DOCUSIGN_PRIVATE_KEY_PATH) {
      privateKey = fs.readFileSync(path.resolve(process.env.DOCUSIGN_PRIVATE_KEY_PATH), 'utf8');
    } else if (process.env.DOCUSIGN_PRIVATE_KEY) {
      privateKey = Buffer.from(process.env.DOCUSIGN_PRIVATE_KEY, 'base64').toString('utf8');
    }
    
    const jwtResult = await apiClient.requestJWTUserToken(
      process.env.DOCUSIGN_INTEGRATION_KEY,
      process.env.DOCUSIGN_USER_ID,
      ['signature', 'impersonation'],
      privateKey,
      600
    );
    apiClient.addDefaultHeader('Authorization', 'Bearer ' + jwtResult.body.access_token);
    
    // List accounts the user has access to
    const userInfo = await apiClient.getUserInfo(jwtResult.body.access_token);
    console.log('Available accounts:');
    userInfo.accounts.forEach(a => {
      console.log(`  - ${a.accountId} (${a.accountName}) ${a.isDefault ? '[DEFAULT]' : ''}`);
    });
    console.log('');
    
    const templatesApi = new docusign.TemplatesApi(apiClient);
    const template = await templatesApi.get(accountId, templateId, { include: 'recipients,tabs' });
    
    console.log('Template Name:', template.name);
    console.log('');
    
    // Output structured JSON for easy parsing
    const result = { signers: [] };
    
    if (template.recipients?.signers) {
      template.recipients.signers.forEach((signer, idx) => {
        const signerData = {
          index: idx + 1,
          roleName: signer.roleName,
          textTabs: [],
          checkboxTabs: [],
          signHereTabs: [],
          dateSignedTabs: [],
          otherTabs: []
        };
        
        if (signer.tabs?.textTabs) {
          signerData.textTabs = signer.tabs.textTabs.map(t => ({
            tabLabel: t.tabLabel,
            value: t.value || '',
            required: t.required
          }));
        }
        if (signer.tabs?.checkboxTabs) {
          signerData.checkboxTabs = signer.tabs.checkboxTabs.map(t => ({
            tabLabel: t.tabLabel,
            selected: t.selected
          }));
        }
        if (signer.tabs?.signHereTabs) {
          signerData.signHereTabs = signer.tabs.signHereTabs.map(t => ({
            tabLabel: t.tabLabel || 'Signature'
          }));
        }
        if (signer.tabs?.dateSignedTabs) {
          signerData.dateSignedTabs = signer.tabs.dateSignedTabs.map(t => ({
            tabLabel: t.tabLabel
          }));
        }
        
        result.signers.push(signerData);
      });
    }
    
    console.log('\n=== STRUCTURED OUTPUT ===');
    console.log(JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response?.body) {
      console.error('DocuSign API Error:', JSON.stringify(error.response.body, null, 2));
    }
  } finally {
    process.exit(0);
  }
}

main();
