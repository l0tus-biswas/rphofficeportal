/**
 * Fetch DocuSign template fields with position data for checkbox mapping
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

async function main() {
  try {
    const docusign = require('docusign-esign');
    const fs = require('fs');
    
    const accountId = process.argv[3] || process.env.DOCUSIGN_ACCOUNT_ID;
    const templateId = process.argv[2] || process.env.DOCUSIGN_TEMPLATE_ID;
    
    console.log(`Fetching detailed fields for template: ${templateId}`);
    console.log(`Using account: ${accountId}\n`);
    
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
    
    const templatesApi = new docusign.TemplatesApi(apiClient);
    const template = await templatesApi.get(accountId, templateId, { include: 'recipients,tabs' });
    
    console.log('Template Name:', template.name);
    console.log('');
    
    if (template.recipients?.signers) {
      template.recipients.signers.forEach((signer, idx) => {
        console.log(`\n=== Signer ${idx + 1}: ${signer.roleName} ===\n`);
        
        // Text tabs with position
        if (signer.tabs?.textTabs) {
          console.log('--- TEXT TABS (sorted by page, then Y position) ---');
          const sorted = [...signer.tabs.textTabs].sort((a, b) => {
            const pageDiff = (parseInt(a.pageNumber) || 1) - (parseInt(b.pageNumber) || 1);
            if (pageDiff !== 0) return pageDiff;
            return (parseInt(a.yPosition) || 0) - (parseInt(b.yPosition) || 0);
          });
          sorted.forEach((t, i) => {
            console.log(`  ${i + 1}. [Page ${t.pageNumber || '?'}] Y:${t.yPosition || '?'} X:${t.xPosition || '?'} | Label: ${t.tabLabel} | Value: "${t.value || ''}" | Name: "${t.name || ''}" | Required: ${t.required}`);
          });
        }
        
        // Checkbox tabs with position
        if (signer.tabs?.checkboxTabs) {
          console.log('\n--- CHECKBOX TABS (sorted by page, then Y position, then X position) ---');
          const sorted = [...signer.tabs.checkboxTabs].sort((a, b) => {
            const pageDiff = (parseInt(a.pageNumber) || 1) - (parseInt(b.pageNumber) || 1);
            if (pageDiff !== 0) return pageDiff;
            const yDiff = (parseInt(a.yPosition) || 0) - (parseInt(b.yPosition) || 0);
            if (yDiff !== 0) return yDiff;
            return (parseInt(a.xPosition) || 0) - (parseInt(b.xPosition) || 0);
          });
          sorted.forEach((t, i) => {
            console.log(`  ${i + 1}. [Page ${t.pageNumber || '?'}] Y:${t.yPosition || '?'} X:${t.xPosition || '?'} | Label: ${t.tabLabel} | Selected: ${t.selected} | Name: "${t.name || ''}" | TabGroupLabels: ${JSON.stringify(t.tabGroupLabels || [])}`);
          });
        }
        
        // Sign here tabs
        if (signer.tabs?.signHereTabs) {
          console.log('\n--- SIGN HERE TABS ---');
          signer.tabs.signHereTabs.forEach((t, i) => {
            console.log(`  ${i + 1}. [Page ${t.pageNumber || '?'}] Y:${t.yPosition || '?'} | Label: ${t.tabLabel}`);
          });
        }
        
        // Date signed tabs
        if (signer.tabs?.dateSignedTabs) {
          console.log('\n--- DATE SIGNED TABS ---');
          signer.tabs.dateSignedTabs.forEach((t, i) => {
            console.log(`  ${i + 1}. [Page ${t.pageNumber || '?'}] Y:${t.yPosition || '?'} | Label: ${t.tabLabel}`);
          });
        }
      });
    }
    
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
