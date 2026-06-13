/**
 * Unit Tests: utils/storage.js
 * Tests file storage utilities
 */
const path = require('path');
const fs = require('fs');

describe('Utils: storage.js', () => {
  let storage;

  beforeEach(() => {
    jest.resetModules();
    storage = require('../../utils/storage');
  });

  describe('UPLOADS_ROOT', () => {
    it('should be defined and point to uploads directory', () => {
      expect(storage.UPLOADS_ROOT).toBeDefined();
      expect(storage.UPLOADS_ROOT).toContain('uploads');
    });
  });

  describe('ONBOARDING_ROOT', () => {
    it('should be defined and nested under uploads', () => {
      expect(storage.ONBOARDING_ROOT).toBeDefined();
      expect(storage.ONBOARDING_ROOT).toContain(path.join('uploads', 'onboarding'));
    });
  });

  describe('ensureDir', () => {
    it('should create directory if it does not exist', () => {
      const testDir = path.join(storage.UPLOADS_ROOT, 'test-ensure-dir-' + Date.now());
      const result = storage.ensureDir(testDir);
      expect(result).toBe(testDir);
      expect(fs.existsSync(testDir)).toBe(true);
      // Cleanup
      fs.rmdirSync(testDir);
    });

    it('should return existing directory without error', () => {
      const result = storage.ensureDir(storage.UPLOADS_ROOT);
      expect(result).toBe(storage.UPLOADS_ROOT);
    });
  });

  describe('getUserOnboardingDir', () => {
    it('should create user-specific directory under onboarding', () => {
      const userId = 'test-user-' + Date.now();
      const result = storage.getUserOnboardingDir(userId);
      expect(result).toContain(path.join('onboarding', userId));
      expect(fs.existsSync(result)).toBe(true);
      // Cleanup
      fs.rmdirSync(result);
    });

    it('should throw if userId is falsy', () => {
      expect(() => storage.getUserOnboardingDir(null)).toThrow('User ID required');
      expect(() => storage.getUserOnboardingDir('')).toThrow('User ID required');
      expect(() => storage.getUserOnboardingDir(undefined)).toThrow('User ID required');
    });

    it('should handle ObjectId-like strings', () => {
      const userId = '507f1f77bcf86cd799439011';
      const result = storage.getUserOnboardingDir(userId);
      expect(result).toContain(userId);
      // Cleanup
      if (fs.existsSync(result)) fs.rmdirSync(result);
    });
  });
});
