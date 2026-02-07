const docusign = require('docusign-esign');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Ensure environment variables are available when this module is required directly
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

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
async function getTemplateFields(templateIdOverride = null) {
  try {
    const accessToken = await authenticateWithJWT();
    const apiClient = getDocuSignClient();
    apiClient.addDefaultHeader('Authorization', 'Bearer ' + accessToken);

    const templatesApi = new docusign.TemplatesApi(apiClient);
    const accountId = process.env.DOCUSIGN_ACCOUNT_ID;
    const templateId = templateIdOverride || process.env.DOCUSIGN_TEMPLATE_ID;

    // Get template with recipients included
    const template = await templatesApi.get(accountId, templateId, { include: 'recipients,tabs' });
    
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
 * Email will be sent automatically by DocuSign - no embedded signing
 * @param {Object} application - APAApplication document
 * @returns {Promise<Object>} Envelope details (envelopeId, status)
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
    
    // Use recruiter name in email subject and sender if available
    const recruiterName = application.recruitingInfo?.recruiterFullName || 'RHP Office';
    envelope.emailSubject = `${recruiterName} via RHP Office - Please Sign Your Agent Partnership Agreement`;
    envelope.emailBlurb = `Thank you for applying to RHP Office! ${recruiterName} has invited you to join the team. Please review and sign your Agent Partnership Agreement to continue. Once signed, you will receive instructions for payment setup ($20/month subscription).`;
    envelope.templateId = process.env.DOCUSIGN_TEMPLATE_ID; // APA template created in DocuSign
    
    // Set custom sender name and email in notification
    const emailNotification = new docusign.EmailSettings();
    // Use recruiter's email if available, otherwise fallback to default
    const recruiterEmail = application.recruitingInfo?.recruiterContact || process.env.DOCUSIGN_REPLY_EMAIL || 'Rhpinsurance@gmail.com';
    emailNotification.replyEmailAddressOverride = recruiterEmail;
    emailNotification.replyEmailNameOverride = recruiterName;
    envelope.emailSettings = emailNotification;

    // Create signer for remote (email-based) signing
    const signer = new docusign.TemplateRole();
    signer.email = application.personalInfo.email;
    signer.name = `${application.personalInfo.legalFirstName} ${application.personalInfo.legalLastName}`;
    signer.roleName = 'agent'; // Must match role name in DocuSign template (NEW RHP APA AGREEMENT)
    // NOTE: No clientUserId - this enables remote signing via email

    // Set custom sender name on the recipient notification
    const signerEmailNotification = new docusign.RecipientEmailNotification();
    signerEmailNotification.emailSubject = `${recruiterName} via RHP Office - Please Sign Your Agent Partnership Agreement`;
    signerEmailNotification.emailBody = `Thank you for applying to RHP Office! ${recruiterName} has invited you to join the team. Please review and sign your Agent Partnership Agreement to continue. Once signed, you will receive instructions for payment setup ($20/month subscription).`;
    signerEmailNotification.supportedLanguage = 'en';
    signer.emailNotification = signerEmailNotification;

    // Add custom fields to pre-fill template
    signer.tabs = createSignerTabs(application);

    envelope.templateRoles = [signer];
    envelope.status = 'sent'; // Send immediately - DocuSign will email the signer

    console.log('=== Creating DocuSign Envelope ===');
    console.log('Template ID:', process.env.DOCUSIGN_TEMPLATE_ID);
    console.log('Role Name:', signer.roleName);
    console.log('Signer:', signer.name, '-', signer.email);
    console.log('Text Tabs Count:', signer.tabs?.textTabs?.length || 0);
    console.log('==================================');

    // Create the envelope
    const results = await envelopesApi.createEnvelope(accountId, {
      envelopeDefinition: envelope
    });

    console.log('=== DocuSign Envelope Created ===');
    console.log('Envelope ID:', results.envelopeId);

    // Update email settings after envelope creation using separate API call
    // This is the proper way to set reply-to override per DocuSign documentation
    try {
      const emailSettings = new docusign.EmailSettings();
      emailSettings.replyEmailAddressOverride = recruiterEmail;
      emailSettings.replyEmailNameOverride = recruiterName;
      
      await envelopesApi.updateEmailSettings(accountId, results.envelopeId, {
        emailSettings: emailSettings
      });
      
      console.log('=== Email Settings Updated ===');
      console.log('Reply-To Email:', recruiterEmail);
      console.log('Reply-To Name:', recruiterName);
    } catch (emailError) {
      console.warn('Could not update email settings (may require account feature):', emailError.message);
      // Don't fail the entire operation if email settings update fails
    }

    console.log('=== Envelope Sent ===');
    console.log('Recipient Email:', signer.email);
    console.log('Status: Email will be sent by DocuSign');

    return {
      envelopeId: results.envelopeId,
      status: 'sent'
    };
  } catch (error) {
    console.error('DocuSign Envelope Creation Error:', error);
    throw new Error('Failed to create DocuSign envelope: ' + error.message);
  }
}

