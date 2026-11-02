/**
 * Unit tests: utils/multer decodeFilename
 * multer 1.x reads multipart filenames as Latin-1 while browsers send UTF-8.
 */
const { decodeFilename } = require('../../utils/multer');

// What multer hands us for a UTF-8 name: the UTF-8 bytes interpreted as Latin-1 characters.
const asMulterSeesIt = (name) => Buffer.from(name, 'utf8').toString('latin1');

describe('utils/multer decodeFilename', () => {
  it.each([
    'Guía 2026.pdf',
    'Résumé final.pdf',
    'Müller – Übersicht.pdf',
    'Guía “2026”.pdf',
    'señor ñandú.pdf',
    'emoji 😀 file.pdf',
    '日本語.pdf'
  ])('restores %s', (name) => {
    expect(decodeFilename(asMulterSeesIt(name))).toBe(name);
  });

  it('leaves plain ASCII names untouched', () => {
    expect(decodeFilename('plain-name_01.pdf')).toBe('plain-name_01.pdf');
  });

  it('leaves names that are already real Unicode untouched', () => {
    expect(decodeFilename('日本語.pdf')).toBe('日本語.pdf');
    expect(decodeFilename('emoji 😀.pdf')).toBe('emoji 😀.pdf');
  });

  it('keeps a genuine Latin-1 name that is not valid UTF-8 as it is', () => {
    expect(decodeFilename('café.pdf')).toBe('café.pdf');
  });

  it('does not throw on non-string input', () => {
    expect(decodeFilename(undefined)).toBeUndefined();
    expect(decodeFilename(null)).toBeNull();
  });
});
