/**
 * Unit Tests: middleware/payment.middleware.js
 * Tests payment checking middleware
 */

describe('Middleware: payment.middleware.js', () => {
  let paymentMiddleware;

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('../../models/User', () => ({
      findById: jest.fn()
    }));
    paymentMiddleware = require('../../middleware/payment.middleware');
  });

  describe('requirePayment', () => {
    it('should be exported', () => {
      expect(paymentMiddleware.requirePayment).toBeDefined();
      expect(typeof paymentMiddleware.requirePayment).toBe('function');
    });

    it('should call next() immediately (currently disabled)', async () => {
      const req = { user: { _id: 'user123' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();
      await paymentMiddleware.requirePayment(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('requireOneTimePayment', () => {
    it('should be exported', () => {
      expect(paymentMiddleware.requireOneTimePayment).toBeDefined();
      expect(typeof paymentMiddleware.requireOneTimePayment).toBe('function');
    });

    it('should call next() immediately (currently disabled)', async () => {
      const req = { user: { _id: 'user123' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();
      await paymentMiddleware.requireOneTimePayment(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });
});
