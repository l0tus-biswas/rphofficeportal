/**
 * Unit tests: utils/helpers contentDisposition
 * Node throws (ERR_INVALID_CHAR) on header values with characters above Latin-1, so a raw
 * file name in Content-Disposition turns a normal download into a 500.
 */
const http = require('http');
const { contentDisposition } = require('../../utils/helpers');

// Same validation Node applies in res.setHeader.
const isValidHeaderValue = (value) => {
  try {
    const res = new http.ServerResponse({ method: 'GET' });
    res.setHeader('Content-Disposition', value);
    return true;
  } catch (e) {
    return false;
  }
};

describe('utils/helpers contentDisposition', () => {
  it.each([
    'report.pdf',
    'Guía “2026” 😀.pdf',
    'quote " and \\ backslash.pdf',
    'semi;colon, and spaces.pdf',
    "apostrophe's (1) *.pdf",
    '日本語.pdf',
    'new\nline.pdf'
  ])('produces a header value Node accepts for %j', (name) => {
    expect(isValidHeaderValue(contentDisposition('attachment', name))).toBe(true);
  });

  it('would have crashed with the raw name', () => {
    expect(isValidHeaderValue('attachment; filename="Guía “2026” 😀.pdf"')).toBe(false);
  });

  it('keeps the original name in the UTF-8 form and an ASCII fallback', () => {
    const value = contentDisposition('inline', 'Guía 2026.pdf');
    expect(value).toMatch(/^inline; filename="Gu_a 2026\.pdf"; filename\*=UTF-8''Gu%C3%ADa%202026\.pdf$/);
  });

  it('falls back to a default name', () => {
    expect(contentDisposition('attachment', undefined)).toContain('filename="download"');
  });
});
