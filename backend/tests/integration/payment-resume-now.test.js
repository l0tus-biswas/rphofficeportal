/**
 * Integration Tests: Agent self-service "pay now" to resume billing early
 * instead of waiting for the scheduled auto-charge (see admin.routes.js
 * billing-exempt route and jobs/resumeBilling.job.js).
 *
 * Covers POST /api/payments/resume-now
 * Models and utils/stripe are mocked globally via setup-integration.js.
 */
const request = require('supertest');

const User = require('../../models/User');
const Subscription = require('../../models/Subscription');
const stripe = require('../../utils/stripe');
const { generateTestToken, createMockUser } = require('../helpers/test-utils');

function asQuery(value) {
  const q = {
    select: jest.fn(() => q),
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
    catch: (reject) => Promise.resolve(value).catch(reject)
  };
  return q;
}

describe('Integration: POST /api/payments/resume-now', () => {
  let app, agentToken;

  beforeAll(() => {
    const { app: expressApp } = require('../../server');
    app = expressApp;
    agentToken = generateTestToken('test-user-id');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_MONTHLY_PRICE_ID = 'price_mock';
    Subscription.findOneAndUpdate = jest.fn().mockResolvedValue({});
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/payments/resume-now');
    expect(res.status).toBe(401);
  });

  it('returns 400 when there is no scheduled resume', async () => {
    User.findById.mockReturnValue(asQuery(createMockUser({
      _id: 'test-user-id', role: 'agent', isActive: true, pendingBillingResumeAt: null
    })));

    const res = await request(app)
      .post('/api/payments/resume-now')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(400);
    expect(stripe.resumeSubscriptionForCustomer).not.toHaveBeenCalled();
  });

  it('pays early and resumes billing immediately (happy path)', async () => {
    const user = createMockUser({
      _id: 'test-user-id', role: 'agent', isActive: true,
      pendingBillingResumeAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      stripeCustomerId: 'cus_mock', billingResumeAttempts: 2
    });
    User.findById.mockReturnValue(asQuery(user));
    stripe.resumeSubscriptionForCustomer.mockResolvedValue({
      id: 'sub_new_mock', status: 'active', current_period_start: 1700000000, current_period_end: 1702592000
    });

    const res = await request(app)
      .post('/api/payments/resume-now')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(stripe.resumeSubscriptionForCustomer).toHaveBeenCalledWith('cus_mock', 'price_mock', expect.objectContaining({ userId: 'test-user-id' }));
    expect(user.stripeSubscriptionId).toBe('sub_new_mock');
    expect(user.paymentAccessEnabled).toBe(true);
    expect(user.pendingBillingResumeAt).toBeNull();
    expect(user.billingResumeAttempts).toBe(0);
    expect(user.save).toHaveBeenCalled();
  });

  it('returns 400 with a clear message when the card is declined', async () => {
    User.findById.mockReturnValue(asQuery(createMockUser({
      _id: 'test-user-id', role: 'agent', isActive: true,
      pendingBillingResumeAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      stripeCustomerId: 'cus_mock'
    })));
    stripe.resumeSubscriptionForCustomer.mockRejectedValueOnce(new Error('Your card was declined'));

    const res = await request(app)
      .post('/api/payments/resume-now')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/payment failed/i);
  });

  it('returns 400 with a specific message when there is no saved payment method', async () => {
    User.findById.mockReturnValue(asQuery(createMockUser({
      _id: 'test-user-id', role: 'agent', isActive: true,
      pendingBillingResumeAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      stripeCustomerId: 'cus_mock'
    })));
    const err = new Error('Customer has no saved payment method to charge');
    err.code = 'NO_PAYMENT_METHOD';
    stripe.resumeSubscriptionForCustomer.mockRejectedValueOnce(err);

    const res = await request(app)
      .post('/api/payments/resume-now')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no saved payment method/i);
  });
});
