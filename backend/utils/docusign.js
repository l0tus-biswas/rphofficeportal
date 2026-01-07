const docusign = require('docusign-esign');
const fs = require('fs');
const path = require('path');

/**
 * DocuSign Integration Utility
 * Handles authentication, envelope creation, and webhook processing
 */

// Initialize DocuSign API client
function getDocuSignClient() {
  const apiClient = new docusign.ApiClient();
  apiClient.setBasePath(process.env.DOCUSIGN_BASE_PATH || 'https://demo.docusign.net/restapi');
  return apiClient;
}

/**
 * Authenticate with DocuSign using JWT
 * @returns {Promise<string>} Access token
 */
async function authenticateWithJWT() {
  try {
    const apiClient = getDocuSignClient();
    
    // Read private key from file or environment variable
    let privateKey;
    if (process.env.DOCUSIGN_PRIVATE_KEY_PATH) {
      privateKey = fs.readFileSync(
        path.resolve(process.env.DOCUSIGN_PRIVATE_KEY_PATH),
        'utf8'
      );
    } else if (process.env.DOCUSIGN_PRIVATE_KEY) {
      // If key is stored directly in env (base64 encoded)
      privateKey = Buffer.from(process.env.DOCUSIGN_PRIVATE_KEY, 'base64').toString('utf8');
    } else {
      throw new Error('DocuSign private key not configured');
    }

    const jwtLifeSec = 10 * 60; // 10 minutes
    const scopes = ['signature', 'impersonation'];

    const results = await apiClient.requestJWTUserToken(
      process.env.DOCUSIGN_INTEGRATION_KEY,
      process.env.DOCUSIGN_USER_ID,
      scopes,
      privateKey,
      jwtLifeSec
    );

    apiClient.addDefaultHeader('Authorization', 'Bearer ' + results.body.access_token);
    return results.body.access_token;
  } catch (error) {
    console.error('DocuSign JWT Authentication Error:', error);
    throw new Error('Failed to authenticate with DocuSign: ' + error.message);
  }
}

/**
 * Create and send DocuSign envelope for APA agreement
 * @param {Object} application - APAApplication document
 * @returns {Promise<Object>} Envelope details (envelopeId, signingUrl, status)
 */
async function createAPAEnvelope(application) {
  try {
    const accessToken = await authenticateWithJWT();
    const apiClient = getDocuSignClient();
    apiClient.addDefaultHeader('Authorization', 'Bearer ' + accessToken);

    const envelopesApi = new docusign.EnvelopesApi(apiClient);
    const accountId = process.env.DOCUSIGN_ACCOUNT_ID;

    // Create envelope definition
    const envelope = new docusign.EnvelopeDefinition();
    envelope.emailSubject = 'Please sign the Agent Partnership Agreement';
    envelope.templateId = process.env.DOCUSIGN_TEMPLATE_ID; // APA template created in DocuSign

    // Create signer
    const signer = new docusign.TemplateRole();
    signer.email = application.personalInfo.email;
    signer.name = `${application.personalInfo.legalFirstName} ${application.personalInfo.legalLastName}`;
    signer.roleName = 'Applicant'; // Must match role name in DocuSign template
    signer.clientUserId = application._id.toString(); // For embedded signing (optional)

    // Add custom fields to pre-fill template
    signer.tabs = createSignerTabs(application);

    envelope.templateRoles = [signer];
    envelope.status = 'sent'; // Send immediately

    // Create the envelope
    const results = await envelopesApi.createEnvelope(accountId, {
      envelopeDefinition: envelope
    });

    console.log('DocuSign Envelope Created:', results.envelopeId);

    // Get recipient view (signing URL) for embedded signing
    // If you want email-based signing only, skip this part
    const viewRequest = new docusign.RecipientViewRequest();
    viewRequest.returnUrl = `${process.env.APP_URL || 'http://localhost:4200'}/apa-signing-complete?applicationId=${application._id}`;
    viewRequest.authenticationMethod = 'none';
    viewRequest.email = signer.email;
    viewRequest.userName = signer.name;
    viewRequest.clientUserId = signer.clientUserId;

    const viewResults = await envelopesApi.createRecipientView(accountId, results.envelopeId, {
      recipientViewRequest: viewRequest
    });

    return {
      envelopeId: results.envelopeId,
      signingUrl: viewResults.url,
      status: 'sent'
    };
  } catch (error) {
    console.error('DocuSign Envelope Creation Error:', error);
    throw new Error('Failed to create DocuSign envelope: ' + error.message);
  }
}

/**
 * Create signer tabs to pre-fill template fields with application data
 * @param {Object} application - APAApplication document
 * @returns {Object} DocuSign tabs object
 */
function createSignerTabs(application) {
  const tabs = new docusign.Tabs();

  // Text tabs to pre-fill applicant information
  const textTabs = [];

  // Personal Information
  textTabs.push(
    createTextTab('applicant_name', `${application.personalInfo.legalFirstName} ${application.personalInfo.legalLastName}`),
    createTextTab('applicant_email', application.personalInfo.email),
    createTextTab('applicant_phone', application.personalInfo.mobilePhone || ''),
    createTextTab('applicant_address', formatAddress(application.personalInfo)),
    createTextTab('applicant_ssn', application.personalInfo.ssn || '***-**-****')
  );

  // Date of Birth
  if (application.personalInfo.dateOfBirth) {
    textTabs.push(createTextTab('applicant_dob', formatDate(application.personalInfo.dateOfBirth)));
  }

  // Licensing Information
  if (application.licensingStatus?.currentlyLicensed) {
    textTabs.push(
      createTextTab('license_state', application.licensingStatus.state || ''),
      createTextTab('license_number', application.licensingStatus.licenseNumber || '')
    );
  }

  // Recruiting Information
  if (application.recruitingInfo?.referralCode) {
    textTabs.push(createTextTab('referral_code', application.recruitingInfo.referralCode));
  }

  tabs.textTabs = textTabs;

  return tabs;
}

