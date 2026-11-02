const { cleanTitle, cleanLink } = require('../../utils/broadcastContent');

describe('cleanTitle', () => {
  it('strips tags and rejects non-strings / empty / too long', () => {
    expect(cleanTitle('<img src=x onerror=alert(1)>Hello')).toBe('Hello');
    expect(cleanTitle({ $ne: 1 })).toBeNull();
    expect(cleanTitle('   ')).toBeNull();
    expect(cleanTitle('x'.repeat(201))).toBeNull();
  });
});

describe('cleanLink', () => {
  it('allows http(s) and in-app paths, empty becomes null', () => {
    expect(cleanLink('https://example.com/a')).toEqual({ ok: true, value: 'https://example.com/a' });
    expect(cleanLink('/broadcasts')).toEqual({ ok: true, value: '/broadcasts' });
    expect(cleanLink('')).toEqual({ ok: true, value: null });
  });
  it('refuses javascript:, data:, protocol-relative and non-strings', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', '//evil.com', { a: 1 }, 'https://a b']) {
      expect(cleanLink(bad).ok).toBe(false);
    }
  });
});