/**
 * Create signer tabs to pre-fill template fields with application data
 * Maps all fields from APAApplication model to the new DocuSign template
 * 
 * @param {Object} application - APAApplication document
 * @returns {Object} DocuSign tabs object
 */
function createSignerTabs(application) {
  const tabs = new docusign.Tabs();
  const textTabs = [];
  const checkboxTabs = [];

  const personalInfo = application.personalInfo || {};
  const recruitingInfo = application.recruitingInfo || {};
  const complianceQuestions = application.complianceQuestions || {};
  const financialBackground = application.financialBackground || {};
  const licensingStatus = application.licensingStatus || {};
  
  // Helper function to add text tab
  const addTextTab = (tabLabel, value, locked = true) => {
    if (value !== undefined && value !== null) {
      const tab = new docusign.Text();
      tab.tabLabel = tabLabel;
      tab.value = String(value);
      tab.locked = locked ? 'true' : 'false';
      textTabs.push(tab);
    }
  };

  // Helper function to add checkbox tab
  const addCheckboxTab = (tabLabel, selected) => {
    const tab = new docusign.Checkbox();
    tab.tabLabel = tabLabel;
    tab.selected = selected ? 'true' : 'false';
    checkboxTabs.push(tab);
  };

  // ===== TEXT FIELDS =====
  
  // Personal Information
  addTextTab('resident_state', personalInfo.homeAddress?.state || '');
  addTextTab('firstName', personalInfo.legalFirstName || '');
  addTextTab('middleName', personalInfo.legalMiddleName || '');
  addTextTab('lastName', personalInfo.legalLastName || '');
  addTextTab('dateOfBirth', formatDate(personalInfo.dateOfBirth));
  addTextTab('socialSecurityNumber', personalInfo.ssn || '');
  addTextTab('mobileNumber', personalInfo.mobilePhone || '');
  addTextTab('emailAddress', personalInfo.email || '');
  addTextTab('streetAddress', personalInfo.homeAddress?.street || '');
  addTextTab('city', personalInfo.homeAddress?.city || '');
  addTextTab('state', personalInfo.homeAddress?.state || '');
  addTextTab('zipcode', personalInfo.homeAddress?.zipCode || '');

  // Recruiting Information
  addTextTab('recruiterFullName', recruitingInfo.recruiterFullName || '');
  addTextTab('recruiterAgentId', recruitingInfo.recruiterAgentId || '');
  addTextTab('recruiterEmail', recruitingInfo.recruiterContact || '');
  addTextTab('recruiterPhone', recruitingInfo.recruiterContact || '');
  addTextTab('uplineLeaderName', recruitingInfo.uplineLeaderName || '');
  addTextTab('teamName', recruitingInfo.teamName || '');

  // Compliance Questions - Descriptions (only if answer is Yes)
  addTextTab('previouslyContractedYesDescribe', 
    complianceQuestions.previouslyContractedOther?.answer ? (complianceQuestions.previouslyContractedOther?.explanation || '') : '');
  addTextTab('convictedOfFelonyYesDescribe', 
    complianceQuestions.felonyConviction?.answer ? (complianceQuestions.felonyConviction?.explanation || '') : '');
  addTextTab('convictedOfFraudYesDescribe', 
    complianceQuestions.misdemeanorFraud?.answer ? (complianceQuestions.misdemeanorFraud?.explanation || '') : '');
  addTextTab('subjectToCivilActionYesDescribe', 
    complianceQuestions.civilAction?.answer ? (complianceQuestions.civilAction?.explanation || '') : '');
  addTextTab('insuranceLicenseYesDescribe', 
    complianceQuestions.licenseDenied?.answer ? (complianceQuestions.licenseDenied?.explanation || '') : '');
  addTextTab('difficultyObtainingYesDescribe', 
    complianceQuestions.bondIssues?.answer ? (complianceQuestions.bondIssues?.explanation || '') : '');

  // Financial Background - Descriptions
  addTextTab('unsatisfiedJudgmentDescribe', 
    financialBackground.unsatisfiedJudgmentsExplanation || '');
  addTextTab('unsatisfiedTaxLiensYesDescribe', 
    financialBackground.unsatisfiedLiensExplanation || '');
  addTextTab('oweInsuranceCompanyYesDescribe', '');

  // Licensing Information
  addTextTab('licenseTypeOtherDescribe', licensingStatus.licenseOtherDescription || '');
  addTextTab('stateLicensedIn', 
    licensingStatus.statesLicensed ? licensingStatus.statesLicensed.join(', ') : '');
  addTextTab('primaryLicenseNumber', licensingStatus.licenseNumber || '');
  
  // Agreement Date
  addTextTab('dateOfAgreement', formatDate(new Date()));

  // ===== CHECKBOX FIELDS =====
  
  // Gender
  addCheckboxTab('genderMale', personalInfo.gender === 'M');
  addCheckboxTab('genderFemale', personalInfo.gender === 'F');
  addCheckboxTab('genderOther', personalInfo.gender === 'Other');

  // Mailing Address Different
  const hasMailingAddress = personalInfo.mailingAddress?.street || 
                           personalInfo.mailingAddress?.city || 
                           personalInfo.mailingAddress?.state || 
                           personalInfo.mailingAddress?.zipCode;
  addCheckboxTab('mailingAddressDifferentFromHomeAddress', !!hasMailingAddress);

  // Previously Contracted with RHP Office (Section 1 checkbox)
  addCheckboxTab('previouslyContracted', personalInfo.previouslyContracted === true);

  // Previously Contracted with OTHER companies (Section 3 compliance question)
  addCheckboxTab('previouslyContractedYes', complianceQuestions.previouslyContractedOther?.answer === true);
  addCheckboxTab('previouslyContractedNo', complianceQuestions.previouslyContractedOther?.answer === false);

  // Felony Conviction
  addCheckboxTab('convictedOfFelonyYes', complianceQuestions.felonyConviction?.answer === true);
  addCheckboxTab('convictedOfFelonyNo', complianceQuestions.felonyConviction?.answer === false);

  // Fraud Conviction
  addCheckboxTab('convictedOfFraudYes', complianceQuestions.misdemeanorFraud?.answer === true);
  addCheckboxTab('convictedOfFraudNo', complianceQuestions.misdemeanorFraud?.answer === false);

  // Civil Action
  addCheckboxTab('subjectToCivilActionYes', complianceQuestions.civilAction?.answer === true);
  addCheckboxTab('subjectToCivilActionNo', complianceQuestions.civilAction?.answer === false);

  // Insurance License Denied/Revoked
  addCheckboxTab('insuranceLicenseYes', complianceQuestions.licenseDenied?.answer === true);
  addCheckboxTab('insuranceLicenseNo', complianceQuestions.licenseDenied?.answer === false);

  // Difficulty Obtaining Bond
  addCheckboxTab('difficultyObtainingYes', complianceQuestions.bondIssues?.answer === true);
  addCheckboxTab('difficultyObtainingNo', complianceQuestions.bondIssues?.answer === false);

  // Unsatisfied Judgments
  addCheckboxTab('unsatisfiedJudgmentYes', financialBackground.unsatisfiedJudgments === true);
  addCheckboxTab('unsatisfiedJudgmentNo', financialBackground.unsatisfiedJudgments === false);

  // Unsatisfied Tax Liens
  addCheckboxTab('unsatisfiedTaxLiensYes', financialBackground.unsatisfiedLiens === true);
  addCheckboxTab('unsatisfiedTaxLiensNo', financialBackground.unsatisfiedLiens === false);

  // Owe Insurance Company (placeholder - not in current model)
  addCheckboxTab('oweInsuranceCompanyYes', false);
  addCheckboxTab('oweInsuranceCompanyNo', true);

  // Bankruptcy
  addCheckboxTab('filedForBankruptcyYes', financialBackground.bankruptcy?.filed === true);
  addCheckboxTab('filedForBankruptcyNo', financialBackground.bankruptcy?.filed === false);
  
  // Bankruptcy Chapter (only if filed)
  if (financialBackground.bankruptcy?.filed) {
    addCheckboxTab('filedForBankruptcyYesLeftChapter7', financialBackground.bankruptcy?.chapter === '7');
    addCheckboxTab('filedForBankruptcyYesLeftChapter11', financialBackground.bankruptcy?.chapter === '11');
    addCheckboxTab('filedForBankruptcyYesLeftChapter13', financialBackground.bankruptcy?.chapter === '13');
    
    // Bankruptcy Status
    addCheckboxTab('filedForBankruptcyYesRightDischarged', financialBackground.bankruptcy?.status === 'Discharged');
    addCheckboxTab('filedForBankruptcyYesRightOpenPending', financialBackground.bankruptcy?.status === 'Open');
    addCheckboxTab('filedForBankruptcyYesDismissed', financialBackground.bankruptcy?.status === 'Dismissed');
  }

  // Currently Licensed
  addCheckboxTab('currentlyLicensedToSellInsuranceYes', licensingStatus.currentlyLicensed === true);
  addCheckboxTab('currentlyLicensedToSellInsuranceNo', licensingStatus.currentlyLicensed === false);

  // License Types
  const licenseTypes = licensingStatus.licenseTypes || [];
  addCheckboxTab('licenseTypeLifeInsurance', licenseTypes.includes('Life'));
  addCheckboxTab('licenseTypeHealthInsurance', licenseTypes.includes('Health'));
  addCheckboxTab('licenseTypeLifeHealthInsurance', licenseTypes.includes('Life & Health'));
  addCheckboxTab('licenseTypeOther', licenseTypes.includes('Other'));

  // License Status
  addCheckboxTab('licenseStatusActive', licensingStatus.licenseStatus === 'Active');
  addCheckboxTab('licenseStatusInactive', licensingStatus.licenseStatus === 'Inactive');
  addCheckboxTab('licenseStatusPending', licensingStatus.licenseStatus === 'Pending Renewal' || licensingStatus.licenseStatus === 'Pending');

  tabs.textTabs = textTabs;
  tabs.checkboxTabs = checkboxTabs;

  console.log('=== Created Tabs for DocuSign ===');
  console.log(`Text Tabs: ${textTabs.length}`);
  console.log(`Checkbox Tabs: ${checkboxTabs.length}`);
  console.log('================================');

  return tabs;
}

