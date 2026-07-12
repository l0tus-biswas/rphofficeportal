/**
 * Neuzmail Transactional Email Service
 * 
 * Replaces nodemailer SMTP with Neuzmail Transactional API.
 * All emails are sent via pre-built templates on Neuzmail with merge tags.
 * 
 * API Docs: https://neuzmail.in
 * OpenAPI: POST /api/v1/messages — Send a transactional email
 *          POST /api/v1/verify   — Verify an email address
 */

const axios = require('axios');
const mongoose = require('mongoose');
const SystemConfig = require('../models/SystemConfig');

// ── Neuzmail API Configuration ───────────────────────────────────────────────
// All emails are sent via the new Neuzmail API at https://neuzmail.in/api/v1/messages.
const NEUZMAIL_API_BASE = process.env.NEUZMAIL_API_URL || 'https://neuzmail.in';
const NEUZMAIL_SEND_ENDPOINT = `${NEUZMAIL_API_BASE}/api/v1/messages`;
const NEUZMAIL_VERIFY_ENDPOINT = `${NEUZMAIL_API_BASE}/api/v1/verify`;
const NEUZMAIL_API_TOKEN = process.env.NEUZMAIL_API_TOKEN;

// ── Email sender settings (admin-configurable via SystemConfig) ─────────────────
// These keys are managed from Admin → System Configuration → Email Configuration.
// Source of truth is the database; environment variables are used as fallback so
// the app keeps working before any admin override has been saved.
const EMAIL_SETTING_KEYS = {
  fromName: 'email_from_name',
  fromEmail: 'email_from_email',
  replyTo: 'email_reply_to',
};

const DEFAULT_FROM_EMAIL = 'contracting@rhpoffice.com';
const DEFAULT_FROM_NAME = 'RHP Office';

const SETTINGS_CACHE_TTL_MS = 30000;
let _settingsCache = null;
let _settingsCachedAt = 0;

/**
 * Resolve the active email sender settings.
 * Order of precedence: SystemConfig (DB) → environment variable → hardcoded default.
 * Results are cached briefly to avoid a DB hit on every email.
 */
async function getEmailSettings(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && _settingsCache && (now - _settingsCachedAt) < SETTINGS_CACHE_TTL_MS) {
    return _settingsCache;
  }

  const byKey = {};
  try {
    // Skip the DB read when not connected (early boot / unit tests) to avoid
    // mongoose command buffering, which would otherwise hang.
    if (mongoose.connection?.readyState === 1) {
      const docs = await SystemConfig.find({
        key: { $in: Object.values(EMAIL_SETTING_KEYS) }
      }).lean();
      for (const doc of docs) {
        if (doc.value !== undefined && doc.value !== null && String(doc.value).trim() !== '') {
          byKey[doc.key] = String(doc.value).trim();
        }
      }
    }
  } catch (error) {
    // DB unavailable — fall back to env/defaults silently so email still sends.
    console.error('[Neuzmail] Could not load email settings from DB, using env fallback:', error.message);
  }

  const settings = {
    fromName: byKey[EMAIL_SETTING_KEYS.fromName] || process.env.SMTP_FROM_NAME || DEFAULT_FROM_NAME,
    fromEmail: byKey[EMAIL_SETTING_KEYS.fromEmail] || process.env.SMTP_FROM_EMAIL || DEFAULT_FROM_EMAIL,
    replyTo: byKey[EMAIL_SETTING_KEYS.replyTo] || process.env.SMTP_REPLY_TO || '',
  };

  _settingsCache = settings;
  _settingsCachedAt = now;
  return settings;
}

/** Clear the cached settings so the next send reloads from the DB immediately. */
function invalidateEmailSettingsCache() {
  _settingsCache = null;
  _settingsCachedAt = 0;
}

exports.EMAIL_SETTING_KEYS = EMAIL_SETTING_KEYS;
exports.getEmailSettings = getEmailSettings;
exports.invalidateEmailSettingsCache = invalidateEmailSettingsCache;

function isAbsoluteUrl(url) {
  return /^https?:\/\//i.test(url || '');
}

