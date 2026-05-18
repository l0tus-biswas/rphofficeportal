const docusign = require('docusign-esign');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const SystemConfig = require('../models/SystemConfig');

// Ensure environment variables are available when this module is required directly
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

/**
 * DocuSign Integration Utility
 * Handles authentication, envelope creation, and webhook processing
 */

/**
 * Get the active DocuSign template ID
 * Checks SystemConfig first, falls back to .env
 * @returns {Promise<string>} Template ID
 */
async function getActiveTemplateId() {
  try {
    const config = await SystemConfig.findOne({ key: 'docusign_template_id' }).lean();
    if (config && config.value) return config.value;
  } catch (e) { /* fall through */ }
  return process.env.DOCUSIGN_TEMPLATE_ID;
}

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
    const templateId = templateIdOverride || await getActiveTemplateId();

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
    const recruiterEmail = application.recruitingInfo?.recruiterContact || process.env.DOCUSIGN_REPLY_EMAIL || 'Rhpinsurance@gmail.com';
    
    console.log('=== Recruiter Information ===');
    console.log('Full recruitingInfo:', JSON.stringify(application.recruitingInfo, null, 2));
    console.log('Recruiter Name:', recruiterName);
    console.log('Recruiter Email:', recruiterEmail);
    console.log('===========================');
    
    envelope.emailSubject = `${recruiterName} via RHP Office - Please Sign Your Agent Partnership Agreement`;
    envelope.emailBlurb = `Thank you for applying to RHP Office! ${recruiterName} has invited you to join the team. Please review and sign your Agent Partnership Agreement to continue. Once signed, you will receive instructions for payment setup ($20/month subscription).`;
    envelope.templateId = await getActiveTemplateId(); // APA template created in DocuSign

    // Create signer for remote (email-based) signing
    const signer = new docusign.TemplateRole();
    signer.email = application.personalInfo.email;
    signer.name = `${application.personalInfo.legalFirstName} ${application.personalInfo.legalLastName}`;
    signer.roleName = 'Agent'; // Must match role name in DocuSign template (RHP Office APA AGREEMENT 2026(1))
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
    envelope.status = 'created'; // Create as draft first, then send after updating email settings

    console.log('=== Creating DocuSign Envelope ===');
    console.log('Template ID:', envelope.templateId);
    console.log('Role Name:', signer.roleName);
    console.log('Signer:', signer.name, '-', signer.email);
    console.log('Text Tabs Count:', signer.tabs?.textTabs?.length || 0);
    console.log('==================================');

    // Create the envelope (as draft)
    const results = await envelopesApi.createEnvelope(accountId, {
      envelopeDefinition: envelope
    });

    console.log('=== DocuSign Envelope Created (Draft) ===');
    console.log('Envelope ID:', results.envelopeId);

    // Update email settings before sending
    // This is the proper way to set reply-to override per DocuSign documentation
    try {
      const emailSettings = new docusign.EmailSettings();
      emailSettings.replyEmailAddressOverride = recruiterEmail;
      emailSettings.replyEmailNameOverride = recruiterName;
      
      console.log('=== Attempting to Update Email Settings ===');
      console.log('Setting replyEmailAddressOverride to:', recruiterEmail);
      console.log('Setting replyEmailNameOverride to:', recruiterName);
      
      const updateResult = await envelopesApi.updateEmailSettings(accountId, results.envelopeId, {
        emailSettings: emailSettings
      });
      
      console.log('=== Email Settings Update Response ===');
      console.log('Update Result:', JSON.stringify(updateResult, null, 2));
      console.log('Reply-To Email:', recruiterEmail);
      console.log('Reply-To Name:', recruiterName);
      console.log('====================================');
    } catch (emailError) {
      console.error('=== Email Settings Update Failed ===');
      console.error('Error:', emailError.message);
      console.error('Error Response:', emailError.response?.body);
      console.error('====================================');
      // Continue anyway - the envelope will still be sent
    }

    // Now send the envelope
    await envelopesApi.update(accountId, results.envelopeId, {
      envelope: { status: 'sent' }
    });

    console.log('=== Envelope Sent ===');
    console.log('Recipient Email:', signer.email);
    console.log('Status: Email sent by DocuSign');

    return {
      envelopeId: results.envelopeId,
      status: 'sent'
    };
  } catch (error) {
    console.error('DocuSign Envelope Creation Error:', error.message);
    if (error.response?.body) {
      console.error('DocuSign API Response:', JSON.stringify(error.response.body, null, 2));
    }
    if (error.response?.text) {
      console.error('DocuSign API Text:', error.response.text);
    }
    throw new Error('Failed to create DocuSign envelope: ' + (error.response?.body?.message || error.message));
  }
}

