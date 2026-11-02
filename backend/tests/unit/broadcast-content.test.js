/**
 * Unit Tests: utils/broadcastContent
 * Allowlist sanitiser for rich-text broadcast messages + plain-text helpers.
 */
const {
  sanitizeBroadcastHtml,
  htmlToPlainText,
  isEmptyBroadcastHtml
} = require('../../utils/broadcastContent');

describe('sanitizeBroadcastHtml', () => {
  it('strips script tags and their content', () => {
    const out = sanitizeBroadcastHtml('<p>Hi</p><script>alert(1)</script>');
    expect(out).toBe('<p>Hi</p>');
  });

  it('strips event-handler attributes and disallowed tags', () => {
    const out = sanitizeBroadcastHtml('<p onclick="x()">a</p><img src=x onerror="alert(1)"><iframe src="//e"></iframe>');
    expect(out).not.toMatch(/onerror|onclick|<img|<iframe/i);
    expect(out).toContain('<p>a</p>');
  });

  it('removes javascript: and data: hrefs', () => {
    const js = sanitizeBroadcastHtml('<a href="javascript:alert(1)">x</a>');
    expect(js).not.toMatch(/javascript:/i);
    const data = sanitizeBroadcastHtml('<a href="data:text/html;base64,AAAA">x</a>');
    expect(data).not.toMatch(/data:/i);
  });

  it('keeps http/https/mailto links and forces target/rel', () => {
    const out = sanitizeBroadcastHtml('<a href="https://example.com" target="_self" rel="opener">go</a>');
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(sanitizeBroadcastHtml('<a href="mailto:a@b.com">m</a>')).toContain('href="mailto:a@b.com"');
  });

  it('keeps allowed formatting', () => {
    const html = '<h2>T</h2><p><strong>b</strong> <em>i</em> <u>u</u> <s>s</s></p><ul><li>one</li></ul><ol><li>two</li></ol><blockquote>q</blockquote>';
    expect(sanitizeBroadcastHtml(html)).toBe(html);
  });

  it('keeps Quill ql-* classes only', () => {
    const out = sanitizeBroadcastHtml('<p class="ql-indent-1 evil">x</p><span class="ql-color-red">y</span>');
    expect(out).toContain('class="ql-indent-1"');
    expect(out).toContain('class="ql-color-red"');
    expect(out).not.toContain('evil');
  });

  it('limits span style to safe color / background-color', () => {
    const ok = sanitizeBroadcastHtml('<span style="color: rgb(230, 0, 0); background-color: #ffff00">x</span>');
    expect(ok).toContain('color:rgb(230, 0, 0)');
    expect(ok).toContain('background-color:#ffff00');
    const bad = sanitizeBroadcastHtml('<span style="position:fixed;color:red;background:url(javascript:x)">x</span>');
    expect(bad).not.toMatch(/position|url\(|background:/);
  });

  it('returns empty string for non-strings', () => {
    expect(sanitizeBroadcastHtml(undefined)).toBe('');
    expect(sanitizeBroadcastHtml(42)).toBe('');
  });
});

describe('isEmptyBroadcastHtml', () => {
  it.each([
    ['<p><br></p>'],
    ['   '],
    [''],
    ['<p> </p><p><br></p>'],
    ['<p>&nbsp;</p>'],
    ['<script>alert(1)</script>']
  ])('treats %j as empty', (input) => {
    expect(isEmptyBroadcastHtml(input)).toBe(true);
  });

  it('treats real text as non-empty', () => {
    expect(isEmptyBroadcastHtml('<p>Hello</p>')).toBe(false);
    expect(isEmptyBroadcastHtml('plain old text\nwith newline')).toBe(false);
  });
});

describe('htmlToPlainText', () => {
  it('strips tags and keeps block line breaks', () => {
    expect(htmlToPlainText('<p>One</p><p>Two <strong>bold</strong></p>')).toBe('One\nTwo bold');
  });

  it('converts <br> and decodes entities', () => {
    expect(htmlToPlainText('a<br>b &amp; c&nbsp;d')).toBe('a\nb & c d');
  });

  it('leaves plain text untouched', () => {
    expect(htmlToPlainText('line1\nline2')).toBe('line1\nline2');
  });
});
