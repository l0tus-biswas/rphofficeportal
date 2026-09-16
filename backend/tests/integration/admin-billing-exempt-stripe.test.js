/**
 * Integration Tests: Admin "Free Access" (billing-exempt) now cancels the
 * underlying Stripe subscription.
 *
 * Regression coverage for the bug where granting Free Access in the admin
 * User Management UI only flipped the local `billingExempt` flag and never
 * touched Stripe, so an agent's existing subscription kept auto-billing
 * every cycle even after being marked exempt.
 *
 * Covers PUT /api/admin/users/:userId/billing-exempt
 * Models and utils/stripe are mocked globally via setup-integration.js.
 */
const request = require('supertest');

const User = require('../../models/User');
const Subscription = require('../../models/Subscription');
const Notification = require('../../models/Notification');
const stripe = require('../../utils/stripe');
const { generateAdminToken, createMockAdmin, createMockUser } = require('../helpers/test-utils');

// Build a thenable Mongoose-style query: awaiting it (route handlers) and
// chaining .select() (protect middleware / final response fetch) both
// resolve to `value`.
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

function mockSubscription(overrides = {}) {
  return {
    _id: 'sub-doc-id',
    user: 'agent-test-id',
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

const ADMIN_ID = 'admin-test-id';
const AGENT_ID = 'agent-test-id';

describe('Integration: Admin billing-exempt route cancels Stripe subscription', () => {
  let app, adminToken;

  beforeAll(() => {
    const { app: expressApp } = require('../../server');
    app = expressApp;
    adminToken = generateAdminToken(ADMIN_ID);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    Subscription.findOne.mockReturnValue(asQuery(null));
  });

  /** Wire User.findById to return the admin (auth) or the target agent, by id. */
  function mockUsers(agentOverrides = {}) {
    const agent = createMockUser({ _id: AGENT_ID, role: 'agent', ...agentOverrides });
    const admin = createMockAdmin({ _id: ADMIN_ID });
    User.findById.mockImplementation((id) => asQuery(id === AGENT_ID ? agent : admin));
    return agent;
  }

  it('grants exempt and schedules Stripe cancellation when the user has an active subscription', async () => {
    const agent = mockUsers({ stripeSubscriptionId: 'sub_mock' });
    const sub = mockSubscription();
    Subscription.findOne.mockReturnValue(asQuery(sub));

    const res = await request(app)
      .put(`/api/admin/users/${AGENT_ID}/billing-exempt`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ exempt: true, reason: 'Test agent - free access' });

    expect(res.status).toBe(200);
    expect(res.body.warning).toBeUndefined();
    expect(agent.billingExempt).toBe(true);
    expect(agent.save).toHaveBeenCalled();

    // The critical regression check: Stripe was actually asked to stop billing.
    expect(stripe.cancelSubscriptionAtPeriodEnd).toHaveBeenCalledWith('sub_mock');
    expect(stripe.cancelSubscription).not.toHaveBeenCalled();

    // Local Subscription record kept in sync with Stripe.
    expect(sub.cancelAtPeriodEnd).toBe(true);
    expect(sub.canceledAt).toBeInstanceOf(Date);
    expect(sub.save).toHaveBeenCalled();
  });

  it('does not call Stripe when the user has no subscription to cancel', async () => {
    mockUsers({ stripeSubscriptionId: undefined });

    const res = await request(app)
      .put(`/api/admin/users/${AGENT_ID}/billing-exempt`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ exempt: true, reason: 'No subscription yet' });

    expect(res.status).toBe(200);
    expect(stripe.cancelSubscriptionAtPeriodEnd).not.toHaveBeenCalled();
  });

  it('does not call Stripe when removing exempt status', async () => {
    mockUsers({ stripeSubscriptionId: 'sub_mock', billingExempt: true });

    const res = await request(app)
      .put(`/api/admin/users/${AGENT_ID}/billing-exempt`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ exempt: false, reason: '' });

    expect(res.status).toBe(200);
    expect(stripe.cancelSubscriptionAtPeriodEnd).not.toHaveBeenCalled();
  });

  it('still marks the user exempt and returns a warning if the Stripe cancellation fails', async () => {
    const agent = mockUsers({ stripeSubscriptionId: 'sub_mock' });
    stripe.cancelSubscriptionAtPeriodEnd.mockRejectedValueOnce(new Error('Stripe API error'));

    const res = await request(app)
      .put(`/api/admin/users/${AGENT_ID}/billing-exempt`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ exempt: true, reason: 'Stripe is down' });

    expect(res.status).toBe(200);
    expect(agent.billingExempt).toBe(true);
    expect(res.body.warning).toMatch(/could not be canceled automatically/i);
  });

  describe('Removing exempt status resumes billing when possible', () => {
    it('reactivates a subscription that is merely scheduled to cancel (not yet ended)', async () => {
      mockUsers({ stripeSubscriptionId: 'sub_mock', billingExempt: true });
      const sub = mockSubscription({ cancelAtPeriodEnd: true, canceledAt: new Date(), status: 'active', endedAt: null });
      Subscription.findOne.mockReturnValue(asQuery(sub));

      const res = await request(app)
        .put(`/api/admin/users/${AGENT_ID}/billing-exempt`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ exempt: false, reason: '' });

      expect(res.status).toBe(200);
      expect(res.body.warning).toBeUndefined();
      expect(stripe.reactivateSubscription).toHaveBeenCalledWith('sub_mock');
      expect(sub.cancelAtPeriodEnd).toBe(false);
      expect(sub.canceledAt).toBeNull();
      expect(sub.save).toHaveBeenCalled();
    });

    it('schedules a billing resume and notifies the agent when the old subscription has already ended', async () => {
      const agent = mockUsers({ stripeSubscriptionId: 'sub_mock', stripeCustomerId: 'cus_mock', billingExempt: true });
      Subscription.findOne.mockReturnValue(asQuery(mockSubscription({
        status: 'canceled', endedAt: new Date(), cancelAtPeriodEnd: true
      })));
      process.env.STRIPE_MONTHLY_PRICE_ID = 'price_mock';

      const res = await request(app)
        .put(`/api/admin/users/${AGENT_ID}/billing-exempt`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ exempt: false, reason: '' });

      expect(res.status).toBe(200);
      expect(res.body.warning).toBeUndefined();
      expect(res.body.message).toMatch(/notified.*billing will automatically resume/i);
      // No immediate charge — that's the resume-billing job's job, once the
      // grace period elapses.
      expect(stripe.reactivateSubscription).not.toHaveBeenCalled();
      expect(stripe.resumeSubscriptionForCustomer).not.toHaveBeenCalled();
      expect(agent.pendingBillingResumeAt).toBeInstanceOf(Date);
      expect(agent.pendingBillingResumeAt.getTime()).toBeGreaterThan(Date.now());
      expect(agent.save).toHaveBeenCalled();
      expect(Notification.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'subscription_resume_scheduled', userId: AGENT_ID }),
        true
      );
    });

    it('warns instead of scheduling a resume when the user has no Stripe customer/price on file', async () => {
      mockUsers({ stripeSubscriptionId: 'sub_mock', stripeCustomerId: undefined, billingExempt: true });
      Subscription.findOne.mockReturnValue(asQuery(mockSubscription({
        status: 'canceled', endedAt: new Date(), cancelAtPeriodEnd: true
      })));

      const res = await request(app)
        .put(`/api/admin/users/${AGENT_ID}/billing-exempt`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ exempt: false, reason: '' });

      expect(res.status).toBe(200);
      expect(res.body.warning).toMatch(/no Stripe customer\/price on file/i);
    });

    it('does nothing when the user never had a Stripe subscription', async () => {
      mockUsers({ stripeSubscriptionId: undefined, billingExempt: true });

      const res = await request(app)
        .put(`/api/admin/users/${AGENT_ID}/billing-exempt`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ exempt: false, reason: '' });

      expect(res.status).toBe(200);
      expect(res.body.warning).toBeUndefined();
      expect(stripe.reactivateSubscription).not.toHaveBeenCalled();
    });

    it('warns when the reactivation call to Stripe fails', async () => {
      mockUsers({ stripeSubscriptionId: 'sub_mock', billingExempt: true });
      Subscription.findOne.mockReturnValue(asQuery(mockSubscription({
        cancelAtPeriodEnd: true, status: 'active', endedAt: null
      })));
      stripe.reactivateSubscription.mockRejectedValueOnce(new Error('Stripe API error'));

      const res = await request(app)
        .put(`/api/admin/users/${AGENT_ID}/billing-exempt`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ exempt: false, reason: '' });

      expect(res.status).toBe(200);
      expect(res.body.warning).toMatch(/automatically resuming billing failed/i);
    });
  });
});