/**
 * Create signer tabs to pre-fill template fields with application data
 * Maps all fields from APAApplication model to the new DocuSign template
 * Template: RHP Office APA AGREEMENT 2026(1) (c1abdf9e-83be-49c5-9333-73788e5805e0)
 * 
 * NOTE: Tab labels are auto-generated UUIDs from DocuSign. If the template is
 * recreated, these UUIDs will change and must be re-fetched using
 * fetch-template-fields-detailed.js
 * 
 * @param {Object} application - APAApplication document
 * @returns {Object} DocuSign tabs object
 */

// Text tab label mapping: semantic name → DocuSign UUID label
const TEXT_TAB_LABELS = {
  resident_state:                     'Text c3512b47-ef34-47bb-89fe-303db07c300a',
  firstName:                          'Text 023cedba-a3cd-48ed-a4b8-895e19d0abb3',
  middleName:                         'Text c82a8408-34f6-42ed-b307-4160d92299cb',
  lastName:                           'Text 5987d2e1-1ac2-4464-83d1-601e6ae4ed42',
  dateOfBirth:                        'Text c5159c89-4174-447e-a6b4-1eb7302256e4',
  socialSecurityNumber:               'Text 2c9ad46a-9836-4c65-b1e3-a3b9bd7beb9f',
  mobileNumber:                       'Text cd73b113-ea6b-4753-bf27-69e5d54b7254',
  streetAddress:                      'Text 18e5cdec-3a1e-4e5a-a6ce-dcbfeb04b766',
  city:                               'Text e6b85ed9-7f54-450d-8ec0-37c224859b9b',
  state:                              'Text a3cbc6e6-b574-4b2c-8d9f-725757fe2b9a',
  zipcode:                            'Text 13994a85-7130-4ac0-a0ae-10576951d45d',
  recruiterFullName:                  'Text b5646b4e-79c0-4e2a-90a5-5cddd3c2d21c',
  recruiterAgentId:                   'Text 2c275b1e-4b1a-4075-82d6-89abc18e61fb',
  recruiterEmail:                     'Text a0e40538-3261-4a11-bd09-0deb67e551e4',
  recruiterPhone:                     'Text 9b07bb3d-5312-4fd2-88bc-c605a6e0f299',
  uplineLeaderName:                   'Text d8793083-25fc-4a1e-b419-b1508d05625d',
  teamName:                           'Text 5c5f7092-b910-4cce-a8a8-9b876a7d3438',
  previouslyContractedYesDescribe:    'Text b9ec7de1-4038-4fa3-93ba-d52352ee69f8',
  convictedOfFelonyYesDescribe:       'Text 77bd5a39-d730-42a9-99bc-adbeb779d9b6',
  convictedOfFraudYesDescribe:        'Text 5718ad9c-1de3-4502-805f-77170f01cf6c',
  subjectToCivilActionYesDescribe:    'Text 71bd727f-e9e7-4b5d-832f-48b620c2384c',
  insuranceLicenseYesDescribe:        'Text 9b09a3c9-12fe-424c-84c3-006fd58c39a7',
  difficultyObtainingYesDescribe:     'Text 971cac85-5879-42e9-b2e4-d0123b88d694',
  unsatisfiedJudgmentDescribe:        'Text 6c25d0bb-7c9e-49e6-b302-f442d4531b30',
  unsatisfiedTaxLiensYesDescribe:     'Text 3c1cc6bf-eb2f-44d3-a2b3-cc7f5bfaa3a4',
  oweInsuranceCompanyYesDescribe:     'Text cfdff338-5d64-48f9-8aa1-bd624704b31f',
  bankruptcyAdditionalDetails:        'Text fbf8108a-a0bd-49dc-9812-17c74eb830a8',
  licenseTypeOtherDescribe:           'Text 2e256c41-e388-41bc-9855-f755ae479730',
  stateLicensedIn:                    'Text dcc8cafb-63e0-49a1-b33d-c3b7d3a34c97',
  primaryLicenseNumber:               'Text 20944855-5cc4-4dad-bed2-355e2a63b1a7',
  licenseStatus:                      'Text 3488675b-1e04-4116-b5c0-4dd81b6a9def',
};

