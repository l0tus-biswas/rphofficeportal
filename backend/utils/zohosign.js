const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');
const SystemConfig = require('../models/SystemConfig');

// Ensure environment variables are available when this module is required directly
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

/**
 * Zoho Sign Integration Utility — replacement for DocuSign (see docusign.js,
 * kept temporarily for reference/rollback).
 *
 * Auth model: Zoho uses OAuth2 with a long-lived refresh token (generated once
 * via a Zoho "Self Client" in the API Console), exchanged here for short-lived
 * access tokens on demand — conceptually the same shape as DocuSign's JWT flow,
 * but there is no keypair; the refresh token itself is the long-lived secret.
 *
 * Unlike DocuSign, Zoho Sign lets the caller choose each field's `field_name`
 * directly — there is no auto-generated UUID tab-label indirection to
 * maintain. The semantic names below ARE the field names; whoever
 * builds/edits the template in Zoho's embedded editor must name fields
 * exactly these strings (case-sensitive) for prefill to land correctly.
 *
 * CRITICAL ARCHITECTURE NOTE (found the hard way, 2026-10-21) — a Zoho Sign
 * template has TWO separate field buckets with very different behavior:
 *   - `document_fields`: sender-prefillable merge fields, populated by
 *     `field_text_data`/`field_boolean_data` at send time. This is where
 *     every field below (everything except Signature) MUST live.
 *   - `actions[].fields`: fields owned by a specific recipient, who is
 *     expected to fill them in themselves during signing. `field_data` sent
 *     at createdocument time is SILENTLY IGNORED for fields in this bucket —
 *     the status API still reports back whatever value you sent as if it
 *     took, but it never gets written into the actual document. Only
 *     Signature (and similar recipient actions) belongs here.
 * Zoho's own template editor UI — including its auto-detect/auto-prepare
 * feature — naturally organizes human-placed fields under `actions[].fields`
 * (reasonable from a "designing a form for this recipient" perspective), so
 * a template built or edited by hand in the UI will need its fields moved to
 * `document_fields` via the API before prefill will work. This produced many
 * hours of "the API says it worked but the document is blank" confusion
 * before being isolated with a minimal locked-vs-unlocked, bucket-vs-bucket
 * side-by-side test. If a future template swap reintroduces blank prefill,
 * check this first.
 *
 * SEPARATE, already-resolved platform limitation: locking a text field
 * (`text_property.is_read_only: true`) also blocks its prefilled value from
 * rendering, independent of which bucket it's in. Our template leaves every
 * text field unlocked — signers CAN edit prefilled name/SSN/DOB/etc. before
 * signing, which is a real behavior difference from DocuSign, not an
 * oversight.
 */

// ---------------------------------------------------------------------------
// Config / token handling
// ---------------------------------------------------------------------------

const API_DOMAIN = process.env.ZOHO_SIGN_API_DOMAIN || 'https://sign.zoho.com';
const ACCOUNTS_DOMAIN = process.env.ZOHO_ACCOUNTS_DOMAIN || 'https://accounts.zoho.com';
const SIGNER_ROLE = process.env.ZOHO_SIGN_ACTION_ROLE || 'Agent';

let cachedToken = null; // { accessToken, expiresAt }

/**
 * Get the active Zoho Sign template ID.
 * Checks SystemConfig first, falls back to .env (mirrors docusign.js).
 * @returns {Promise<string>} Template ID
 */
async function getActiveTemplateId() {
  try {
    const config = await SystemConfig.findOne({ key: 'zoho_sign_template_id' }).lean();
    if (config && config.value) return config.value;
  } catch (e) { /* fall through */ }
  return process.env.ZOHO_SIGN_TEMPLATE_ID;
}

/**
 * Exchange the long-lived refresh token for a short-lived access token.
 * Access tokens last ~1 hour; cached in memory with a safety margin.
 * @returns {Promise<string>} Access token
 */
async function authenticateWithOAuth() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.accessToken;
  }

  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Zoho Sign OAuth is not configured (ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REFRESH_TOKEN)');
  }

  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token'
  });

  const response = await fetch(`${ACCOUNTS_DOMAIN}/oauth/v2/token?${params.toString()}`, {
    method: 'POST'
  });
  const body = await response.json();

  if (!response.ok || !body.access_token) {
    console.error('Zoho Sign OAuth Error:', body);
    throw new Error('Failed to authenticate with Zoho Sign: ' + (body.error || response.statusText));
  }

  cachedToken = {
    accessToken: body.access_token,
    // expires_in is in seconds; default to 55 minutes if missing
    expiresAt: Date.now() + ((body.expires_in || 3300) * 1000)
  };

  return cachedToken.accessToken;
}

