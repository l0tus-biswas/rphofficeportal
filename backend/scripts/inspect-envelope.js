const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const docusign = require('docusign-esign');

function getDocuSignClient() {
  const apiClient = new docusign.ApiClient();
  apiClient.setBasePath(process.env.DOCUSIGN_BASE_PATH || 'https://demo.docusign.net/restapi');
  return apiClient;
}

async function authenticateWithJWT() {
  const apiClient = getDocuSignClient();

  let privateKey;
  if (process.env.DOCUSIGN_PRIVATE_KEY_PATH) {
    privateKey = fs.readFileSync(path.resolve(process.env.DOCUSIGN_PRIVATE_KEY_PATH), 'utf8');
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
}

async function inspectEnvelope(envelopeId) {
  const apiClient = await authenticateWithJWT();
  const envelopesApi = new docusign.EnvelopesApi(apiClient);
  const accountId = process.env.DOCUSIGN_ACCOUNT_ID;

  const envelope = await envelopesApi.getEnvelope(accountId, envelopeId, { include: 'recipients,tabs' });
  const recipients = envelope.recipients?.signers || [];

  console.log(`\nEnvelope ${envelopeId}: status=${envelope.status}`);

  recipients.forEach((signer, idx) => {
    console.log(`\nSigner ${idx + 1} (${signer.roleName}):`);
    if (signer.tabs?.textTabs?.length) {
      signer.tabs.textTabs.forEach(tab => {
        console.log(`  ${tab.tabLabel} (id: ${tab.tabId}) => "${tab.value}"`);
      });
    } else {
      console.log('  No text tabs found.');
    }
  });

  const dumpPath = path.resolve(__dirname, `envelope-${envelopeId}.json`);
  fs.writeFileSync(dumpPath, JSON.stringify(envelope, null, 2));
  console.log(`\nFull envelope saved to ${dumpPath}`);
}

const envelopeId = process.argv[2];
if (!envelopeId) {
  console.error('Usage: node scripts/inspect-envelope.js <envelopeId>');
  process.exit(1);
}

inspectEnvelope(envelopeId).catch(err => {
  console.error('Error inspecting envelope:', err.message);
  if (err.response?.body) {
    console.error(err.response.body);
  }
  process.exit(1);
});
