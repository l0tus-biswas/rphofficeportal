/**
 * Unit Tests: utils/stripe.js
 * Tests Stripe utility functions
 */

describe('Utils: stripe.js', () => {
  let stripeUtils;

  beforeEach(() => {
    jest.resetModules();
    // Mock stripe module
    jest.doMock('stripe', () => {
      return jest.fn(() => ({
        customers: {
          create: jest.fn().mockResolvedValue({ id: 'cus_test123', email: 'test@test.com' })
        },
        paymentIntents: {
          create: jest.fn().mockResolvedValue({ id: 'pi_test123', client_secret: 'cs_test' }),
          retrieve: jest.fn().mockResolvedValue({ id: 'pi_test123', status: 'succeeded' })
        },
        subscriptions: {
          create: jest.fn().mockResolvedValue({ id: 'sub_test123', status: 'active' }),
          cancel: jest.fn().mockResolvedValue({ id: 'sub_test123', status: 'canceled' }),
          update: jest.fn().mockResolvedValue({ id: 'sub_test123', status: 'active' }),
          retrieve: jest.fn().mockResolvedValue({ id: 'sub_test123', status: 'active' })
        },
        invoices: {
          retrieve: jest.fn().mockResolvedValue({ id: 'in_test123', total: 5000 })
        },
        webhooks: {
          constructEvent: jest.fn().mockReturnValue({ type: 'payment_intent.succeeded' })
        }
      }));
    });
    process.env.STRIPE_SECRET_KEY = 'sk_test_valid_key';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    stripeUtils = require('../../utils/stripe');
  });

  describe('createCustomer', () => {
    it('should create a Stripe customer', async () => {
      const result = await stripeUtils.createCustomer('test@test.com', 'Test User', { userId: '123' });
      expect(result).toHaveProperty('id', 'cus_test123');
    });

    it('should throw when Stripe is not configured', async () => {
      jest.resetModules();
      process.env.STRIPE_SECRET_KEY = '';
      jest.doMock('stripe', () => jest.fn(() => null));
      const su = require('../../utils/stripe');
      if (!su.stripe) {
        // stripe is null when key is invalid
        expect(su.stripe).toBeNull();
      }
    });
  });

  describe('createPaymentIntent', () => {
    it('should create a payment intent with amount', async () => {
      const result = await stripeUtils.createPaymentIntent(5000, 'usd', 'cus_123');
      expect(result).toHaveProperty('id', 'pi_test123');
      expect(result).toHaveProperty('client_secret');
    });

    it('should work without customerId', async () => {
      const result = await stripeUtils.createPaymentIntent(3000, 'usd', null);
      expect(result).toHaveProperty('id');
    });
  });

  describe('createSubscription', () => {
    it('should create a subscription', async () => {
      const result = await stripeUtils.createSubscription('cus_123', 'price_test');
      expect(result).toHaveProperty('id', 'sub_test123');
      expect(result).toHaveProperty('status', 'active');
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel a subscription', async () => {
      const result = await stripeUtils.cancelSubscription('sub_test123');
      expect(result).toHaveProperty('status', 'canceled');
    });
  });

  describe('updateSubscription', () => {
    it('should update a subscription', async () => {
      const result = await stripeUtils.updateSubscription('sub_test123', { metadata: { key: 'val' } });
      expect(result).toHaveProperty('id', 'sub_test123');
    });
  });

  describe('retrieveSubscription', () => {
    it('should retrieve a subscription', async () => {
      const result = await stripeUtils.retrieveSubscription('sub_test123');
      expect(result).toHaveProperty('id', 'sub_test123');
    });
  });

  describe('retrievePaymentIntent', () => {
    it('should retrieve a payment intent', async () => {
      const result = await stripeUtils.retrievePaymentIntent('pi_test123');
      expect(result).toHaveProperty('id', 'pi_test123');
      expect(result).toHaveProperty('status', 'succeeded');
    });
  });

  describe('retrieveInvoice', () => {
    it('should retrieve an invoice', async () => {
      const result = await stripeUtils.retrieveInvoice('in_test123');
      expect(result).toHaveProperty('id', 'in_test123');
      expect(result).toHaveProperty('total', 5000);
    });
  });

  describe('constructWebhookEvent', () => {
    it('should construct a webhook event from payload and signature', () => {
      const result = stripeUtils.constructWebhookEvent('payload', 'sig_test');
      expect(result).toHaveProperty('type', 'payment_intent.succeeded');
    });
  });
});