async function authHeader() {
  const token = await authenticateWithOAuth();
  return { Authorization: `Zoho-oauthtoken ${token}` };
}

// ---------------------------------------------------------------------------
// Field name map (semantic name doubles as the Zoho field_name — see note above)
// ---------------------------------------------------------------------------

const TEXT_FIELD_NAMES = [
  'resident_state', 'firstName', 'middleName', 'lastName', 'dateOfBirth',
  'socialSecurityNumber', 'mobileNumber', 'streetAddress', 'city', 'state', 'zipcode',
  'recruiterFullName', 'recruiterAgentId', 'recruiterEmail', 'recruiterPhone',
  'uplineLeaderName', 'teamName',
  'previouslyContractedYesDescribe', 'convictedOfFelonyYesDescribe',
  'convictedOfFraudYesDescribe', 'subjectToCivilActionYesDescribe',
  'insuranceLicenseYesDescribe', 'difficultyObtainingYesDescribe',
  'unsatisfiedJudgmentDescribe', 'unsatisfiedTaxLiensYesDescribe',
  'oweInsuranceCompanyYesDescribe', 'bankruptcyAdditionalDetails',
  'licenseTypeOtherDescribe', 'stateLicensedIn', 'primaryLicenseNumber', 'licenseStatus',
  // Pages 6-35: the agreement's later sections re-ask for the agent's full
  // legal name, repeated at 5 blanks across pages 6-35. Zoho repeats a
  // value at every field sharing its name, so one entry here covers all 5.
  // agentInitials/effectiveDate/signatureDate are NOT here — they're real
  // Initial/Date-type widgets now, not text, left for the agent to fill
  // themselves (see the comment on this in buildFieldData()).
  'fullLegalName'
];

const CHECKBOX_FIELD_NAMES = [
  'genderMale', 'genderFemale', 'genderOther', 'mailingAddressDifferent',
  'previouslyContractedRHP', 'previouslyContractedYes', 'previouslyContractedNo',
  'convictedOfFelonyYes', 'convictedOfFelonyNo', 'convictedOfFraudYes', 'convictedOfFraudNo',
  'subjectToCivilActionYes', 'subjectToCivilActionNo', 'insuranceLicenseYes', 'insuranceLicenseNo',
  'difficultyObtainingYes', 'difficultyObtainingNo', 'unsatisfiedJudgmentYes', 'unsatisfiedJudgmentNo',
  'unsatisfiedTaxLiensYes', 'unsatisfiedTaxLiensNo', 'oweInsuranceCompanyYes', 'oweInsuranceCompanyNo',
  'filedForBankruptcyYes', 'filedForBankruptcyNo', 'bankruptcyChapter7', 'bankruptcyChapter11',
  'bankruptcyChapter13', 'bankruptcyOpenPending', 'bankruptcyDischarged', 'bankruptcyDismissed',
  'currentlyLicensedYes', 'currentlyLicensedNo', 'licenseTypeLife', 'licenseTypeHealth',
  'licenseTypeLifeHealth', 'licenseTypeOther', 'licenseStatusActive', 'licenseStatusInactive',
  'licenseStatusPending'
];

/**
 * Build the field_data payload for createdocument from an APAApplication,
 * mirroring createSignerTabs() in docusign.js field-for-field.
 * @param {Object} application - APAApplication document
 * @returns {{field_text_data: Object, field_boolean_data: Object}}
 */
