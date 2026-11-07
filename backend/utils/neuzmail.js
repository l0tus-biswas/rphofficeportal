/**
 * Neuzmail Transactional Email Service
 *
 * Sends transactional email through the Neuzmail public API (v1).
 *
 * API docs / OpenAPI spec: https://neuzmail.in/api/v1/openapi.json
 *   POST /api/v1/messages            — send a transactional email (scope messages:send)
 *   POST /api/v1/email-verifications — verify one address (scope verifications:write)
 *
 * Two ways to send, chosen per email type:
 *   1. Inline (default): this module renders the HTML and sends `subject` + `html` + `text`.
 *   2. Template: if a NEUZMAIL_TPL_* env var is set for that email type, the message is sent
 *      with `template_id` + `params` (the UPPER_CASE merge fields below).
 */

const axios = require('axios');
const mongoose = require('mongoose');
const SystemConfig = require('../models/SystemConfig');

// ── Neuzmail API Configuration ───────────────────────────────────────────────
// NEUZMAIL_API_URL is the site root; the versioned API lives under /api/v1.
const NEUZMAIL_API_BASE = (process.env.NEUZMAIL_API_URL || 'https://neuzmail.in').replace(/\/+$/, '');
const NEUZMAIL_SEND_ENDPOINT = `${NEUZMAIL_API_BASE}/api/v1/messages`;
const NEUZMAIL_VERIFY_ENDPOINT = `${NEUZMAIL_API_BASE}/api/v1/email-verifications`;
const NEUZMAIL_API_TOKEN = process.env.NEUZMAIL_API_TOKEN;

// Message statuses that mean the provider did not / will not deliver the message.
const FAILED_STATUSES = new Set(['failed', 'bounced']);
const ACCEPTED_STATUSES = new Set(['queued', 'scheduled', 'sent', 'delivered']);

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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Template IDs (optional). Leave the env vars empty to use the built-in inline HTML.
 * IDs are workspace-specific — the IDs from the previous Neuzmail account do not exist
 * on the current one (the API answers 404 template_not_found).
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
 * Variables each Neuzmail template declares (Send → Templates). The API answers
 * 422 missing_params if one is absent, so we send exactly these.
 */
const TEMPLATE_VARS = {
  WELCOME_WITH_PASSWORD:   ['APP_NAME', 'USER_NAME', 'REFERRED_BY', 'USER_EMAIL', 'TEMP_PASSWORD', 'REFERRAL_CODE', 'CURRENT_YEAR', 'LOGIN_URL', 'UNSUBSCRIBE_URL'],
  WELCOME_SET_PASSWORD:    ['APP_NAME', 'FIRST_NAME', 'REFERRED_BY', 'CURRENT_YEAR', 'SET_PASSWORD_URL', 'UNSUBSCRIBE_URL'],
  PASSWORD_RESET:          ['FIRST_NAME', 'APP_NAME', 'CURRENT_YEAR', 'RESET_URL', 'UNSUBSCRIBE_URL'],
  APA_APPLICATION_CONFIRM: ['FIRST_NAME', 'LAST_NAME', 'APPLICATION_ID', 'APP_NAME', 'CURRENT_YEAR', 'UNSUBSCRIBE_URL'],
  PAYMENT_SETUP_LINK:      ['FIRST_NAME', 'APP_NAME', 'CURRENT_YEAR', 'PAYMENT_URL', 'UNSUBSCRIBE_URL'],
  ACCOUNT_ACTIVATED:       ['APP_NAME', 'USER_NAME', 'USER_EMAIL', 'TEMP_PASSWORD', 'CURRENT_YEAR', 'LOGIN_URL', 'UNSUBSCRIBE_URL'],
  SYSTEM_NOTIFICATION:     ['APP_NAME', 'NOTIFICATION_TITLE', 'NOTIFICATION_MESSAGE', 'ACTION_LABEL', 'CURRENT_YEAR', 'ACTION_URL', 'unsubscribe_url'],
};

function firstNameOf(name) {
  return String(name || '').trim().split(/s+/)[0] || '';
}

// ── Inline HTML rendering ──────────────────────────────────────────────────────