// Checkbox tab label mapping: semantic name → DocuSign UUID label
const CHECKBOX_TAB_LABELS = {
  genderMale:                         'Checkbox 1527096c-00e8-4aff-a0ed-fdd52a389402',
  genderFemale:                       'Checkbox 7519c608-5e1f-4c65-a839-8a2d352bd561',
  genderOther:                        'Checkbox 1f3efc0b-fe00-4f1c-90e7-ec63c9124d84',
  mailingAddressDifferent:            'Checkbox 7ae5ef53-7158-43d0-a5ea-07d779c3f3ee',
  previouslyContractedRHP:            'Checkbox d6ff0743-457e-4444-8ace-92438d66426e',
  previouslyContractedYes:            'Checkbox 6a460b72-7fd1-4fd6-9ab4-bb7352df0b04',
  previouslyContractedNo:             'Checkbox eee11eef-aae0-443b-84af-f7dfcd6a1270',
  convictedOfFelonyYes:               'Checkbox 48898510-66f7-4918-aba7-dee3ec9f1c3f',
  convictedOfFelonyNo:                'Checkbox d6503d01-1c8c-4966-80ef-8516dc71b2ef',
  convictedOfFraudYes:                'Checkbox 709b68e2-2054-43dd-b9f8-c21fa0b4fe93',
  convictedOfFraudNo:                 'Checkbox c9ce8f3c-b9be-4a4b-ba48-0dcea79ed911',
  subjectToCivilActionYes:            'Checkbox 576db9ce-76d8-4ab9-a040-2c94b20f52a6',
  subjectToCivilActionNo:             'Checkbox 6b200fbc-b0a7-4ef3-b1a3-19181f6e4704',
  insuranceLicenseYes:                'Checkbox eacf377f-a663-43e4-bcd1-35ca3ecf1cd6',
  insuranceLicenseNo:                 'Checkbox e76791fe-8b35-486e-9e85-387cf54fb4c3',
  difficultyObtainingYes:             'Checkbox 2595f673-2a9f-42d4-ac40-ee33656a57b8',
  difficultyObtainingNo:              'Checkbox b9c26f6f-a149-44d3-ac2e-bc9b47ad74a7',
  unsatisfiedJudgmentYes:             'Checkbox bca0a490-9270-4878-86fe-4eabacfccbf8',
  unsatisfiedJudgmentNo:              'Checkbox b554ebe9-e486-4409-83c8-09011106d0c1',
  unsatisfiedTaxLiensYes:             'Checkbox 7a8a39b2-96e9-4a8e-8f78-2ed6816a8312',
  unsatisfiedTaxLiensNo:              'Checkbox de41079f-b637-426b-9b22-643a21607cbd',
  oweInsuranceCompanyYes:             'Checkbox 50fc8cee-1ed5-45d5-94d5-89ee606e5af2',
  oweInsuranceCompanyNo:              'Checkbox 4c256b51-53eb-4203-a212-097babcc5c63',
  filedForBankruptcyYes:              'Checkbox e51789a2-4ce7-4c38-8033-14d43420b46d',
  filedForBankruptcyNo:               'Checkbox 5577bc25-4328-48c6-86bc-da51f7bc9214',
  bankruptcyChapter7:                 'Checkbox 12d1026f-67bb-42ad-959f-819221f1ffc4',
  bankruptcyChapter11:                'Checkbox 490775e1-546b-45df-8d58-01076710e89e',
  bankruptcyChapter13:                'Checkbox 3d1e0e49-bc48-44fd-9362-2d85eabe554e',
  bankruptcyOpenPending:              'Checkbox 1dd6a4c2-e524-4d97-ac1f-f83bee6e962a',
  bankruptcyDischarged:               'Checkbox acd8acf6-701a-4890-a38e-de888ead3969',
  bankruptcyDismissed:                'Checkbox 4f1c2ddf-ffbb-4345-b38f-63f2f535aadf',
  currentlyLicensedYes:               'Checkbox 303ce368-806b-4427-a6ba-e81406b84545',
  currentlyLicensedNo:                'Checkbox b002c68c-ac2b-4298-81a7-8cf9f93006aa',
  licenseTypeLife:                    'Checkbox 749acf19-c1bf-4244-90d4-0d35f7b05986',
  licenseTypeHealth:                  'Checkbox a81104ca-5778-4991-ace7-79d2b013d7f5',
  licenseTypeLifeHealth:              'Checkbox 93b77c63-8b0f-4ffb-9a4d-a7148cb24a05',
  licenseTypeOther:                   'Checkbox e987cb13-5a37-40fd-b2d3-bbcc93c55c7b',
  licenseStatusActive:                'Checkbox c6d857e0-e7e4-425a-b537-e43be6ec58d9',
  licenseStatusInactive:              'Checkbox 332d00cb-356c-476e-b441-90627b4d8967',
  licenseStatusPending:               'Checkbox d0842a00-1ce0-4708-91f5-46f3c125847a',
};

