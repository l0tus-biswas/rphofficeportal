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

  describe('with ENFORCE_PAYMENT_ACCESS=true', () => {
    let User;
    const run = async (mw, user) => {
      User.findById.mockResolvedValue(user);
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();
      await mw({ user: { _id: 'u1' } }, res, next);
      return { res, next };
    };

    beforeEach(() => {
      process.env.ENFORCE_PAYMENT_ACCESS = 'true';
      User = require('../../models/User');
    });
    afterEach(() => { delete process.env.ENFORCE_PAYMENT_ACCESS; });

    it('blocks an agent who has not paid the setup fee', async () => {
      const { res, next } = await run(paymentMiddleware.requirePayment, { role: 'agent', oneTimePaymentCompleted: false });
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('blocks an agent whose payment access is disabled', async () => {
      const { res, next } = await run(paymentMiddleware.requirePayment, { role: 'agent', oneTimePaymentCompleted: true, paymentAccessEnabled: false });
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('lets a paid, active agent through', async () => {
      const { next } = await run(paymentMiddleware.requirePayment, { role: 'agent', oneTimePaymentCompleted: true, paymentAccessEnabled: true });
      expect(next).toHaveBeenCalled();
    });

    it('always lets admins and billing-exempt users through', async () => {
      expect((await run(paymentMiddleware.requirePayment, { role: 'admin' })).next).toHaveBeenCalled();
      expect((await run(paymentMiddleware.requirePayment, { role: 'agent', billingExempt: true })).next).toHaveBeenCalled();
      expect((await run(paymentMiddleware.requireOneTimePayment, { role: 'agent', billingExempt: true })).next).toHaveBeenCalled();
    });
  });
});
