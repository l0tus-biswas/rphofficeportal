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
    console.error('DocuSign JWT Authentication Error:', error.response?.body || error.message);
    throw new Error('Failed to authenticate with DocuSign: ' + error.message);
  }
}

/**
 * Get template fields from DocuSign (for debugging/verification)
 * @returns {Promise<Object>} Template details with all fields
 */
async function getTemplateFields() {
  try {
    const accessToken = await authenticateWithJWT();
    const apiClient = getDocuSignClient();
    apiClient.addDefaultHeader('Authorization', 'Bearer ' + accessToken);

    const templatesApi = new docusign.TemplatesApi(apiClient);
    const accountId = process.env.DOCUSIGN_ACCOUNT_ID;
    const templateId = process.env.DOCUSIGN_TEMPLATE_ID;

    // Get template with recipients included
    const template = await templatesApi.get(accountId, templateId, { include: 'recipients' });
    
    console.log('\n=== DocuSign Template Field Names ===');
    
    if (template.recipients?.signers) {
      template.recipients.signers.forEach((signer, idx) => {
        console.log(`\nSigner ${idx + 1} (${signer.roleName}):`);
        
        if (signer.tabs?.textTabs) {
          console.log('Text Tabs:');
          signer.tabs.textTabs.forEach(tab => {
            console.log(`  - ${tab.tabLabel}`);
          });
        }
        
        if (signer.tabs?.checkboxTabs) {
          console.log('Checkbox Tabs:');
          signer.tabs.checkboxTabs.forEach(tab => {
            console.log(`  - ${tab.tabLabel}`);
          });
        }
        
        if (signer.tabs?.signHereTabs) {
          console.log('Signature Tabs:');
          signer.tabs.signHereTabs.forEach(tab => {
            console.log(`  - ${tab.tabLabel || 'Signature'}`);
          });
        }
      });
    }
    
    console.log('\n=====================================\n');
    
    return template;

  } catch (error) {
    console.error('Error fetching template fields:', error.response?.body || error.message);
    throw error;
  }
}

/**
 * Authenticate with DocuSign using JWT
 * @returns {Promise<string>} Access token (legacy - kept for backwards compatibility)
 */
