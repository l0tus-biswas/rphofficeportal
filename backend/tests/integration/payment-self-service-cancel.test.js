/**
 * Integration Tests: Agent Self-Service Subscription Cancellation
 * Covers the agent-facing billing endpoints added for self-service cancellation:
 *   POST /api/payments/cancel-subscription      (cancel at period end)
 *   POST /api/payments/reactivate-subscription  (undo a scheduled cancellation)
 *
 * Models and utils/stripe are mocked globally via setup-integration.js.
 */
const request = require('supertest');

const User = require('../../models/User');
const Subscription = require('../../models/Subscription');
const stripe = require('../../utils/stripe');
const { generateTestToken, createMockUser } = require('../helpers/test-utils');

// Build a thenable Mongoose-style query: awaiting it (route handlers) and
// chaining .select() (protect middleware) both resolve to `value`.
function asQuery(value) {
  const q = {
    select: jest.fn(() => q),
    sort: jest.fn(() => q),
    lean: jest.fn(() => q),
    populate: jest.fn(() => q),
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
    catch: (reject) => Promise.resolve(value).catch(reject)
  };
  return q;
}

// A subscription "document" with a spyable save()
function mockSubscription(overrides = {}) {
  return {
    _id: 'sub-doc-id',
    user: 'test-user-id',
    stripeSubscriptionId: 'sub_mock',
    stripeCustomerId: 'cus_mock',
    status: 'active',
    cancelAtPeriodEnd: false,
    canceledAt: null,
    endedAt: null,
    currentPeriodEnd: new Date('2025-12-01'),
    amount: 2000,
    interval: 'month',
    save: jest.fn().mockResolvedValue(true),
    ...overrides
  };
}

describe('Integration: Agent self-service subscription cancellation', () => {
  let app, agentToken;

  beforeAll(() => {
    const { app: expressApp } = require('../../server');
    app = expressApp;
    agentToken = generateTestToken('test-user-id');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Default authenticated agent (overridden per-test for specific scenarios)
    User.findById.mockReturnValue(asQuery(createMockUser({
      _id: 'test-user-id',
      role: 'agent',
      isActive: true,
      stripeSubscriptionId: 'sub_mock'
    })));
    Subscription.findOne.mockReturnValue(asQuery(mockSubscription()));
  });

  // --------------------------------------------------------------------------
  // POST /api/payments/cancel-subscription
  // --------------------------------------------------------------------------
  describe('POST /api/payments/cancel-subscription', () => {
    it('requires authentication', async () => {
      const res = await request(app).post('/api/payments/cancel-subscription');
      expect(res.status).toBe(401);
    });

    it('cancels at period end and syncs Stripe + local record (happy path)', async () => {
      const sub = mockSubscription();
      Subscription.findOne.mockReturnValue(asQuery(sub));

      const res = await request(app)
        .post('/api/payments/cancel-subscription')
        .set('Authorization', `Bearer ${agentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.cancelAtPeriodEnd).toBe(true);
      // Stripe was asked to cancel at period end (NOT an immediate cancel)
      expect(stripe.cancelSubscriptionAtPeriodEnd).toHaveBeenCalledWith('sub_mock');
      expect(stripe.cancelSubscription).not.toHaveBeenCalled();
      // Local record was updated + persisted
      expect(sub.cancelAtPeriodEnd).toBe(true);
      expect(sub.canceledAt).toBeInstanceOf(Date);
      expect(sub.save).toHaveBeenCalled();
    });

    it('returns 404 when the user has no subscription', async () => {
      User.findById.mockReturnValue(asQuery(createMockUser({
        _id: 'test-user-id', role: 'agent', isActive: true, stripeSubscriptionId: undefined
      })));

      const res = await request(app)
        .post('/api/payments/cancel-subscription')
        .set('Authorization', `Bearer ${agentToken}`);

      expect(res.status).toBe(404);
      expect(stripe.cancelSubscriptionAtPeriodEnd).not.toHaveBeenCalled();
    });

    it('returns 400 for billing-exempt users', async () => {
      User.findById.mockReturnValue(asQuery(createMockUser({
        _id: 'test-user-id', role: 'agent', isActive: true,
        stripeSubscriptionId: 'sub_mock', billingExempt: true
      })));

      const res = await request(app)
        .post('/api/payments/cancel-subscription')
        .set('Authorization', `Bearer ${agentToken}`);

      expect(res.status).toBe(400);
      expect(stripe.cancelSubscriptionAtPeriodEnd).not.toHaveBeenCalled();
    });

    it('returns 400 when subscription is already canceled', async () => {
      Subscription.findOne.mockReturnValue(asQuery(mockSubscription({
        status: 'canceled', endedAt: new Date()
      })));

      const res = await request(app)
        .post('/api/payments/cancel-subscription')
        .set('Authorization', `Bearer ${agentToken}`);

      expect(res.status).toBe(400);
      expect(stripe.cancelSubscriptionAtPeriodEnd).not.toHaveBeenCalled();
    });

    it('returns 400 when cancellation is already scheduled', async () => {
      Subscription.findOne.mockReturnValue(asQuery(mockSubscription({
        cancelAtPeriodEnd: true
      })));

      const res = await request(app)
        .post('/api/payments/cancel-subscription')
        .set('Authorization', `Bearer ${agentToken}`);

      expect(res.status).toBe(400);
      expect(stripe.cancelSubscriptionAtPeriodEnd).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // POST /api/payments/reactivate-subscription
  // --------------------------------------------------------------------------
  describe('POST /api/payments/reactivate-subscription', () => {
    it('requires authentication', async () => {
      const res = await request(app).post('/api/payments/reactivate-subscription');
      expect(res.status).toBe(401);
    });

    it('reactivates a scheduled-to-cancel subscription (happy path)', async () => {
      const sub = mockSubscription({ cancelAtPeriodEnd: true, canceledAt: new Date() });
      Subscription.findOne.mockReturnValue(asQuery(sub));

      const res = await request(app)
        .post('/api/payments/reactivate-subscription')
        .set('Authorization', `Bearer ${agentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.cancelAtPeriodEnd).toBe(false);
      expect(stripe.reactivateSubscription).toHaveBeenCalledWith('sub_mock');
      expect(sub.cancelAtPeriodEnd).toBe(false);
      expect(sub.canceledAt).toBeNull();
      expect(sub.save).toHaveBeenCalled();
    });

    it('returns 404 when the user has no subscription', async () => {
      User.findById.mockReturnValue(asQuery(createMockUser({
        _id: 'test-user-id', role: 'agent', isActive: true, stripeSubscriptionId: undefined
      })));

      const res = await request(app)
        .post('/api/payments/reactivate-subscription')
        .set('Authorization', `Bearer ${agentToken}`);

      expect(res.status).toBe(404);
      expect(stripe.reactivateSubscription).not.toHaveBeenCalled();
    });

    it('returns 400 when the subscription has already ended', async () => {
      Subscription.findOne.mockReturnValue(asQuery(mockSubscription({
        status: 'canceled', endedAt: new Date()
      })));

      const res = await request(app)
        .post('/api/payments/reactivate-subscription')
        .set('Authorization', `Bearer ${agentToken}`);

      expect(res.status).toBe(400);
      expect(stripe.reactivateSubscription).not.toHaveBeenCalled();
    });
  });
});