function createSignerTabs(application) {
  const tabs = new docusign.Tabs();
  const textTabs = [];
  const checkboxTabs = [];

  const personalInfo = application.personalInfo || {};
  const recruitingInfo = application.recruitingInfo || {};
  const complianceQuestions = application.complianceQuestions || {};
  const financialBackground = application.financialBackground || {};
  const licensingStatus = application.licensingStatus || {};
  
  // Helper function to add text tab using the mapping
  // Skips tabs with empty/null values to avoid DocuSign 400 errors on required fields
  const addTextTab = (semanticName, value, locked = true) => {
    const tabLabel = TEXT_TAB_LABELS[semanticName];
    if (!tabLabel) {
      console.warn(`Unknown text tab: ${semanticName}`);
      return;
    }
    const strValue = (value !== undefined && value !== null) ? String(value).trim() : '';
    if (!strValue) return; // Don't send empty values for required template fields
    const tab = new docusign.Text();
    tab.tabLabel = tabLabel;
    tab.value = strValue;
    tab.locked = locked ? 'true' : 'false';
    textTabs.push(tab);
  };

  // Helper function to add checkbox tab using the mapping
  const addCheckboxTab = (semanticName, selected) => {
    const tabLabel = CHECKBOX_TAB_LABELS[semanticName];
    if (!tabLabel) {
      console.warn(`Unknown checkbox tab: ${semanticName}`);
      return;
    }
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

  // Bankruptcy additional details
  addTextTab('bankruptcyAdditionalDetails',
    financialBackground.bankruptcy?.filed ? (financialBackground.bankruptcy?.explanation || '') : '');

  // Licensing Information
  addTextTab('licenseTypeOtherDescribe', licensingStatus.licenseOtherDescription || '');
  addTextTab('stateLicensedIn', 
    licensingStatus.statesLicensed ? licensingStatus.statesLicensed.join(', ') : '');
  addTextTab('primaryLicenseNumber', licensingStatus.licenseNumber || '');
  addTextTab('licenseStatus', licensingStatus.licenseStatus || '');

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
  addCheckboxTab('mailingAddressDifferent', !!hasMailingAddress);

  // Previously Contracted with RHP Office (Section 1 checkbox)
  addCheckboxTab('previouslyContractedRHP', personalInfo.previouslyContracted === true);

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

  // Owe Insurance Company
  addCheckboxTab('oweInsuranceCompanyYes', false);
  addCheckboxTab('oweInsuranceCompanyNo', true);

  // Bankruptcy
  addCheckboxTab('filedForBankruptcyYes', financialBackground.bankruptcy?.filed === true);
  addCheckboxTab('filedForBankruptcyNo', financialBackground.bankruptcy?.filed === false);
  
  // Bankruptcy Chapter (only if filed)
  if (financialBackground.bankruptcy?.filed) {
    addCheckboxTab('bankruptcyChapter7', financialBackground.bankruptcy?.chapter === '7');
    addCheckboxTab('bankruptcyChapter11', financialBackground.bankruptcy?.chapter === '11');
    addCheckboxTab('bankruptcyChapter13', financialBackground.bankruptcy?.chapter === '13');
    
    // Bankruptcy Status
    addCheckboxTab('bankruptcyDischarged', financialBackground.bankruptcy?.status === 'Discharged');
    addCheckboxTab('bankruptcyOpenPending', financialBackground.bankruptcy?.status === 'Open');
    addCheckboxTab('bankruptcyDismissed', financialBackground.bankruptcy?.status === 'Dismissed');
  }

  // Currently Licensed
  addCheckboxTab('currentlyLicensedYes', licensingStatus.currentlyLicensed === true);
  addCheckboxTab('currentlyLicensedNo', licensingStatus.currentlyLicensed === false);

  // License Types
  const licenseTypes = licensingStatus.licenseTypes || [];
  addCheckboxTab('licenseTypeLife', licenseTypes.includes('Life'));
  addCheckboxTab('licenseTypeHealth', licenseTypes.includes('Health'));
  addCheckboxTab('licenseTypeLifeHealth', licenseTypes.includes('Life & Health'));
  addCheckboxTab('licenseTypeOther', licenseTypes.includes('Other'));

  // License Status (checkboxes)
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

/**
 * Update the document in an existing DocuSign template
 * Replaces the current PDF while keeping tabs/fields intact
 * @param {Buffer} pdfBuffer - The new PDF file buffer
 * @param {string} fileName - Original file name
 * @param {string} templateIdOverride - Optional template ID (defaults to active)
 * @returns {Promise<Object>} Updated template info
 */
async function updateTemplateDocument(pdfBuffer, fileName, templateIdOverride = null) {
  const accessToken = await authenticateWithJWT();
  const apiClient = getDocuSignClient();
  apiClient.addDefaultHeader('Authorization', 'Bearer ' + accessToken);

  const templatesApi = new docusign.TemplatesApi(apiClient);
  const accountId = process.env.DOCUSIGN_ACCOUNT_ID;
  const templateId = templateIdOverride || await getActiveTemplateId();

  // Get existing template to find the document ID
  const template = await templatesApi.get(accountId, templateId);
  const existingDocId = template.documents && template.documents.length > 0
    ? template.documents[0].documentId
    : '1';

  // Create the updated document definition
  const document = new docusign.Document();
  document.documentBase64 = pdfBuffer.toString('base64');
  document.name = fileName || 'APA Agreement';
  document.fileExtension = 'pdf';
  document.documentId = existingDocId;

  // Update the document in the template
  const envelopeDefinition = new docusign.EnvelopeDefinition();
  envelopeDefinition.documents = [document];

  await templatesApi.updateDocument(accountId, templateId, existingDocId, {
    envelopeDefinition: envelopeDefinition
  });

  console.log(`DocuSign template ${templateId} document updated with "${fileName}"`);

  return {
    templateId,
    documentId: existingDocId,
    fileName,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Create a brand new DocuSign template from a PDF upload
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @param {string} fileName - Original file name
 * @returns {Promise<Object>} New template info { templateId, name }
 */
async function createTemplateFromPDF(pdfBuffer, fileName) {
  const accessToken = await authenticateWithJWT();
  const apiClient = getDocuSignClient();
  apiClient.addDefaultHeader('Authorization', 'Bearer ' + accessToken);

  const templatesApi = new docusign.TemplatesApi(apiClient);
  const accountId = process.env.DOCUSIGN_ACCOUNT_ID;

  // Build the template definition
  const document = new docusign.Document();
  document.documentBase64 = pdfBuffer.toString('base64');
  document.name = fileName || 'APA Agreement';
  document.fileExtension = 'pdf';
  document.documentId = '1';

  const signer = new docusign.Signer();
  signer.roleName = 'Agent';
  signer.recipientId = '1';
  signer.routingOrder = '1';

  const recipients = new docusign.Recipients();
  recipients.signers = [signer];

  const templateReq = new docusign.EnvelopeTemplate();
  templateReq.name = `APA Agreement - ${new Date().toISOString().slice(0, 10)}`;
  templateReq.description = 'Agent Partnership Agreement uploaded by admin';
  templateReq.documents = [document];
  templateReq.recipients = recipients;
  templateReq.emailSubject = 'RHP Office - Please Sign Your Agent Partnership Agreement';
  templateReq.status = 'created';

  const result = await templatesApi.createTemplate(accountId, {
    envelopeTemplate: templateReq
  });

  console.log(`New DocuSign template created: ${result.templateId}`);

  return {
    templateId: result.templateId,
    name: templateReq.name
  };
}

/**
 * Get template info (name, documents, last modified)
 * @param {string} templateIdOverride
 * @returns {Promise<Object>}
 */
async function getTemplateInfo(templateIdOverride = null) {
  const accessToken = await authenticateWithJWT();
  const apiClient = getDocuSignClient();
  apiClient.addDefaultHeader('Authorization', 'Bearer ' + accessToken);

  const templatesApi = new docusign.TemplatesApi(apiClient);
  const accountId = process.env.DOCUSIGN_ACCOUNT_ID;
  const templateId = templateIdOverride || await getActiveTemplateId();

  const template = await templatesApi.get(accountId, templateId);

  return {
    templateId,
    name: template.name,
    description: template.description,
    lastModified: template.lastModifiedDateTime || template.lastModified,
    documents: (template.documents || []).map(d => ({
      documentId: d.documentId,
      name: d.name,
      pages: d.pages
    }))
  };
}

module.exports = {
  authenticateWithJWT,
  createAPAEnvelope,
  getEnvelopeStatus,
  downloadSignedDocument,
  processWebhook,
  validateWebhookSignature,
  getTemplateFields,
  getActiveTemplateId,
  updateTemplateDocument,
  createTemplateFromPDF,
  getTemplateInfo
};