function toAbsoluteUrl(url, appUrl) {
  if (!url) return '';
  if (isAbsoluteUrl(url)) return url;

  const base = (appUrl || '').replace(/\/+$/, '');
  const relative = url.startsWith('/') ? url : `/${url}`;
  return `${base}${relative}`;
}

function withEmailFallbackContent(message, actionUrl, imageUrl) {
  const safeMessage = message || '';
  const extras = [];

  if (actionUrl) {
    extras.push(`Link: ${actionUrl}`);
  }
  if (imageUrl) {
    // Also include an image tag for templates that render HTML in body merge tags.
    extras.push(`<br><img src="${imageUrl}" alt="Announcement Image" style="max-width:100%;height:auto;border-radius:8px;" />`);
  }

  if (!extras.length) return safeMessage;
  return `${safeMessage}<br><br>${extras.join('<br>')}`;
}

/**
 * Template IDs — These map to saved template IDs in Neuzmail.
 * Set via environment variables (or configure in SystemConfig).
 * The default values assume templates have been created in the Neuzmail dashboard
 * and their IDs are stored in the .env file.
 */
const TEMPLATE_IDS = {
  WELCOME_WITH_PASSWORD:    process.env.NEUZMAIL_TPL_WELCOME_PASSWORD      || '',
  WELCOME_SET_PASSWORD:     process.env.NEUZMAIL_TPL_WELCOME_SET_PASSWORD  || '',
  PASSWORD_RESET:           process.env.NEUZMAIL_TPL_PASSWORD_RESET        || '',
  APA_APPLICATION_CONFIRM:  process.env.NEUZMAIL_TPL_APA_CONFIRM           || '',
  PAYMENT_SETUP_LINK:       process.env.NEUZMAIL_TPL_PAYMENT_LINK          || '',
  ACCOUNT_ACTIVATED:        process.env.NEUZMAIL_TPL_ACCOUNT_ACTIVATED     || '',
  SYSTEM_NOTIFICATION:      process.env.NEUZMAIL_TPL_NOTIFICATION          || '',
};

/**
 * Core: Send a transactional email via Neuzmail API
 * Uses the new /api/v1/messages endpoint with Bearer token auth.
 */