/**
 * Helper to create a text tab with pre-filled value
 */
function createTextTab(tabLabel, value) {
  const textTab = new docusign.Text();
  textTab.tabLabel = tabLabel;
  textTab.value = value || '';
  textTab.locked = 'false'; // Allow editing during signing if needed
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
    const event = webhookData.event;
    const status = webhookData.status || webhookData.data?.envelopeSummary?.status;
    const recipients = webhookData.recipients || webhookData.data?.envelopeSummary?.recipients;

    console.log('DocuSign Webhook Received:', {
      event,
      envelopeId,
      status,
      recipientCount: recipients?.length
    });

    // Map DocuSign event/status to our application status
    let appStatus = 'pending_signature';
    let signedAt = null;
    let docuSignStatus = 'sent';

    // Handle event-based webhooks (e.g., "envelope-completed", "envelope-sent")
    if (event) {
      switch (event) {
        case 'envelope-completed':
          docuSignStatus = 'completed';
          appStatus = 'pending_payment';
          signedAt = new Date();
          break;
        case 'envelope-declined':
          docuSignStatus = 'declined';
          appStatus = 'declined';
          break;
        case 'envelope-voided':
          docuSignStatus = 'voided';
          appStatus = 'voided';
          break;
        case 'envelope-sent':
        case 'envelope-delivered':
          docuSignStatus = 'sent';
          appStatus = 'pending_signature';
          break;
        default:
          docuSignStatus = 'sent';
          appStatus = 'pending_signature';
      }
    }
    // Handle status-based webhooks (legacy format)
    else if (status) {
      docuSignStatus = status;
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
    }

    return {
      envelopeId,
      status: docuSignStatus,
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