function buildFieldData(application) {
  const personalInfo = application.personalInfo || {};
  const recruitingInfo = application.recruitingInfo || {};
  const complianceQuestions = application.complianceQuestions || {};
  const financialBackground = application.financialBackground || {};
  const licensingStatus = application.licensingStatus || {};

  const text = {};
  const bool = {};

  const setText = (name, value) => {
    if (!TEXT_FIELD_NAMES.includes(name)) {
      console.warn(`Unknown Zoho Sign text field: ${name}`);
      return;
    }
    const strValue = (value !== undefined && value !== null) ? String(value).trim() : '';
    // Space clears any placeholder text without leaving template default visible,
    // same convention used for DocuSign tabs.
    text[name] = strValue || ' ';
  };

  const setBool = (name, selected) => {
    if (!CHECKBOX_FIELD_NAMES.includes(name)) {
      console.warn(`Unknown Zoho Sign checkbox field: ${name}`);
      return;
    }
    bool[name] = !!selected;
  };

  // ===== TEXT FIELDS =====
  setText('resident_state', personalInfo.homeAddress?.state || '');
  setText('firstName', personalInfo.legalFirstName || '');
  setText('middleName', personalInfo.legalMiddleName || '');
  setText('lastName', personalInfo.legalLastName || '');
  setText('dateOfBirth', formatDate(personalInfo.dateOfBirth));
  setText('socialSecurityNumber', personalInfo.ssn || '');
  setText('mobileNumber', personalInfo.mobilePhone || '');
  setText('streetAddress', personalInfo.homeAddress?.street || '');
  setText('city', personalInfo.homeAddress?.city || '');
  setText('state', personalInfo.homeAddress?.state || '');
  setText('zipcode', personalInfo.homeAddress?.zipCode || '');

  setText('recruiterFullName', recruitingInfo.recruiterFullName || '');
  setText('recruiterAgentId', recruitingInfo.recruiterAgentId || '');
  setText('recruiterEmail', recruitingInfo.recruiterContact || '');
  setText('recruiterPhone', recruitingInfo.recruiterContact || '');
  setText('uplineLeaderName', recruitingInfo.uplineLeaderName || '');
  setText('teamName', recruitingInfo.teamName || '');

  setText('previouslyContractedYesDescribe',
    complianceQuestions.previouslyContractedOther?.answer ? (complianceQuestions.previouslyContractedOther?.explanation || '') : '');
  setText('convictedOfFelonyYesDescribe',
    complianceQuestions.felonyConviction?.answer ? (complianceQuestions.felonyConviction?.explanation || '') : '');
  setText('convictedOfFraudYesDescribe',
    complianceQuestions.misdemeanorFraud?.answer ? (complianceQuestions.misdemeanorFraud?.explanation || '') : '');
  setText('subjectToCivilActionYesDescribe',
    complianceQuestions.civilAction?.answer ? (complianceQuestions.civilAction?.explanation || '') : '');
  setText('insuranceLicenseYesDescribe',
    complianceQuestions.licenseDenied?.answer ? (complianceQuestions.licenseDenied?.explanation || '') : '');
  setText('difficultyObtainingYesDescribe',
    complianceQuestions.bondIssues?.answer ? (complianceQuestions.bondIssues?.explanation || '') : '');

  setText('unsatisfiedJudgmentDescribe', financialBackground.unsatisfiedJudgmentsExplanation || '');
  setText('unsatisfiedTaxLiensYesDescribe', financialBackground.unsatisfiedLiensExplanation || '');
  setText('oweInsuranceCompanyYesDescribe', '');

  setText('bankruptcyAdditionalDetails',
    financialBackground.bankruptcy?.filed ? (financialBackground.bankruptcy?.explanation || '') : '');

  setText('licenseTypeOtherDescribe', licensingStatus.licenseOtherDescription || '');
  setText('stateLicensedIn', licensingStatus.statesLicensed ? licensingStatus.statesLicensed.join(', ') : '');
  setText('primaryLicenseNumber', licensingStatus.licenseNumber || '');
  setText('licenseStatus', licensingStatus.licenseStatus || '');

  // ===== PAGES 6-35: full legal name (still a prefilled text merge field,
  // repeated at 5 positions) =====
  // agentInitials, effectiveDate, and signatureDate are NOT prefilled here —
  // per 2026-10-21 decision, all three are real Initial/Date-type widgets
  // under actions[].fields now, left for the agent to fill/confirm
  // themselves during signing, same as Signature. Do not add setText() calls
  // for them; Zoho will just ignore any field_text_data sent for a field
  // that isn't actually a text field.
  const fullLegalName = [personalInfo.legalFirstName, personalInfo.legalMiddleName, personalInfo.legalLastName]
    .filter(Boolean).join(' ').trim();

  setText('fullLegalName', fullLegalName);

  // ===== CHECKBOX FIELDS =====
  setBool('genderMale', personalInfo.gender === 'M');
  setBool('genderFemale', personalInfo.gender === 'F');
  setBool('genderOther', personalInfo.gender === 'Other');

  const hasMailingAddress = !!(personalInfo.mailingAddress?.street ||
    personalInfo.mailingAddress?.city ||
    personalInfo.mailingAddress?.state ||
    personalInfo.mailingAddress?.zipCode);
  setBool('mailingAddressDifferent', hasMailingAddress);

  setBool('previouslyContractedRHP', personalInfo.previouslyContracted === true);

  setBool('previouslyContractedYes', complianceQuestions.previouslyContractedOther?.answer === true);
  setBool('previouslyContractedNo', complianceQuestions.previouslyContractedOther?.answer === false);

  setBool('convictedOfFelonyYes', complianceQuestions.felonyConviction?.answer === true);
  setBool('convictedOfFelonyNo', complianceQuestions.felonyConviction?.answer === false);

  setBool('convictedOfFraudYes', complianceQuestions.misdemeanorFraud?.answer === true);
  setBool('convictedOfFraudNo', complianceQuestions.misdemeanorFraud?.answer === false);

  setBool('subjectToCivilActionYes', complianceQuestions.civilAction?.answer === true);
  setBool('subjectToCivilActionNo', complianceQuestions.civilAction?.answer === false);

  setBool('insuranceLicenseYes', complianceQuestions.licenseDenied?.answer === true);
  setBool('insuranceLicenseNo', complianceQuestions.licenseDenied?.answer === false);

  setBool('difficultyObtainingYes', complianceQuestions.bondIssues?.answer === true);
  setBool('difficultyObtainingNo', complianceQuestions.bondIssues?.answer === false);

  setBool('unsatisfiedJudgmentYes', financialBackground.unsatisfiedJudgments === true);
  setBool('unsatisfiedJudgmentNo', financialBackground.unsatisfiedJudgments === false);

  setBool('unsatisfiedTaxLiensYes', financialBackground.unsatisfiedLiens === true);
  setBool('unsatisfiedTaxLiensNo', financialBackground.unsatisfiedLiens === false);

  setBool('oweInsuranceCompanyYes', false);
  setBool('oweInsuranceCompanyNo', true);

  setBool('filedForBankruptcyYes', financialBackground.bankruptcy?.filed === true);
  setBool('filedForBankruptcyNo', financialBackground.bankruptcy?.filed === false);

  if (financialBackground.bankruptcy?.filed) {
    setBool('bankruptcyChapter7', financialBackground.bankruptcy?.chapter === '7');
    setBool('bankruptcyChapter11', financialBackground.bankruptcy?.chapter === '11');
    setBool('bankruptcyChapter13', financialBackground.bankruptcy?.chapter === '13');
    setBool('bankruptcyDischarged', financialBackground.bankruptcy?.status === 'Discharged');
    setBool('bankruptcyOpenPending', financialBackground.bankruptcy?.status === 'Open');
    setBool('bankruptcyDismissed', financialBackground.bankruptcy?.status === 'Dismissed');
  }

  setBool('currentlyLicensedYes', licensingStatus.currentlyLicensed === true);
  setBool('currentlyLicensedNo', licensingStatus.currentlyLicensed === false);

  const licenseTypes = licensingStatus.licenseTypes || [];
  setBool('licenseTypeLife', licenseTypes.includes('Life'));
  setBool('licenseTypeHealth', licenseTypes.includes('Health'));
  setBool('licenseTypeLifeHealth', licenseTypes.includes('Life & Health'));
  setBool('licenseTypeOther', licenseTypes.includes('Other'));

  setBool('licenseStatusActive', licensingStatus.licenseStatus === 'Active');
  setBool('licenseStatusInactive', licensingStatus.licenseStatus === 'Inactive');
  setBool('licenseStatusPending', licensingStatus.licenseStatus === 'Pending Renewal' || licensingStatus.licenseStatus === 'Pending');

  return { field_text_data: text, field_boolean_data: bool };
}