async function sendViaNeuzmail({ templateId, toEmail, subject, mergeFields = {}, fromEmail, fromName, replyTo }) {
  if (!NEUZMAIL_API_TOKEN) {
    throw new Error('NEUZMAIL_API_TOKEN is not configured');
  }
  if (!templateId) {
    throw new Error('Template ID is not configured for this email type');
  }

  const settings = await getEmailSettings();

  const payload = {
    to: toEmail,
    subject,
    templateId: templateId,
    data: mergeFields,
  };

  // Add sender info if provided or configured
  const resolvedFromEmail = fromEmail || settings.fromEmail;
  const resolvedFromName = fromName || settings.fromName;
  if (resolvedFromEmail && resolvedFromName) {
    payload.from = `${resolvedFromName} <${resolvedFromEmail}>`;
  }

  // Only include reply_to when configured
  const resolvedReplyTo = replyTo || settings.replyTo;
  if (resolvedReplyTo) {
    payload.replyTo = resolvedReplyTo;
  }

  try {
    const response = await axios.post(NEUZMAIL_SEND_ENDPOINT, payload, {
      headers: {
        'Authorization': `Bearer ${NEUZMAIL_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });

    if (response.status === 200 && response.data?.status === 'sent') {
      console.log(`[Neuzmail] Email sent: ${response.data.id} → ${toEmail}`);
      return { success: true, messageId: response.data.id || response.data.messageId };
    } else if (response.status === 202 && response.data?.status === 'suppressed') {
      console.log(`[Neuzmail] Email suppressed (recipient on suppression list): ${toEmail}`);
      return { success: true, status: 'suppressed', messageId: response.data.id };
    } else {
      console.error(`[Neuzmail] API error (to=${toEmail}): unexpected response`, response.data);
      throw new Error(response.data?.error || 'Neuzmail email send failed');
    }
  } catch (error) {
    let reason = error.message;
    if (error.response) {
      reason = error.response.data?.error || `HTTP ${error.response.status}: ${error.response.statusText}`;
      console.error(`[Neuzmail] HTTP ${error.response.status} (to=${toEmail}):`, error.response.data);
    } else {
      console.error(`[Neuzmail] Request error (to=${toEmail}):`, error.message);
    }
    throw new Error(`Email could not be sent via Neuzmail: ${reason}`);
  }
}

// ── Helper to get common merge fields ──────────────────────────────────────────

async function commonFields() {
  const appUrl = (process.env.APP_URL || 'https://rhpoffice.com').replace(/\/+$/, '');
  const settings = await getEmailSettings();
  return {
    APP_NAME: settings.fromName,
    APP_URL: appUrl,
    LOGIN_URL: `${appUrl}/login`,
    CURRENT_YEAR: new Date().getFullYear().toString(),
  };
}

// ── EMAIL FUNCTIONS ────────────────────────────────────────────────────────────

/**
 * 01 - Welcome Email with Temporary Password
 * Trigger: Admin creates user / referral signup / post-payment account creation
 */
exports.sendWelcomeEmail = async (user, password, referredByAgent = null) => {
  const common = await commonFields();

  return sendViaNeuzmail({
    templateId: TEMPLATE_IDS.WELCOME_WITH_PASSWORD,
    toEmail: user.email,
    subject: `Welcome to ${common.APP_NAME} - Your Account Details`,
    mergeFields: {
      ...common,
      APP_LOGO_URL: '',
      USER_NAME: user.name,
      USER_EMAIL: user.email,
      TEMP_PASSWORD: password,
      REFERRAL_CODE: user.referralCode || '',
      REFERRED_BY: referredByAgent?.name || '',
    },
  });
};

/**
 * 02 - Welcome Email with Set Password Link
 * Trigger: Admin creates user with set-password token (no temp password shared)
 */
exports.sendWelcomeSetPasswordEmail = async (user, setPasswordToken, referredByAgent = null) => {
  const common = await commonFields();
  const setPasswordUrl = `${common.APP_URL}/reset-password?token=${setPasswordToken}`;

  return sendViaNeuzmail({
    templateId: TEMPLATE_IDS.WELCOME_SET_PASSWORD,
    toEmail: user.email,
    subject: `Welcome to ${common.APP_NAME} - Set Your Password`,
    mergeFields: {
      ...common,
      APP_LOGO_URL: '',
      USER_NAME: user.name,
      USER_EMAIL: user.email,
      SET_PASSWORD_URL: setPasswordUrl,
      REFERRED_BY: referredByAgent?.name || '',
    },
  });
};

/**
 * 03 - Password Reset Email
 * Trigger: User clicks "Forgot Password"
 */
exports.sendPasswordResetEmail = async (user, resetToken) => {
  const common = await commonFields();
  const resetUrl = `${common.APP_URL}/reset-password?token=${resetToken}`;

  return sendViaNeuzmail({
    templateId: TEMPLATE_IDS.PASSWORD_RESET,
    toEmail: user.email,
    subject: `Password Reset Request - ${common.APP_NAME}`,
    mergeFields: {
      ...common,
      APP_LOGO_URL: '',
      USER_NAME: user.name,
      RESET_URL: resetUrl,
    },
  });
};

/**
 * 04 - APA Application Confirmation
 * Trigger: After APA application form submission
 */
exports.sendApplicationConfirmationEmail = async (application) => {
  const { legalFirstName, legalLastName, email } = application.personalInfo;
  const common = await commonFields();

  return sendViaNeuzmail({
    templateId: TEMPLATE_IDS.APA_APPLICATION_CONFIRM,
    toEmail: email,
    subject: 'Application Submitted - Review & Send Your Agreement',
    mergeFields: {
      ...common,
      FIRST_NAME: legalFirstName,
      LAST_NAME: legalLastName,
      APPLICATION_ID: application._id.toString(),
    },
  });
};

/**
 * 05 - Payment Setup Link
 * Trigger: After DocuSign agreement is signed
 */
exports.sendPaymentLinkEmail = async (application) => {
  const { legalFirstName, email } = application.personalInfo;
  const common = await commonFields();
  const paymentUrl = `${common.APP_URL}/apa-payment?applicationId=${application._id}`;

  return sendViaNeuzmail({
    templateId: TEMPLATE_IDS.PAYMENT_SETUP_LINK,
    toEmail: email,
    subject: `${common.APP_NAME} - Complete Your Payment Setup`,
    mergeFields: {
      ...common,
      FIRST_NAME: legalFirstName,
      PAYMENT_URL: paymentUrl,
    },
  });
};

/**
 * 06 - Account Activated (Post-Payment Welcome)
 * Trigger: After payment is completed successfully
 */
exports.sendAccountActivatedEmail = async (user, password) => {
  const common = await commonFields();

  return sendViaNeuzmail({
    templateId: TEMPLATE_IDS.ACCOUNT_ACTIVATED,
    toEmail: user.email,
    subject: `Welcome to ${common.APP_NAME} - Your Account is Ready!`,
    mergeFields: {
      ...common,
      USER_NAME: user.name,
      USER_EMAIL: user.email,
      TEMP_PASSWORD: password,
      REFERRAL_CODE: user.referralCode || '',
    },
  });
};

/**
 * 07 - System Notification (Generic)
 * Trigger: Various system events (login, password change, recruit added, etc.)
 */
exports.sendNotificationEmail = async ({
  toEmail,
  title,
  message,
  link = null,
  imageUrl = null,
  actionLabel = 'View Details'
}) => {
  const common = await commonFields();
  const actionUrl = link ? toAbsoluteUrl(link, common.APP_URL) : '';
  const resolvedImageUrl = imageUrl ? toAbsoluteUrl(imageUrl, common.APP_URL) : '';
  const notificationMessage = withEmailFallbackContent(message, actionUrl, resolvedImageUrl);

  return sendViaNeuzmail({
    templateId: TEMPLATE_IDS.SYSTEM_NOTIFICATION,
    toEmail,
    subject: title,
    mergeFields: {
      ...common,
      NOTIFICATION_TITLE: title,
      NOTIFICATION_MESSAGE: notificationMessage,
      ACTION_URL: actionUrl,
      ACTION_LABEL: actionLabel,
      IMAGE_URL: resolvedImageUrl,
      NOTIFICATION_IMAGE_URL: resolvedImageUrl,
    },
  });
};

/**
 * Backward-compatible sendEmail function  
 * For any code that still calls sendEmail({ email, subject, html })
 * Falls back to the notification template with raw content.
 */
exports.sendEmail = async (options) => {
  const common = await commonFields();

  return sendViaNeuzmail({
    templateId: TEMPLATE_IDS.SYSTEM_NOTIFICATION,
    toEmail: options.email,
    subject: options.subject,
    mergeFields: {
      ...common,
      NOTIFICATION_TITLE: options.subject,
      NOTIFICATION_MESSAGE: options.html || options.message || '',
      ACTION_URL: '',
      ACTION_LABEL: 'View Details',
    },
  });
};

/**
 * Verify an email address using Neuzmail's /api/v1/verify endpoint
 */
exports.verifyEmail = async (email) => {
  if (!NEUZMAIL_API_TOKEN) {
    throw new Error('NEUZMAIL_API_TOKEN is not configured');
  }

  try {
    const response = await axios.post(NEUZMAIL_VERIFY_ENDPOINT, { email }, {
      headers: {
        'Authorization': `Bearer ${NEUZMAIL_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });

    return response.data;
  } catch (error) {
    let reason = error.message;
    if (error.response) {
      reason = error.response.data?.error || `HTTP ${error.response.status}`;
      console.error(`[Neuzmail] Verify HTTP ${error.response.status}:`, error.response.data);
    } else {
      console.error('[Neuzmail] Verify request error:', error.message);
    }
    throw new Error(`Email verification failed: ${reason}`);
  }
};

// Export template IDs for reference
exports.TEMPLATE_IDS = TEMPLATE_IDS;