/**
 * Unit Tests: utils/encryption.js
 * Tests AES-256-GCM encrypt/decrypt functions
 */

describe('Utils: encryption.js', () => {
  let encryption;

  beforeEach(() => {
    jest.resetModules();
    process.env.ENCRYPTION_KEY = 'a'.repeat(64); // 32 bytes as hex
    encryption = require('../../utils/encryption');
  });

  describe('encrypt', () => {
    it('should encrypt a string and return iv:authTag:ciphertext format', () => {
      const result = encryption.encrypt('hello world');
      expect(result).toBeTruthy();
      const parts = result.split(':');
      expect(parts).toHaveLength(3);
      // IV should be 32 hex chars (16 bytes)
      expect(parts[0]).toHaveLength(32);
      // Auth tag should be 32 hex chars (16 bytes)
      expect(parts[1]).toHaveLength(32);
      // Ciphertext should exist
      expect(parts[2].length).toBeGreaterThan(0);
    });

    it('should return null for null input', () => {
      expect(encryption.encrypt(null)).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(encryption.encrypt('')).toBeNull();
    });

    it('should produce different ciphertexts for same plaintext (random IV)', () => {
      const r1 = encryption.encrypt('test');
      const r2 = encryption.encrypt('test');
      expect(r1).not.toBe(r2);
    });

    it('should handle special characters', () => {
      const result = encryption.encrypt('Spëciäl Ch@rs! 🎉');
      expect(result).toBeTruthy();
    });

    it('should handle long strings', () => {
      const longStr = 'x'.repeat(10000);
      const result = encryption.encrypt(longStr);
      expect(result).toBeTruthy();
    });

    it('should throw if ENCRYPTION_KEY is missing', () => {
      delete process.env.ENCRYPTION_KEY;
      jest.resetModules();
      const enc = require('../../utils/encryption');
      expect(() => enc.encrypt('test')).toThrow('ENCRYPTION_KEY environment variable is required');
    });
  });

  describe('decrypt', () => {
    it('should decrypt an encrypted string back to original', () => {
      const original = 'Hello, World!';
      const encrypted = encryption.encrypt(original);
      const decrypted = encryption.decrypt(encrypted);
      expect(decrypted).toBe(original);
    });

    it('should return null for null input', () => {
      expect(encryption.decrypt(null)).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(encryption.decrypt('')).toBeNull();
    });

    it('should decrypt special characters correctly', () => {
      const original = 'Pässwörd!@#$%^&*()';
      const encrypted = encryption.encrypt(original);
      expect(encryption.decrypt(encrypted)).toBe(original);
    });

    it('should throw on tampered ciphertext', () => {
      const encrypted = encryption.encrypt('test');
      const parts = encrypted.split(':');
      parts[2] = 'ff' + parts[2].slice(2); // tamper ciphertext
      expect(() => encryption.decrypt(parts.join(':'))).toThrow();
    });

    it('should throw on tampered auth tag', () => {
      const encrypted = encryption.encrypt('test');
      const parts = encrypted.split(':');
      parts[1] = '00'.repeat(16); // replace auth tag
      expect(() => encryption.decrypt(parts.join(':'))).toThrow();
    });

    it('should throw if ENCRYPTION_KEY is missing', () => {
      const encrypted = encryption.encrypt('test');
      delete process.env.ENCRYPTION_KEY;
      jest.resetModules();
      const enc = require('../../utils/encryption');
      expect(() => enc.decrypt(encrypted)).toThrow('ENCRYPTION_KEY environment variable is required');
    });
  });

  describe('roundtrip', () => {
    const testCases = [
      'simple text',
      '12345',
      'email@example.com',
      'SSN: 123-45-6789',
      JSON.stringify({ key: 'value', nested: { arr: [1, 2, 3] } }),
      'Unicode: 你好世界 Ñoño café',
      '\n\t\r special whitespace',
    ];

    testCases.forEach(text => {
      it(`should roundtrip: "${text.substring(0, 30)}..."`, () => {
        const encrypted = encryption.encrypt(text);
        const decrypted = encryption.decrypt(encrypted);
        expect(decrypted).toBe(text);
      });
    });
  });
});