function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

// ---------------------------------------------------------------------------
// Template introspection — find the signer action_id for a given role
// ---------------------------------------------------------------------------

async function getTemplateActionId(templateId, roleName) {
  const headers = await authHeader();
  const response = await fetch(`${API_DOMAIN}/api/v1/templates/${templateId}`, { headers });
  const body = await response.json();
  if (!response.ok || body.code !== 0) {
    throw new Error('Failed to read Zoho Sign template: ' + (body.message || response.statusText));
  }
  const actions = body.templates?.actions || [];
  const match = actions.find(a => a.role === roleName) || actions[0];
  if (!match) {
    throw new Error(`Zoho Sign template ${templateId} has no signer action for role "${roleName}"`);
  }
  return match.action_id;
}

// ---------------------------------------------------------------------------
// Send for signature
// ---------------------------------------------------------------------------

/**
 * Create and send a Zoho Sign request for the APA agreement.
 * Email is sent automatically by Zoho Sign — no embedded signing.
 * @param {Object} application - APAApplication document
 * @returns {Promise<Object>} { envelopeId, status } — named to match docusign.js's
 *          return shape so apa.routes.js needs no further changes.
 */
async function createAPAEnvelope(application) {
  try {
    const templateId = await getActiveTemplateId();
    if (!templateId) {
      throw new Error('Zoho Sign template is not configured (ZOHO_SIGN_TEMPLATE_ID)');
    }
    const actionId = await getTemplateActionId(templateId, SIGNER_ROLE);

    const recruiterName = application.recruitingInfo?.recruiterFullName || 'RHP Office';
    const fieldData = buildFieldData(application);

    const payload = {
      templates: {
        field_data: fieldData,
        actions: [{
          action_id: actionId,
          recipient_name: `${application.personalInfo.legalFirstName} ${application.personalInfo.legalLastName}`,
          recipient_email: application.personalInfo.email,
          role: SIGNER_ROLE,
          verify_recipient: false
        }],
        // NOTE: Zoho Sign's createdocument endpoint has no documented per-send
        // email subject or reply-to override (unlike DocuSign). `notes` becomes
        // the message body shown to all recipients; the email subject is the
        // document name, which defaults to the template name.
        notes: `Thank you for applying to RHP Office! ${recruiterName} has invited you to join the team. ` +
          `Please review and sign your Agent Partnership Agreement to continue. Once signed, you will ` +
          `receive instructions for payment setup ($20/month subscription).`
      }
    };

    const headers = await authHeader();
    const form = new URLSearchParams();
    form.set('data', JSON.stringify(payload));

    const response = await fetch(`${API_DOMAIN}/api/v1/templates/${templateId}/createdocument?is_quicksend=true`, {
      method: 'POST',
      headers,
      body: form
    });
    const body = await response.json();

    if (!response.ok || body.code !== 0) {
      console.error('Zoho Sign Create Document Error:', body);
      throw new Error('Failed to create Zoho Sign document: ' + (body.message || response.statusText));
    }

    console.log('=== Zoho Sign Request Created ===');
    console.log('Request ID:', body.requests?.request_id);
    console.log('Recipient:', application.personalInfo.email);

    return {
      envelopeId: body.requests?.request_id,
      status: 'sent'
    };
  } catch (error) {
    console.error('Zoho Sign Request Creation Error:', error.message);
    throw new Error('Failed to create Zoho Sign request: ' + error.message);
  }
}

