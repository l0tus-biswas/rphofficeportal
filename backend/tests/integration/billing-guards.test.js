/**
 * Regression tests: billing guards found in QA
 *  - exempt users cannot start/reactivate a paid subscription
 *  - a late payment_intent.payment_failed cannot overwrite a succeeded payment,
 *    and a redelivered payment_intent.succeeded is not re-processed
 */
const request = require('supertest');
const User = require('../../models/User');
const Payment = require('../../models/Payment');
const stripe = require('../../utils/stripe');
const { generateTestToken, createMockUser } = require('../helpers/test-utils');

function asQuery(value) {
  const q = { select: jest.fn(() => q), lean: jest.fn(() => q), sort: jest.fn(() => q), populate: jest.fn(() => q),
    then: (a, b) => Promise.resolve(value).then(a, b), catch: (b) => Promise.resolve(value).catch(b) };
  return q;
}

function postWebhook(app, event) {
  stripe.constructWebhookEvent.mockReturnValue(event);
  return request(app).post('/api/payments/webhook').set('stripe-signature', 'sig')
    .set('Content-Type', 'application/json').send(Buffer.from(JSON.stringify(event)));
}

describe('billing guards', () => {
  let app, token;
  beforeAll(() => { app = require('../../server').app; token = generateTestToken('test-user-id'); });
  beforeEach(() => { jest.clearAllMocks(); });

  it.each(['subscription-intent', 'reactivate-subscription'])('refuses %s for a billing-exempt user', async (route) => {
    const user = createMockUser({ _id: 'test-user-id', billingExempt: true, oneTimePaymentCompleted: true, stripeSubscriptionId: 'sub_x', stripeCustomerId: 'cus_x' });
    User.findById.mockImplementation(() => asQuery(user));
    const res = await request(app).post(`/api/payments/${route}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(stripe.createSubscription).not.toHaveBeenCalled();
    expect(stripe.reactivateSubscription).not.toHaveBeenCalled();
  });

  it('does not downgrade a succeeded payment on a late payment_failed event', async () => {
    const payment = { status: 'succeeded', user: 'u1', amount: 100, save: jest.fn() };
    Payment.findOne.mockResolvedValue(payment);
    const res = await postWebhook(app, { type: 'payment_intent.payment_failed', created: 1, data: { object: { id: 'pi_1' } } });
    expect(res.status).toBe(200);
    expect(payment.status).toBe('succeeded');
    expect(payment.save).not.toHaveBeenCalled();
  });

  it('ignores a redelivered payment_intent.succeeded for a refunded payment', async () => {
    const payment = { status: 'refunded', user: 'u1', amount: 100, type: 'setup_fee', save: jest.fn() };
    Payment.findOne.mockResolvedValue(payment);
    const res = await postWebhook(app, { type: 'payment_intent.succeeded', created: 1, data: { object: { id: 'pi_1' } } });
    expect(res.status).toBe(200);
    expect(payment.status).toBe('refunded');
    expect(payment.save).not.toHaveBeenCalled();
  });
});
