/**
 * Unit Tests: utils/stripe.js billing hardening
 *  - uses invoice.confirmation_secret (invoice.payment_intent no longer exists
 *    on the SDK's pinned API version)
 *  - idempotency keys on customer creation and subscription resume
 *  - resume adopts an already-active subscription instead of charging twice
 */
describe('Utils: stripe.js billing hardening', () => {
  let stripeUtils;
  let client;

  beforeEach(() => {
    jest.resetModules();
    client = {
      customers: {
        create: jest.fn().mockResolvedValue({ id: 'cus_1' }),
        retrieve: jest.fn().mockResolvedValue({ id: 'cus_1', invoice_settings: { default_payment_method: 'pm_1' } })
      },
      paymentMethods: { list: jest.fn().mockResolvedValue({ data: [] }) },
      subscriptions: {
        create: jest.fn().mockResolvedValue({ id: 'sub_new', status: 'active' }),
        list: jest.fn().mockResolvedValue({ data: [] })
      }
    };
    jest.doMock('stripe', () => jest.fn(() => client));
    process.env.STRIPE_SECRET_KEY = 'sk_test_valid_key';
    stripeUtils = require('../../utils/stripe');
  });

  describe('getSubscriptionClientSecret', () => {
    it('reads the secret from latest_invoice.confirmation_secret', () => {
      expect(stripeUtils.getSubscriptionClientSecret({
        latest_invoice: { confirmation_secret: { client_secret: 'pi_secret_123' } }
      })).toBe('pi_secret_123');
    });

    it('returns null when no secret is present', () => {
      expect(stripeUtils.getSubscriptionClientSecret({ latest_invoice: {} })).toBeNull();
      expect(stripeUtils.getSubscriptionClientSecret(null)).toBeNull();
    });
  });

  describe('createSubscription', () => {
    it('expands confirmation_secret, not the removed payment_intent', async () => {
      await stripeUtils.createSubscription('cus_1', 'price_1', { a: 'b' });
      const params = client.subscriptions.create.mock.calls[0][0];
      expect(params.expand).toEqual(['latest_invoice.confirmation_secret']);
    });
  });

  describe('createCustomer', () => {
    it('passes the idempotency key to Stripe when given', async () => {
      await stripeUtils.createCustomer('a@b.com', 'A', {}, 'customer-u1');
      expect(client.customers.create).toHaveBeenCalledWith(
        { email: 'a@b.com', name: 'A', metadata: {} },
        { idempotencyKey: 'customer-u1' }
      );
    });

    it('sends no request options when no key is given', async () => {
      await stripeUtils.createCustomer('a@b.com', 'A');
      expect(client.customers.create.mock.calls[0][1]).toBeUndefined();
    });
  });

  describe('resumeSubscriptionForCustomer', () => {
    it('creates the subscription with the idempotency key and no removed expand', async () => {
      const sub = await stripeUtils.resumeSubscriptionForCustomer('cus_1', 'price_1', { userId: 'u1' }, 'resume-u1-1-0');

      expect(sub.id).toBe('sub_new');
      const [params, options] = client.subscriptions.create.mock.calls[0];
      expect(params).toMatchObject({ customer: 'cus_1', default_payment_method: 'pm_1', payment_behavior: 'error_if_incomplete' });
      expect(params.expand).toBeUndefined();
      expect(options).toEqual({ idempotencyKey: 'resume-u1-1-0' });
    });

    it('adopts an already-active subscription instead of charging again', async () => {
      client.subscriptions.list.mockResolvedValue({
        data: [{ id: 'sub_live', status: 'active', cancel_at_period_end: false }]
      });

      const sub = await stripeUtils.resumeSubscriptionForCustomer('cus_1', 'price_1', {}, 'k');

      expect(sub.id).toBe('sub_live');
      expect(client.subscriptions.create).not.toHaveBeenCalled();
    });

    it('does not adopt a subscription that is scheduled to cancel', async () => {
      client.subscriptions.list.mockResolvedValue({
        data: [{ id: 'sub_ending', status: 'active', cancel_at_period_end: true }]
      });

      const sub = await stripeUtils.resumeSubscriptionForCustomer('cus_1', 'price_1', {}, 'k');

      expect(sub.id).toBe('sub_new');
      expect(client.subscriptions.create).toHaveBeenCalled();
    });

    it('throws NO_PAYMENT_METHOD when the customer has nothing to charge', async () => {
      client.customers.retrieve.mockResolvedValue({ id: 'cus_1', invoice_settings: {} });

      await expect(stripeUtils.resumeSubscriptionForCustomer('cus_1', 'price_1', {}, 'k'))
        .rejects.toMatchObject({ code: 'NO_PAYMENT_METHOD' });
      expect(client.subscriptions.create).not.toHaveBeenCalled();
    });
  });
});