/**
 * Build a simple, client-safe transactional email (table-free single column, inline styles).
 * `paragraphs` entries are plain text (escaped). `rawHtmlBlocks` are trusted HTML appended as-is.
 * Returns { html, text }.
 */
function renderEmail({ appName, title, greeting, paragraphs = [], button = null, details = [], rawHtmlBlocks = [], footer = '' }) {
  const p = (t) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1f2937;">${escapeHtml(t).replace(/\r?\n/g, '<br>')}</p>`;
  const detailRows = details.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid #e5e7eb;border-radius:6px;width:100%;">${details
        .map(([k, v]) => `<tr><td style="padding:8px 12px;font-size:13px;color:#6b7280;width:38%;">${escapeHtml(k)}</td><td style="padding:8px 12px;font-size:14px;color:#111827;font-weight:600;">${escapeHtml(v)}</td></tr>`)
        .join('')}</table>`
    : '';
  const btn = button && button.url
    ? `<p style="margin:24px 0;"><a href="${escapeHtml(button.url)}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font-size:15px;font-weight:600;">${escapeHtml(button.label)}</a></p>
       <p style="margin:0 0 16px;font-size:12px;line-height:1.5;color:#6b7280;">If the button does not work, copy this link into your browser:<br><a href="${escapeHtml(button.url)}" style="color:#1d4ed8;word-break:break-all;">${escapeHtml(button.url)}</a></p>`
    : '';

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:24px 16px;">
<div style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
<div style="background:#1e3a8a;padding:18px 24px;color:#ffffff;font-size:18px;font-weight:700;">${escapeHtml(appName)}</div>
<div style="padding:28px 24px;">
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#111827;">${escapeHtml(title)}</h1>
${greeting ? p(greeting) : ''}${paragraphs.map(p).join('')}${detailRows}${rawHtmlBlocks.join('')}${btn}
${footer ? `<p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#6b7280;">${escapeHtml(footer)}</p>` : ''}
</div></div>
<p style="margin:16px 0 0;text-align:center;font-size:12px;color:#9ca3af;">&copy; ${new Date().getFullYear()} ${escapeHtml(appName)}</p>
</div></body></html>`;

  const text = [
    title,
    '',
    greeting,
    ...paragraphs,
    ...details.map(([k, v]) => `${k}: ${v}`),
    button && button.url ? `${button.label}: ${button.url}` : '',
    footer,
  ].filter((l) => l !== undefined && l !== null).join('\n').replace(/\n{3,}/g, '\n\n');

  return { html, text };
}

// ── Core send ──────────────────────────────────────────────────────────────────

/** Neuzmail params must be string | number | boolean, strings max 1000 chars. */
function toParams(mergeFields) {
  const params = {};
  for (const [key, value] of Object.entries(mergeFields || {})) {
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,39}$/.test(key)) continue;
    if (value === undefined || value === null) { params[key] = ''; continue; }
    if (typeof value === 'number' || typeof value === 'boolean') { params[key] = value; continue; }
    params[key] = String(value).slice(0, 1000);
  }
  return params;
}

function extractApiError(error) {
  const data = error.response?.data;
  const apiErr = data?.error;
  if (apiErr && typeof apiErr === 'object') {
    const fields = Array.isArray(apiErr.details?.fields)
      ? ` (${apiErr.details.fields.map((f) => `${f.path}: ${f.message}`).join('; ')})`
      : '';
    return { code: apiErr.code, reason: `${apiErr.code}: ${apiErr.message}${fields}` };
  }
  if (typeof apiErr === 'string') return { code: undefined, reason: apiErr };
  return { code: undefined, reason: `HTTP ${error.response?.status}: ${error.response?.statusText}` };
}

/**
 * Send one transactional email via POST /api/v1/messages.
 *
 * Provide either `templateId` + `mergeFields` (template mode) or `html` (+ optional `text`)
 * (inline mode). `subject` is always sent.
 */
async function sendViaNeuzmail({ templateId, toEmail, subject, mergeFields = {}, html, text, fromEmail, fromName, replyTo, tags }) {
  if (!NEUZMAIL_API_TOKEN) {
    throw new Error('NEUZMAIL_API_TOKEN is not configured');
  }
  if (!templateId && !html) {
    throw new Error('Either a template ID or HTML content is required to send an email');
  }

  const settings = await getEmailSettings();

  const payload = { to: toEmail, subject };
  if (templateId) {
    payload.template_id = templateId;
    const key = Object.keys(TEMPLATE_IDS).find((k) => TEMPLATE_IDS[k] === templateId);
    const allowed = key && TEMPLATE_VARS[key];
    const fields = allowed
      ? Object.fromEntries(allowed.map((name) => [name, mergeFields[name] ?? '']))
      : mergeFields;
    payload.params = toParams(fields);
  } else {
    payload.html = html;
    if (text) payload.text = text;
  }

  const resolvedFromEmail = fromEmail || settings.fromEmail;
  const resolvedFromName = fromName || settings.fromName;
  if (resolvedFromEmail) payload.from = resolvedFromEmail;
  if (resolvedFromName) payload.from_name = resolvedFromName;

  const resolvedReplyTo = replyTo || settings.replyTo;
  if (resolvedReplyTo) payload.reply_to = resolvedReplyTo;

  if (tags && tags.length) payload.tags = tags;

  const post = (body) => axios.post(NEUZMAIL_SEND_ENDPOINT, body, {
    headers: {
      'Authorization': `Bearer ${NEUZMAIL_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  });

  let response;
  try {
    try {
      response = await post(payload);
    } catch (error) {
      // The configured From address must be a verified sender of the Neuzmail workspace.
      // If it is not, retry once with the workspace's default sender rather than lose the email.
      const { code } = error.response ? extractApiError(error) : {};
      if (payload.from && (code === 'no_sender' || code === 'domain_not_verified')) {
        console.warn(`[Neuzmail] From address "${payload.from}" is not verified in Neuzmail (${code}); retrying with workspace default sender.`);
        const { from, ...withoutFrom } = payload;
        response = await post(withoutFrom);
      } else {
        throw error;
      }
    }
  } catch (error) {
    let reason = error.message;
    if (error.response) {
      reason = extractApiError(error).reason;
      console.error(`[Neuzmail] HTTP ${error.response.status} (to=${toEmail}):`, error.response.data);
    } else {
      console.error(`[Neuzmail] Request error (to=${toEmail}):`, error.message);
    }
    throw new Error(`Email could not be sent via Neuzmail: ${reason}`);
  }

  // 202 Accepted: { id, ids, status: 'queued', recipients, results: [{ id, to, status, error }] }
  const data = response.data || {};
  const result = (Array.isArray(data.results) && data.results[0]) || {};
  const status = result.status || data.status;
  const messageId = result.id || data.id;

  if (FAILED_STATUSES.has(status) || !ACCEPTED_STATUSES.has(status) && status !== 'blocked') {
    console.error(`[Neuzmail] Send failed (to=${toEmail}, status=${status}):`, result.error || data);
    throw new Error(`Email could not be sent via Neuzmail: ${result.error || data.error?.message || status || 'unexpected response'}`);
  }
  if (status === 'blocked') {
    // Recipient is on the suppression list / blocked by the workspace — not retryable, not an app error.
    console.warn(`[Neuzmail] Email blocked (to=${toEmail}): ${result.error || 'recipient blocked'}`);
    return { success: true, status: 'suppressed', messageId };
  }

  console.log(`[Neuzmail] Email ${status || 'accepted'}: ${messageId} → ${toEmail}`);
  return { success: true, status, messageId };
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
    // Transactional mail has no per-recipient unsubscribe; templates still require the variable.
    UNSUBSCRIBE_URL: appUrl,
    unsubscribe_url: appUrl,
  };
}

