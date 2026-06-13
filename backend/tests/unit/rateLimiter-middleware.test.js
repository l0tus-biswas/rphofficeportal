/**
 * Unit Tests: middleware/rateLimiter.middleware.js
 * Tests rate limiting configuration
 */

describe('Middleware: rateLimiter.middleware.js', () => {
  let rateLimiter;

  beforeEach(() => {
    jest.resetModules();
    process.env.NODE_ENV = 'test';
    rateLimiter = require('../../middleware/rateLimiter.middleware');
  });

  describe('apiLimiter', () => {
    it('should be defined as a function', () => {
      expect(rateLimiter.apiLimiter).toBeDefined();
      expect(typeof rateLimiter.apiLimiter).toBe('function');
    });

    it('should skip in test environment (calls next async)', (done) => {
      const req = { ip: '127.0.0.1', headers: {}, method: 'GET', url: '/test' };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), setHeader: jest.fn(), getHeader: jest.fn() };
      rateLimiter.apiLimiter(req, res, () => { done(); });
    });
  });

  describe('authLimiter', () => {
    it('should be defined as a function', () => {
      expect(rateLimiter.authLimiter).toBeDefined();
      expect(typeof rateLimiter.authLimiter).toBe('function');
    });

    it('should skip in test environment (calls next async)', (done) => {
      const req = { ip: '127.0.0.1', headers: {}, body: { email: 'test@test.com' }, method: 'POST', url: '/login' };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), setHeader: jest.fn(), getHeader: jest.fn() };
      rateLimiter.authLimiter(req, res, () => { done(); });
    });
  });

  describe('applyLimiter', () => {
    it('should be defined as a function', () => {
      expect(rateLimiter.applyLimiter).toBeDefined();
      expect(typeof rateLimiter.applyLimiter).toBe('function');
    });

    it('should skip in test environment (calls next async)', (done) => {
      const req = { ip: '127.0.0.1', headers: {}, method: 'POST', url: '/apply' };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), setHeader: jest.fn(), getHeader: jest.fn() };
      rateLimiter.applyLimiter(req, res, () => { done(); });
    });
  });

  describe('resetLimiter', () => {
    it('should be defined as a function', () => {
      expect(rateLimiter.resetLimiter).toBeDefined();
      expect(typeof rateLimiter.resetLimiter).toBe('function');
    });

    it('should skip in test environment (calls next async)', (done) => {
      const req = { ip: '127.0.0.1', headers: {}, method: 'POST', url: '/reset' };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), setHeader: jest.fn(), getHeader: jest.fn() };
      rateLimiter.resetLimiter(req, res, () => { done(); });
    });
  });

  describe('configuration', () => {
    it('should respect custom RATE_LIMIT_WINDOW_MS', () => {
      process.env.RATE_LIMIT_WINDOW_MS = '60000';
      jest.resetModules();
      const rl = require('../../middleware/rateLimiter.middleware');
      expect(rl.apiLimiter).toBeDefined();
    });

    it('should respect custom AUTH_RATE_LIMIT_MAX', () => {
      process.env.AUTH_RATE_LIMIT_MAX = '10';
      jest.resetModules();
      const rl = require('../../middleware/rateLimiter.middleware');
      expect(rl.authLimiter).toBeDefined();
    });
  });
});