async function authenticateWithJWT_legacy() {
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
    const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
    viewRequest.returnUrl = `${backendUrl}/api/public/apa-application/${application._id}/docusign-return`;
    viewRequest.authenticationMethod = 'none';
    viewRequest.email = signer.email;
    viewRequest.userName = signer.name;
    viewRequest.clientUserId = signer.clientUserId;

    const viewResults = await envelopesApi.createRecipientView(accountId, results.envelopeId, {
      recipientViewRequest: viewRequest
    });

    console.log('=== DocuSign Signing URL Created ===');
    console.log('Envelope ID:', results.envelopeId);
    console.log('Signing URL:', viewResults.url);
    console.log('URL Length:', viewResults.url?.length);

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
  const textTabs = [];

  // SECTION 1: PERSONAL INFORMATION
  const personalInfo = application.personalInfo || {};
  
  // Name fields
  textTabs.push(
    createTextTab('applicant_first_name', personalInfo.legalFirstName || ''),
    createTextTab('applicant_middle_name', personalInfo.legalMiddleName || ''),
    createTextTab('applicant_last_name', personalInfo.legalLastName || ''),
    createTextTab('applicant_full_name', 
      `${personalInfo.legalFirstName || ''} ${personalInfo.legalMiddleName || ''} ${personalInfo.legalLastName || ''}`.replace(/\s+/g, ' ').trim()
    )
  );

  // Demographics
  textTabs.push(
    createTextTab('applicant_gender', personalInfo.gender || ''),
    createTextTab('applicant_dob', formatDate(personalInfo.dateOfBirth)),
    createTextTab('applicant_ssn', personalInfo.ssn || '***-**-****')
  );

  // Contact Information
  textTabs.push(
    createTextTab('applicant_phone', personalInfo.mobilePhone || ''),
    createTextTab('applicant_email', personalInfo.email || '')
  );

  // Home Address
  if (personalInfo.homeAddress) {
    textTabs.push(
      createTextTab('home_street', personalInfo.homeAddress.street || ''),
      createTextTab('home_city', personalInfo.homeAddress.city || ''),
      createTextTab('home_state', personalInfo.homeAddress.state || ''),
      createTextTab('home_zip', personalInfo.homeAddress.zipCode || ''),
      createTextTab('home_address_full', formatAddressObject(personalInfo.homeAddress))
    );
  }

  // Mailing Address (if different)
  if (personalInfo.mailingAddress) {
    textTabs.push(
      createTextTab('mailing_street', personalInfo.mailingAddress.street || ''),
      createTextTab('mailing_city', personalInfo.mailingAddress.city || ''),
      createTextTab('mailing_state', personalInfo.mailingAddress.state || ''),
      createTextTab('mailing_zip', personalInfo.mailingAddress.zipCode || ''),
      createTextTab('mailing_address_full', formatAddressObject(personalInfo.mailingAddress))
    );
  }

  // SECTION 2: RECRUITING INFORMATION
  const recruitingInfo = application.recruitingInfo || {};
  
  textTabs.push(
    createTextTab('recruiter_name', recruitingInfo.recruiterFullName || ''),
    createTextTab('recruiter_agent_id', recruitingInfo.recruiterAgentId || ''),
    createTextTab('recruiter_contact', recruitingInfo.recruiterContact || ''),
    createTextTab('upline_leader', recruitingInfo.uplineLeaderName || ''),
    createTextTab('team_name', recruitingInfo.teamName || ''),
    createTextTab('referral_code', recruitingInfo.referralCode || '')
  );

  // SECTION 3: COMPLIANCE QUESTIONS
  const compliance = application.complianceQuestions || {};
  
  // Previously Contracted with Other Company
  if (compliance.previouslyContractedOther) {
    textTabs.push(
      createTextTab('prev_contracted_other', formatYesNo(compliance.previouslyContractedOther.answer)),
      createTextTab('prev_contracted_other_explain', compliance.previouslyContractedOther.explanation || '')
    );
  }

  // Felony Conviction
  if (compliance.felonyConviction) {
    textTabs.push(
      createTextTab('felony_conviction', formatYesNo(compliance.felonyConviction.answer)),
      createTextTab('felony_conviction_explain', compliance.felonyConviction.explanation || '')
    );
  }

  // Misdemeanor Fraud
  if (compliance.misdemeanorFraud) {
    textTabs.push(
      createTextTab('misdemeanor_fraud', formatYesNo(compliance.misdemeanorFraud.answer)),
      createTextTab('misdemeanor_fraud_explain', compliance.misdemeanorFraud.explanation || '')
    );
  }

  // Civil Action
  if (compliance.civilAction) {
    textTabs.push(
      createTextTab('civil_action', formatYesNo(compliance.civilAction.answer)),
      createTextTab('civil_action_explain', compliance.civilAction.explanation || '')
    );
  }

  // License Denied/Revoked
  if (compliance.licenseDenied) {
    textTabs.push(
      createTextTab('license_denied', formatYesNo(compliance.licenseDenied.answer)),
      createTextTab('license_denied_explain', compliance.licenseDenied.explanation || '')
    );
  }

  // Bond Issues
  if (compliance.bondIssues) {
    textTabs.push(
      createTextTab('bond_issues', formatYesNo(compliance.bondIssues.answer)),
      createTextTab('bond_issues_explain', compliance.bondIssues.explanation || '')
    );
  }

  // SECTION 4: FINANCIAL BACKGROUND
  const financial = application.financialBackground || {};
  
  textTabs.push(
    createTextTab('unsatisfied_judgments', formatYesNo(financial.unsatisfiedJudgments)),
    createTextTab('unsatisfied_liens', formatYesNo(financial.unsatisfiedLiens))
  );

  // Bankruptcy Information
  if (financial.bankruptcy) {
    textTabs.push(
      createTextTab('bankruptcy_filed', formatYesNo(financial.bankruptcy.filed)),
      createTextTab('bankruptcy_chapter', financial.bankruptcy.chapter || ''),
      createTextTab('bankruptcy_status', financial.bankruptcy.status || '')
    );
  }

  // SECTION 5: LICENSING STATUS
  const licensing = application.licensingStatus || {};
  
  // Convert license_types array to comma-separated string
  let licenseTypesStr = '';
  if (licensing.licenseTypes) {
    if (Array.isArray(licensing.licenseTypes)) {
      licenseTypesStr = licensing.licenseTypes.join(', ');
    } else {
      licenseTypesStr = licensing.licenseTypes.toString();
    }
  }
  
  textTabs.push(
    createTextTab('currently_licensed', formatYesNo(licensing.currentlyLicensed)),
    createTextTab('license_types', licenseTypesStr),
    createTextTab('license_number', licensing.licenseNumber || ''),
    createTextTab('license_status', licensing.licenseStatus || '')
  );

  // States Licensed (array to comma-separated string)
  let statesLicensedStr = '';
  if (licensing.statesLicensed) {
    if (Array.isArray(licensing.statesLicensed)) {
      statesLicensedStr = licensing.statesLicensed.join(', ');
    } else {
      statesLicensedStr = licensing.statesLicensed.toString();
    }
  }
  textTabs.push(createTextTab('states_licensed', statesLicensedStr));

  // ADDITIONAL CONTRACT FIELDS
  textTabs.push(
    createTextTab('application_date', formatDate(new Date())),
    createTextTab('application_id', application._id ? application._id.toString() : '')
  );

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
 * Format address object for DocuSign
 */
function formatAddressObject(address) {
  if (!address) return '';
  const parts = [];
  if (address.street) parts.push(address.street);
  if (address.city) parts.push(address.city);
  if (address.state) parts.push(address.state);
  if (address.zipCode) parts.push(address.zipCode);
  return parts.join(', ');
}

/**
 * Format address for DocuSign (legacy - kept for backward compatibility)
 */
function formatAddress(personalInfo) {
  if (!personalInfo) return '';
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
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

/**
 * Format boolean to Yes/No for DocuSign
 */
function formatYesNo(value) {
  if (value === true || value === 'true' || value === 'yes' || value === 'Yes') {
    return 'Yes';
  } else if (value === false || value === 'false' || value === 'no' || value === 'No') {
    return 'No';
  }
  return '';
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
  validateWebhookSignature,
  getTemplateFields
};
