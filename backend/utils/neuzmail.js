/**
 * Neuzmail Transactional Email Service
 * 
 * Replaces nodemailer SMTP with Neuzmail Transactional API.
 * All emails are sent via pre-built templates on Neuzmail with merge tags.
 * 
 * API Docs: https://app.neuzmail.in/api/v1/transactional/send
 */

const axios = require('axios');
const mongoose = require('mongoose');
const SystemConfig = require('../models/SystemConfig');

const NEUZMAIL_API_URL = 'https://app.neuzmail.in/api/v1/transactional/send';
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
 * Template UIDs - Update these after creating templates in Neuzmail dashboard
 * The user will create each template in Neuzmail and paste the UID here.
 */
const TEMPLATE_UIDS = {
  WELCOME_WITH_PASSWORD:    process.env.NEUZMAIL_TPL_WELCOME_PASSWORD      || '', // 01
  WELCOME_SET_PASSWORD:     process.env.NEUZMAIL_TPL_WELCOME_SET_PASSWORD  || '', // 02
  PASSWORD_RESET:           process.env.NEUZMAIL_TPL_PASSWORD_RESET        || '', // 03
  APA_APPLICATION_CONFIRM:  process.env.NEUZMAIL_TPL_APA_CONFIRM           || '', // 04
  PAYMENT_SETUP_LINK:       process.env.NEUZMAIL_TPL_PAYMENT_LINK          || '', // 05
  ACCOUNT_ACTIVATED:        process.env.NEUZMAIL_TPL_ACCOUNT_ACTIVATED     || '', // 06
  SYSTEM_NOTIFICATION:      process.env.NEUZMAIL_TPL_NOTIFICATION          || '', // 07
};

/**
 * Core: Send a transactional email via Neuzmail API
 */
async function sendViaNeuzmail({ templateUid, toEmail, subject, mergeFields = {}, fromEmail, fromName, replyTo }) {
  if (!NEUZMAIL_API_TOKEN) {
    throw new Error('NEUZMAIL_API_TOKEN is not configured');
  }
  if (!templateUid) {
    throw new Error('Template UID is not configured for this email type');
  }

  const settings = await getEmailSettings();

  const payload = {
    template_uid: templateUid,
    to_email: toEmail,
    subject,
    merge_fields: mergeFields,
    from_email: fromEmail || settings.fromEmail,
    from_name: fromName || settings.fromName,
  };

  // Only include reply_to when configured, so we never send an empty/invalid value.
  const resolvedReplyTo = replyTo || settings.replyTo;
  if (resolvedReplyTo) {
    payload.reply_to = resolvedReplyTo;
  }

  try {
    const response = await axios.post(NEUZMAIL_API_URL, payload, {
      headers: {
        'X-Api-Token': NEUZMAIL_API_TOKEN,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });

    if (response.data.status === 'success') {
      console.log(`[Neuzmail] Email sent: ${response.data.data.message_id} → ${toEmail}`);
      return { success: true, messageId: response.data.data.message_id };
    } else {
      console.error(`[Neuzmail] API error (from=${payload.from_email}, to=${toEmail}): ${response.data.message}`);
      throw new Error(response.data.message || 'Neuzmail email send failed');
    }
  } catch (error) {
    // Preserve the underlying reason so callers/UI can show something actionable
    // (e.g. "no valid recipients", "sender not authorized") instead of a generic message.
    let reason = error.message;
    if (error.response) {
      reason = error.response.data?.message || reason;
      console.error(`[Neuzmail] HTTP ${error.response.status} (from=${payload.from_email}, to=${toEmail}):`, error.response.data);
    } else {
      console.error(`[Neuzmail] Request error (from=${payload.from_email}, to=${toEmail}):`, error.message);
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

  await sendViaNeuzmail({
    templateUid: TEMPLATE_UIDS.WELCOME_WITH_PASSWORD,
    toEmail: user.email,
    subject: `Welcome to ${common.APP_NAME} - Your Account Details`,
    mergeFields: {
      ...common,
      APP_LOGO_URL: '', // Will be populated from SystemConfig if needed
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

  await sendViaNeuzmail({
    templateUid: TEMPLATE_UIDS.WELCOME_SET_PASSWORD,
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

  await sendViaNeuzmail({
    templateUid: TEMPLATE_UIDS.PASSWORD_RESET,
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

  await sendViaNeuzmail({
    templateUid: TEMPLATE_UIDS.APA_APPLICATION_CONFIRM,
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

  await sendViaNeuzmail({
    templateUid: TEMPLATE_UIDS.PAYMENT_SETUP_LINK,
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

  await sendViaNeuzmail({
    templateUid: TEMPLATE_UIDS.ACCOUNT_ACTIVATED,
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

  await sendViaNeuzmail({
    templateUid: TEMPLATE_UIDS.SYSTEM_NOTIFICATION,
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

  await sendViaNeuzmail({
    templateUid: TEMPLATE_UIDS.SYSTEM_NOTIFICATION,
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

// Export template UIDs for reference
exports.TEMPLATE_UIDS = TEMPLATE_UIDS;