// ── EMAIL FUNCTIONS ────────────────────────────────────────────────────────────

/**
 * 01 - Welcome Email with Temporary Password
 * Trigger: Admin creates user / referral signup / post-payment account creation
 */
exports.sendWelcomeEmail = async (user, password, referredByAgent = null) => {
  const common = await commonFields();
  const subject = `Welcome to ${common.APP_NAME} - Your Account Details`;
  const rendered = renderEmail({
    appName: common.APP_NAME,
    title: 'Welcome aboard!',
    greeting: `Hi ${user.name},`,
    paragraphs: [
      `Your ${common.APP_NAME} account has been created${referredByAgent?.name ? `, referred by ${referredByAgent.name}` : ''}. Use the details below to sign in, then change your password right away.`,
    ],
    details: [
      ['Email', user.email],
      ['Temporary password', password],
      ...(user.referralCode ? [['Your referral code', user.referralCode]] : []),
    ],
    button: { label: 'Sign in', url: common.LOGIN_URL },
  });

  return sendViaNeuzmail({
    templateId: TEMPLATE_IDS.WELCOME_WITH_PASSWORD,
    toEmail: user.email,
    subject,
    html: rendered.html,
    text: rendered.text,
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
  const subject = `Welcome to ${common.APP_NAME} - Set Your Password`;
  const rendered = renderEmail({
    appName: common.APP_NAME,
    title: 'Welcome aboard!',
    greeting: `Hi ${user.name},`,
    paragraphs: [
      `Your ${common.APP_NAME} account has been created${referredByAgent?.name ? `, referred by ${referredByAgent.name}` : ''}. Set your password to get started.`,
    ],
    details: [['Email', user.email]],
    button: { label: 'Set your password', url: setPasswordUrl },
    footer: 'This link expires after a limited time. If you were not expecting this email, you can ignore it.',
  });

  return sendViaNeuzmail({
    templateId: TEMPLATE_IDS.WELCOME_SET_PASSWORD,
    toEmail: user.email,
    subject,
    html: rendered.html,
    text: rendered.text,
    mergeFields: {
      ...common,
      APP_LOGO_URL: '',
      USER_NAME: user.name,
      FIRST_NAME: firstNameOf(user.name),
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
  const subject = `Password Reset Request - ${common.APP_NAME}`;
  const rendered = renderEmail({
    appName: common.APP_NAME,
    title: 'Reset your password',
    greeting: `Hi ${user.name},`,
    paragraphs: [
      'We received a request to reset your password. Click the button below to choose a new one.',
    ],
    button: { label: 'Reset password', url: resetUrl },
    footer: 'If you did not request a password reset, you can safely ignore this email — your password will not change.',
  });

  return sendViaNeuzmail({
    templateId: TEMPLATE_IDS.PASSWORD_RESET,
    toEmail: user.email,
    subject,
    html: rendered.html,
    text: rendered.text,
    mergeFields: {
      ...common,
      APP_LOGO_URL: '',
      USER_NAME: user.name,
      FIRST_NAME: firstNameOf(user.name),
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
  const subject = 'Application Submitted - Review & Send Your Agreement';
  const rendered = renderEmail({
    appName: common.APP_NAME,
    title: 'Application submitted',
    greeting: `Hi ${legalFirstName},`,
    paragraphs: [
      `Thank you for submitting your application, ${legalFirstName} ${legalLastName}. Please review and sign your agreement — you will receive it by email shortly. Once it is signed we will send you a link to complete your payment setup.`,
    ],
    details: [['Application ID', application._id.toString()]],
  });

  return sendViaNeuzmail({
    templateId: TEMPLATE_IDS.APA_APPLICATION_CONFIRM,
    toEmail: email,
    subject,
    html: rendered.html,
    text: rendered.text,
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
 * Trigger: After Zoho Sign agreement is signed
 */
exports.sendPaymentLinkEmail = async (application) => {
  const { legalFirstName, email } = application.personalInfo;
  const common = await commonFields();
  const paymentUrl = `${common.APP_URL}/apa-payment?applicationId=${application._id}`;
  const subject = `${common.APP_NAME} - Complete Your Payment Setup`;
  const rendered = renderEmail({
    appName: common.APP_NAME,
    title: 'Complete your payment setup',
    greeting: `Hi ${legalFirstName},`,
    paragraphs: [
      'Your agreement has been signed. The last step is to set up your payment so we can activate your account.',
    ],
    button: { label: 'Complete payment setup', url: paymentUrl },
  });

  return sendViaNeuzmail({
    templateId: TEMPLATE_IDS.PAYMENT_SETUP_LINK,
    toEmail: email,
    subject,
    html: rendered.html,
    text: rendered.text,
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
  const subject = `Welcome to ${common.APP_NAME} - Your Account is Ready!`;
  const rendered = renderEmail({
    appName: common.APP_NAME,
    title: 'Your account is ready!',
    greeting: `Hi ${user.name},`,
    paragraphs: [
      'Your payment was received and your account is now active. Sign in with the details below, then change your password right away.',
    ],
    details: [
      ['Email', user.email],
      ['Temporary password', password],
      ...(user.referralCode ? [['Your referral code', user.referralCode]] : []),
    ],
    button: { label: 'Sign in', url: common.LOGIN_URL },
  });

  return sendViaNeuzmail({
    templateId: TEMPLATE_IDS.ACCOUNT_ACTIVATED,
    toEmail: user.email,
    subject,
    html: rendered.html,
    text: rendered.text,
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

  const rawHtmlBlocks = resolvedImageUrl
    ? [`<p style="margin:0 0 16px;"><img src="${escapeHtml(resolvedImageUrl)}" alt="" style="max-width:100%;height:auto;border-radius:8px;" /></p>`]
    : [];
  const rendered = renderEmail({
    appName: common.APP_NAME,
    title,
    paragraphs: [message || ''],
    rawHtmlBlocks,
    button: actionUrl ? { label: actionLabel, url: actionUrl } : null,
  });

  return sendViaNeuzmail({
    templateId: TEMPLATE_IDS.SYSTEM_NOTIFICATION,
    toEmail,
    subject: title,
    html: rendered.html,
    text: rendered.text,
    mergeFields: {
      ...common,
      NOTIFICATION_TITLE: title,
      NOTIFICATION_MESSAGE: message || '',
      ACTION_URL: actionUrl,
      ACTION_LABEL: actionLabel,
      IMAGE_URL: resolvedImageUrl,
      NOTIFICATION_IMAGE_URL: resolvedImageUrl,
    },
  });
};

/**
 * Backward-compatible sendEmail function
 * For any code that still calls sendEmail({ email, subject, html }).
 * `html` is passed through as the message body (trusted HTML from internal callers).
 */
exports.sendEmail = async (options) => {
  const common = await commonFields();
  const body = options.html || options.message || '';
  const bodyIsHtml = Boolean(options.html);
  const rendered = renderEmail({
    appName: common.APP_NAME,
    title: options.subject,
    paragraphs: bodyIsHtml ? [] : [body],
    rawHtmlBlocks: bodyIsHtml ? [`<div style="font-size:15px;line-height:1.6;color:#1f2937;">${body}</div>`] : [],
  });
  const text = bodyIsHtml ? body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : rendered.text;

  return sendViaNeuzmail({
    templateId: TEMPLATE_IDS.SYSTEM_NOTIFICATION,
    toEmail: options.email,
    subject: options.subject,
    html: rendered.html,
    text,
    mergeFields: {
      ...common,
      NOTIFICATION_TITLE: options.subject,
      NOTIFICATION_MESSAGE: body,
      ACTION_URL: '',
      ACTION_LABEL: 'View Details',
    },
  });
};

/**
 * Verify an email address using POST /api/v1/email-verifications.
 *
 * Returns the API response ({ email, status, reasons, suggestion, checks, mode, checked_at, cached })
 * plus a backward-compatible `valid` boolean (true unless the address is `undeliverable`).
 * `status` is one of deliverable | risky | undeliverable | unknown.
 */
exports.verifyEmail = async (email, { mode, refresh } = {}) => {
  if (!NEUZMAIL_API_TOKEN) {
    throw new Error('NEUZMAIL_API_TOKEN is not configured');
  }

  const body = { email };
  if (mode) body.mode = mode;
  if (refresh) body.refresh = true;

  try {
    const response = await axios.post(NEUZMAIL_VERIFY_ENDPOINT, body, {
      headers: {
        'Authorization': `Bearer ${NEUZMAIL_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });

    const data = response.data || {};
    return { ...data, valid: data.status !== 'undeliverable' };
  } catch (error) {
    let reason = error.message;
    if (error.response) {
      reason = extractApiError(error).reason;
      console.error(`[Neuzmail] Verify HTTP ${error.response.status}:`, error.response.data);
    } else {
      console.error('[Neuzmail] Verify request error:', error.message);
    }
    throw new Error(`Email verification failed: ${reason}`);
  }
};

// Export template IDs for reference
exports.TEMPLATE_IDS = TEMPLATE_IDS;