// ---------------------------------------------------------------------------
// Status / download
// ---------------------------------------------------------------------------

/**
 * Map a Zoho Sign request_status to the status vocabulary docusign.js used,
 * so callers (apa.routes.js) don't need to change their switch statements.
 */
function mapZohoStatus(requestStatus) {
  switch ((requestStatus || '').toLowerCase()) {
    case 'completed': return 'completed';
    case 'declined': return 'declined';
    case 'expired':
    case 'recalled': return 'voided';
    case 'inprogress':
    default: return 'sent';
  }
}

/**
 * Get request status from Zoho Sign.
 * @param {string} requestId
 * @returns {Promise<Object>} Status details, shaped like docusign.js's getEnvelopeStatus
 */
async function getEnvelopeStatus(requestId) {
  try {
    const headers = await authHeader();
    const response = await fetch(`${API_DOMAIN}/api/v1/requests/${requestId}`, { headers });
    const body = await response.json();
    if (!response.ok || body.code !== 0) {
      throw new Error('Failed to get Zoho Sign request status: ' + (body.message || response.statusText));
    }
    const r = body.requests || {};
    return {
      status: mapZohoStatus(r.request_status),
      sentDateTime: r.created_time ? new Date(r.created_time) : null,
      completedDateTime: r.sign_submitted_time ? new Date(r.sign_submitted_time) : null,
      statusChangedDateTime: r.modified_time ? new Date(r.modified_time) : null,
      recipients: r.actions
    };
  } catch (error) {
    console.error('Zoho Sign Get Status Error:', error);
    throw new Error('Failed to get request status: ' + error.message);
  }
}

/**
 * Download the signed PDF (with embedded digital signature + certificate of
 * completion) once a request is complete.
 * @param {string} requestId
 * @param {string} savePath
 * @returns {Promise<string>} Path to saved document
 */