/**
 * Helper to create a text tab
 */
function createTextTab(tabLabel, value) {
  const textTab = new docusign.Text();
  textTab.tabLabel = tabLabel;
  textTab.value = value || '';
  textTab.locked = 'true'; // Make it read-only
  return textTab;
}

/**
 * Format address for DocuSign
 */
function formatAddress(personalInfo) {
  const parts = [];
  if (personalInfo.streetAddress) parts.push(personalInfo.streetAddress);
  if (personalInfo.city) parts.push(personalInfo.city);
  if (personalInfo.state) parts.push(personalInfo.state);
  if (personalInfo.zipCode) parts.push(personalInfo.zipCode);
  return parts.join(', ');
}

/**
 * Format date for DocuSign
 */
function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US');
}

/**
 * Get envelope status from DocuSign
 * @param {string} envelopeId - DocuSign envelope ID
 * @returns {Promise<Object>} Envelope status details
 */
async function getEnvelopeStatus(envelopeId) {
  try {
    const accessToken = await authenticateWithJWT();
    const apiClient = getDocuSignClient();
    apiClient.addDefaultHeader('Authorization', 'Bearer ' + accessToken);

    const envelopesApi = new docusign.EnvelopesApi(apiClient);
    const accountId = process.env.DOCUSIGN_ACCOUNT_ID;

    const results = await envelopesApi.getEnvelope(accountId, envelopeId);

    return {
      status: results.status,
      sentDateTime: results.sentDateTime,
      completedDateTime: results.completedDateTime,
      statusChangedDateTime: results.statusChangedDateTime,
      recipients: results.recipients
    };
  } catch (error) {
    console.error('DocuSign Get Envelope Status Error:', error);
    throw new Error('Failed to get envelope status: ' + error.message);
  }
}

/**
 * Download signed document from DocuSign
 * @param {string} envelopeId - DocuSign envelope ID
 * @param {string} savePath - Where to save the document
 * @returns {Promise<string>} Path to saved document
 */
async function downloadSignedDocument(envelopeId, savePath) {
  try {
    const accessToken = await authenticateWithJWT();
    const apiClient = getDocuSignClient();
    apiClient.addDefaultHeader('Authorization', 'Bearer ' + accessToken);

    const envelopesApi = new docusign.EnvelopesApi(apiClient);
    const accountId = process.env.DOCUSIGN_ACCOUNT_ID;

    // Get combined document (all documents in envelope as single PDF)
    const results = await envelopesApi.getDocument(accountId, envelopeId, 'combined');

    // Ensure directory exists
    const dir = path.dirname(savePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Save document
    fs.writeFileSync(savePath, results);

    console.log('Signed document saved:', savePath);
    return savePath;
  } catch (error) {
    console.error('DocuSign Download Document Error:', error);
    throw new Error('Failed to download signed document: ' + error.message);
  }
}

/**
 * Process DocuSign webhook event
 * @param {Object} webhookData - DocuSign Connect webhook payload
 * @returns {Promise<Object>} Processed event data
 */
async function processWebhook(webhookData) {
  try {
    // DocuSign sends XML by default, you may need to configure JSON in Connect settings
    const envelopeId = webhookData.envelopeId || webhookData.data?.envelopeId;
    const status = webhookData.status || webhookData.data?.envelopeSummary?.status;
    const recipients = webhookData.recipients || webhookData.data?.envelopeSummary?.recipients;

    console.log('DocuSign Webhook Received:', {
      envelopeId,
      status,
      recipientCount: recipients?.length
    });

    // Map DocuSign status to our application status
    let appStatus = 'pending_signature';
    let signedAt = null;

    switch (status) {
      case 'completed':
        appStatus = 'pending_payment';
        signedAt = new Date();
        break;
      case 'declined':
        appStatus = 'declined';
        break;
      case 'voided':
        appStatus = 'voided';
        break;
      case 'sent':
        appStatus = 'pending_signature';
        break;
      default:
        appStatus = 'pending_signature';
    }

    return {
      envelopeId,
      status,
      appStatus,
      signedAt,
      recipients
    };
  } catch (error) {
    console.error('DocuSign Webhook Processing Error:', error);
    throw new Error('Failed to process webhook: ' + error.message);
  }
}

/**
 * Validate DocuSign webhook signature (HMAC)
 * This ensures the webhook is actually from DocuSign
 * @param {Object} req - Express request object
 * @returns {boolean} True if signature is valid
 */
function validateWebhookSignature(req) {
  try {
    const signature = req.headers['x-docusign-signature-1'];
    const webhookKey = process.env.DOCUSIGN_WEBHOOK_SECRET;

    if (!signature || !webhookKey) {
      console.warn('DocuSign webhook validation skipped - missing signature or key');
      return true; // Allow in development
    }

    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', webhookKey);
    hmac.update(JSON.stringify(req.body));
    const calculatedSignature = hmac.digest('base64');

    const isValid = signature === calculatedSignature;
    
    if (!isValid) {
      console.error('DocuSign webhook signature validation failed');
    }

    return isValid;
  } catch (error) {
    console.error('DocuSign webhook validation error:', error);
    return false;
  }
}

module.exports = {
  authenticateWithJWT,
  createAPAEnvelope,
  getEnvelopeStatus,
  downloadSignedDocument,
  processWebhook,
  validateWebhookSignature
};
