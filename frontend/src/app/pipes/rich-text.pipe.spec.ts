import { StripHtmlPipe, RichTextPipe, stripHtml, previewText, isEmptyRichText, toDisplayHtml } from './rich-text.pipe';

describe('rich-text helpers', () => {
  it('stripHtml removes tags and keeps text', () => {
    expect(stripHtml('<p><strong>Hello</strong> world</p>')).toBe('Hello world');
  });

  it('stripHtml separates blocks with newlines and decodes entities', () => {
    expect(stripHtml('<p>One</p><p>Two &amp; three&nbsp;four</p>')).toBe('One\nTwo & three four');
  });

  it('stripHtml leaves plain text (with newlines) untouched', () => {
    expect(stripHtml('line1\nline2')).toBe('line1\nline2');
    expect(stripHtml(null)).toBe('');
  });

  it('previewText strips then truncates', () => {
    const html = '<p><b>' + 'a'.repeat(50) + '</b></p>';
    expect(previewText(html, 10)).toBe('a'.repeat(10) + '...');
    expect(previewText('<p>short</p>', 10)).toBe('short');
  });

  it('isEmptyRichText treats Quill empty output and whitespace as empty', () => {
    expect(isEmptyRichText('<p><br></p>')).toBeTrue();
    expect(isEmptyRichText('   ')).toBeTrue();
    expect(isEmptyRichText('')).toBeTrue();
    expect(isEmptyRichText(null)).toBeTrue();
    expect(isEmptyRichText('<p>&nbsp;</p><p><br></p>')).toBeTrue();
    expect(isEmptyRichText('<p>Hi</p>')).toBeFalse();
  });

  it('toDisplayHtml keeps HTML and converts legacy plain-text newlines to <br> (escaped)', () => {
    expect(toDisplayHtml('<p>x</p>')).toBe('<p>x</p>');
    expect(toDisplayHtml('a\nb')).toBe('a<br>b');
    expect(toDisplayHtml('1 < 2 & 3')).toBe('1 &lt; 2 &amp; 3');
  });

  it('pipes delegate to the helpers', () => {
    expect(new StripHtmlPipe().transform('<p>abcdef</p>', 3)).toBe('abc...');
    expect(new StripHtmlPipe().transform('<p>abc</p>')).toBe('abc');
    expect(new RichTextPipe().transform('a\nb')).toBe('a<br>b');
  });
});