async function downloadSignedDocument(requestId, savePath) {
  try {
    const headers = await authHeader();
    const response = await fetch(`${API_DOMAIN}/api/v1/requests/${requestId}/pdf`, { headers });
    if (!response.ok) {
      throw new Error(`Zoho Sign download returned HTTP ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const dir = path.dirname(savePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(savePath, buffer);

    console.log('Signed document saved:', savePath);
    return savePath;
  } catch (error) {
    console.error('Zoho Sign Download Document Error:', error);
    throw new Error('Failed to download signed document: ' + error.message);
  }
}

// ---------------------------------------------------------------------------
// Webhook processing
// ---------------------------------------------------------------------------

/**
 * Process a Zoho Sign webhook payload.
 *
 * IMPORTANT — not yet verified against a live webhook delivery (this
 * environment has no public URL for Zoho to call back to during testing).
 * Zoho's own documentation gives one example event name
 * ("RequestSigningSuccess") without a full event catalogue, so this handles
 * a few known/likely shapes defensively and logs the raw payload so the
 * first real delivery in production can be used to tighten this up.
 *
 * @param {Object} webhookData
 * @returns {Promise<Object>} { envelopeId, status, appStatus, signedAt, recipients }
 */
async function processWebhook(webhookData) {
  try {
    const requestInfo = webhookData.requests || webhookData.request || webhookData;
    const requestId = requestInfo.request_id || webhookData.request_id;
    const eventType = webhookData.notifications?.operation_type || webhookData.event_type || webhookData.event;
    const requestStatus = requestInfo.request_status || webhookData.request_status;

    console.log('Zoho Sign Webhook Received:', { eventType, requestId, requestStatus });

    let docStatus = mapZohoStatus(requestStatus);
    let appStatus = 'pending_signature';
    let signedAt = null;

    // Prefer the explicit event name when present; some Zoho webhook configs
    // send only a status snapshot (like the /requests/{id} response shape).
    const normalizedEvent = (eventType || '').toLowerCase();
    if (normalizedEvent.includes('complet') || normalizedEvent.includes('success')) {
      docStatus = 'completed';
    } else if (normalizedEvent.includes('declin')) {
      docStatus = 'declined';
    } else if (normalizedEvent.includes('expir') || normalizedEvent.includes('recall')) {
      docStatus = 'voided';
    }

    switch (docStatus) {
      case 'completed':
        appStatus = 'pending_payment';
        signedAt = requestInfo.sign_submitted_time ? new Date(requestInfo.sign_submitted_time) : new Date();
        break;
      case 'declined':
        appStatus = 'declined';
        break;
      case 'voided':
        appStatus = 'voided';
        break;
      default:
        appStatus = 'pending_signature';
    }

    return {
      envelopeId: requestId,
      status: docStatus,
      appStatus,
      signedAt,
      recipients: requestInfo.actions
    };
  } catch (error) {
    console.error('Zoho Sign Webhook Processing Error:', error);
    throw new Error('Failed to process webhook: ' + error.message);
  }
}

/**
 * Validate a Zoho Sign webhook's HMAC-SHA256 signature.
 *
 * Confirmed directly from the webhook's own setup screen in the Zoho Sign
 * dashboard (Developer settings > Webhooks > Create webhook > Integrity),
 * which shows this exact method: HMAC-SHA256 with the secret as the key,
 * computed over the raw request body, base64-encoded, compared against the
 * `X-ZS-WEBHOOK-SIGNATURE` header. A separate `X-ZS-WEBHOOK-TIMESTAMP`
 * header exists for replay-attack checks but is NOT mixed into the HMAC
 * input itself — Zoho's own sample code computes the digest over the
 * payload alone, so we do the same here.
 *
 * @param {Object} req - Express request object (needs the raw body string —
 *        see note in apa.routes.js about capturing it before JSON parsing)
 * @returns {boolean} True if signature is valid
 */
function validateWebhookSignature(req) {
  try {
    const signature = req.headers['x-zs-webhook-signature'];
    const secret = process.env.ZOHO_SIGN_WEBHOOK_SECRET;

    if (!signature || !secret) {
      console.warn('Zoho Sign webhook validation skipped - missing signature or secret');
      return true; // Allow in development, same leniency as docusign.js
    }

    const rawBody = req.rawBody || JSON.stringify(req.body);
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(rawBody);
    const calculatedSignature = hmac.digest('base64');

    const isValid = signature === calculatedSignature;
    if (!isValid) {
      console.error('Zoho Sign webhook signature validation failed');
    }
    return isValid;
  } catch (error) {
    console.error('Zoho Sign webhook validation error:', error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Template management
// ---------------------------------------------------------------------------

/**
 * Create a brand new Zoho Sign template from a PDF upload.
 * @param {Buffer} pdfBuffer
 * @param {string} fileName
 * @returns {Promise<Object>} { templateId, name }
 */
async function createTemplateFromPDF(pdfBuffer, fileName) {
  const headers = await authHeader();
  const form = new FormData();
  form.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }), fileName || 'APA Agreement.pdf');
  form.append('data', JSON.stringify({
    templates: { template_name: fileName || `APA Agreement - ${new Date().toISOString().slice(0, 10)}` }
  }));

  const response = await fetch(`${API_DOMAIN}/api/v1/templates`, { method: 'POST', headers, body: form });
  const body = await response.json();
  if (!response.ok || body.code !== 0) {
    throw new Error('Failed to create Zoho Sign template: ' + (body.message || response.statusText));
  }

  console.log(`New Zoho Sign template created: ${body.templates.template_id}`);
  return { templateId: body.templates.template_id, name: body.templates.template_name };
}

// Keys Zoho actually accepts when writing a field definition back via PUT
// /templates/{id} — the GET response for an existing template includes many
// server-generated/read-only keys (field_id, field_type_id, x_value, y_value,
// width, height, triggered_field_ids, description_tooltip, is_disabled,
// is_hidden, ...) which make the write fail with "Extra key found" if sent
// back verbatim. Confirmed by live testing against a real template.
function sanitizeTextField(f) {
  return {
    field_type_name: f.field_type_name,
    field_name: f.field_name,
    document_id: f.document_id,
    is_mandatory: !!f.is_mandatory,
    page_no: f.page_no,
    x_coord: f.x_coord,
    y_coord: f.y_coord,
    abs_width: f.abs_width,
    abs_height: f.abs_height,
    text_property: {
      font: f.text_property?.font || 'Arial',
      font_size: f.text_property?.font_size || 10,
      font_color: f.text_property?.font_color || '000000',
      is_bold: !!f.text_property?.is_bold,
      is_italic: !!f.text_property?.is_italic,
      is_read_only: !!f.text_property?.is_read_only
    }
  };
}

function sanitizeCheckboxField(f) {
  return {
    field_type_name: f.field_type_name,
    field_name: f.field_name,
    document_id: f.document_id,
    is_mandatory: !!f.is_mandatory,
    page_no: f.page_no,
    x_coord: f.x_coord,
    y_coord: f.y_coord,
    abs_width: f.abs_width,
    abs_height: f.abs_height,
    default_value: !!f.default_value
  };
}

function sanitizeImageField(f) {
  return {
    field_type_name: f.field_type_name,
    field_name: f.field_name,
    document_id: f.document_id,
    is_mandatory: !!f.is_mandatory,
    page_no: f.page_no,
    x_coord: f.x_coord,
    y_coord: f.y_coord,
    abs_width: f.abs_width,
    abs_height: f.abs_height
  };
}

/**
 * Replace the PDF behind an existing template while preserving field
 * placements — composed from calls proven working by live testing, since
 * Zoho Sign has no single "replace PDF" endpoint (unlike DocuSign's
 * updateDocument, and unlike Zoho Writer's UI-only "Replace PDF" button,
 * which is not reachable from the API).
 *
 * How it works: reads the old template's field layout, uploads the new PDF
 * as a fresh template, then re-applies the old field positions onto the new
 * document (remapping document_id, since a new upload gets a new one).
 * Coordinates are page-relative percentages, so this holds up as long as the
 * new PDF has the same page layout — if a field's page_no doesn't exist in
 * the new PDF (fewer pages), that one field is skipped and reported back so
 * an admin can re-add it.
 *
 * @param {Buffer} pdfBuffer - The new PDF file buffer
 * @param {string} fileName - Original file name
 * @param {string} templateIdOverride - Optional template ID (defaults to active)
 * @returns {Promise<Object>} { templateId, documentId, fileName, updatedAt, skippedFields }
 */
async function updateTemplateDocument(pdfBuffer, fileName, templateIdOverride = null) {
  const headers = await authHeader();
  const oldTemplateId = templateIdOverride || await getActiveTemplateId();
  if (!oldTemplateId) {
    throw new Error('No active Zoho Sign template to replace (ZOHO_SIGN_TEMPLATE_ID not set)');
  }

  // 1. Read the old template's full field layout
  const oldResp = await fetch(`${API_DOMAIN}/api/v1/templates/${oldTemplateId}`, { headers });
  const oldBody = await oldResp.json();
  if (!oldResp.ok || oldBody.code !== 0) {
    throw new Error('Failed to read existing Zoho Sign template: ' + (oldBody.message || oldResp.statusText));
  }
  const oldTemplate = oldBody.templates;
  const oldDocumentFields = oldTemplate.document_fields || [];
  const oldActions = oldTemplate.actions || [];

  // 2. Upload the new PDF as a fresh template (this is the only API-level
  //    way to attach a new PDF — see createTemplateFromPDF)
  const created = await createTemplateFromPDF(pdfBuffer, fileName);
  const newTemplateId = created.templateId;

  const newInfoResp = await fetch(`${API_DOMAIN}/api/v1/templates/${newTemplateId}`, { headers });
  const newInfoBody = await newInfoResp.json();
  const newDocumentId = newInfoBody.templates?.document_ids?.[0]?.document_id;
  const newTotalPages = newInfoBody.templates?.document_ids?.[0]?.total_pages || 0;

  if (!newDocumentId) {
    throw new Error('Could not determine document_id of newly uploaded PDF');
  }

  const skippedFields = [];
  const inRange = (f) => {
    if (f.page_no >= newTotalPages) {
      skippedFields.push(f.field_name);
      return false;
    }
    return true;
  };

  // 3. Remap every field onto the new document_id, dropping anything on a
  //    page that no longer exists in the new PDF.
  // The GET response nests ALL field categories together under `fields` as a
  // flat array (confirmed live: document_fields[].fields is an array of
  // objects, each carrying its own field_category). Split by category and
  // sanitize before re-sending.
  const newDocumentFieldsPayload = oldDocumentFields.map(df => {
    const flatFields = Array.isArray(df.fields) ? df.fields : [];
    const text_fields = flatFields
      .filter(f => f.field_category === 'textfield' && inRange(f))
      .map(f => ({ ...sanitizeTextField(f), document_id: newDocumentId }));
    const check_boxes = flatFields
      .filter(f => f.field_category === 'checkbox' && inRange(f))
      .map(f => ({ ...sanitizeCheckboxField(f), document_id: newDocumentId }));
    return {
      document_id: newDocumentId,
      fields: { text_fields, check_boxes, date_fields: [], radio_groups: [], image_fields: [] }
    };
  });

  const newActionsPayload = oldActions.map(a => {
    const flatFields = Array.isArray(a.fields) ? a.fields : [];
    const image_fields = flatFields
      .filter(f => f.field_category === 'image' && inRange(f))
      .map(f => ({ ...sanitizeImageField(f), document_id: newDocumentId }));
    const text_fields = flatFields
      .filter(f => f.field_category === 'textfield' && inRange(f))
      .map(f => ({ ...sanitizeTextField(f), document_id: newDocumentId }));
    return {
      action_type: a.action_type || 'SIGN',
      role: a.role,
      verify_recipient: !!a.verify_recipient,
      fields: { image_fields, text_fields, check_boxes: [], date_fields: [], radio_groups: [] }
    };
  });

  // 4. Write the remapped layout onto the new template
  const updatePayload = { templates: { document_fields: newDocumentFieldsPayload, actions: newActionsPayload } };
  const form = new URLSearchParams();
  form.set('data', JSON.stringify(updatePayload));
  const putResp = await fetch(`${API_DOMAIN}/api/v1/templates/${newTemplateId}`, {
    method: 'PUT',
    headers,
    body: form
  });
  const putBody = await putResp.json();
  if (!putResp.ok || putBody.code !== 0) {
    throw new Error('Uploaded new PDF but failed to re-apply field layout: ' + (putBody.message || putResp.statusText));
  }

  // 5. Point the app at the new template
  await SystemConfig.findOneAndUpdate(
    { key: 'zoho_sign_template_id' },
    { $set: { key: 'zoho_sign_template_id', value: newTemplateId, category: 'zoho_sign', description: 'Active Zoho Sign template ID for APA agreement', isEditable: true } },
    { upsert: true }
  );

  console.log(`Zoho Sign template replaced: ${oldTemplateId} -> ${newTemplateId} (${fileName})`);
  if (skippedFields.length) {
    console.warn('Fields skipped (page no longer exists in new PDF):', skippedFields);
  }

  return {
    templateId: newTemplateId,
    documentId: newDocumentId,
    fileName,
    updatedAt: new Date().toISOString(),
    skippedFields
  };
}

/**
 * Get template info (name, documents, last modified).
 * @param {string} templateIdOverride
 */
async function getTemplateInfo(templateIdOverride = null) {
  const headers = await authHeader();
  const templateId = templateIdOverride || await getActiveTemplateId();
  const response = await fetch(`${API_DOMAIN}/api/v1/templates/${templateId}`, { headers });
  const body = await response.json();
  if (!response.ok || body.code !== 0) {
    throw new Error('Failed to get Zoho Sign template info: ' + (body.message || response.statusText));
  }
  const t = body.templates;
  return {
    templateId,
    name: t.template_name,
    description: t.description,
    lastModified: t.modified_time ? new Date(t.modified_time) : null,
    documents: (t.document_ids || []).map(d => ({
      documentId: d.document_id,
      name: d.document_name,
      pages: d.total_pages
    }))
  };
}

module.exports = {
  authenticateWithOAuth,
  createAPAEnvelope,
  getEnvelopeStatus,
  downloadSignedDocument,
  processWebhook,
  validateWebhookSignature,
  getActiveTemplateId,
  updateTemplateDocument,
  createTemplateFromPDF,
  getTemplateInfo,
  buildFieldData, // exported for a one-off field-mapping verification script
  TEXT_FIELD_NAMES,
  CHECKBOX_FIELD_NAMES
};
