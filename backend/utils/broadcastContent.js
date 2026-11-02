/**
 * Broadcast message sanitising + plain-text helpers.
 *
 * Broadcast messages are admin-authored rich text (Quill) stored as HTML and
 * shown to every user, so they are sanitised on write with a small allowlist.
 */
const sanitizeHtml = require('sanitize-html');

const COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)|[a-z]{3,20})$/i;

const SANITIZE_OPTIONS = {
  allowedTags: [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's',
    'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'a', 'span'
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    span: ['class', 'style'],
    p: ['class'],
    li: ['class'],
    ol: ['class'],
    ul: ['class'],
    h1: ['class'], h2: ['class'], h3: ['class'], h4: ['class'],
    blockquote: ['class']
  },
  allowedStyles: {
    span: {
      color: [COLOR_RE],
      'background-color': [COLOR_RE]
    }
  },
  // Only Quill classes survive (ql-indent-1, ql-color-red, ...)
  allowedClasses: {
    '*': [/^ql-[a-z0-9-]+$/i]
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesAppliedToAttributes: ['href'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  transformTags: {
    a: (tagName, attribs) => ({
      tagName: 'a',
      attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer' }
    })
  }
};

function sanitizeBroadcastHtml(input) {
  if (typeof input !== 'string') return '';
  return sanitizeHtml(input, SANITIZE_OPTIONS).trim();
}

/** Strip all tags -> plain text, keeping line breaks between blocks. */
function htmlToPlainText(input) {
  if (typeof input !== 'string') return '';
  const withBreaks = input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h[1-6]|li|blockquote|ul|ol)>/gi, '\n');
  const text = sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} });
  return text
    .replace(/&nbsp;|&#160;| /g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** True when the message has no visible text (e.g. '<p><br></p>', whitespace). */
function isEmptyBroadcastHtml(input) {
  return htmlToPlainText(sanitizeBroadcastHtml(input)) === '';
}

/** Titles are plain text: tags are stripped. Returns null when not a usable string. */
function cleanTitle(input) {
  if (typeof input !== 'string') return null;
  const text = htmlToPlainText(input.trim()).replace(/\s+/g, ' ').trim();
  return text && text.length <= 200 ? text : null;
}

/**
 * Links must be absolute http(s) URLs or an in-app path ("/broadcasts"); javascript:, data: etc.
 * are refused. Returns { ok, value } where value is null for an empty link.
 */
function cleanLink(input) {
  if (input === undefined || input === null || input === '') return { ok: true, value: null };
  if (typeof input !== 'string') return { ok: false };
  const link = input.trim();
  if (!link) return { ok: true, value: null };
  if (link.length > 2048 || /[\u0000-\u001f\s]/.test(link)) return { ok: false };
  if (/^https?:\/\/[^/]/i.test(link) || /^\/(?!\/)/.test(link)) return { ok: true, value: link };
  return { ok: false };
}

module.exports = { sanitizeBroadcastHtml, htmlToPlainText, isEmptyBroadcastHtml, cleanTitle, cleanLink, SANITIZE_OPTIONS };
