/**
 * Integration Tests: Stripe webhook handlers must not revoke platform access
 * for billing-exempt ("Free Access") users.
 *
 * Regression coverage: cancelling/pausing an exempt user's now-redundant
 * Stripe subscription (e.g. via the admin billing-exempt route) triggers
 * real Stripe webhooks (customer.subscription.updated/deleted,
 * invoice.payment_failed). Those handlers used to unconditionally set
 * paymentAccessEnabled = false on cancel/failure, which would silently cut
 * off an exempt user's access — defeating the point of Free Access.
 *
 * Covers POST /api/payments/webhook
 * Models and utils/stripe are mocked globally via setup-integration.js.
 */
const request = require('supertest');

const User = require('../../models/User');
const Subscription = require('../../models/Subscription');
const stripe = require('../../utils/stripe');
const { createMockUser } = require('../helpers/test-utils');

function mockSubscription(overrides = {}) {
  return {
    _id: 'sub-doc-id',
    user: 'agent-test-id',
    stripeSubscriptionId: 'sub_mock',
    status: 'active',
    cancelAtPeriodEnd: false,
    endedAt: null,
    currentPeriodStart: new Date('2025-11-01'),
    currentPeriodEnd: new Date('2025-12-01'),
    save: jest.fn().mockResolvedValue(true),
    ...overrides
  };
}

function postWebhook(app, event) {
  stripe.constructWebhookEvent.mockReturnValue(event);
  return request(app)
    .post('/api/payments/webhook')
    .set('stripe-signature', 'test-sig')
    .set('Content-Type', 'application/json')
    .send(Buffer.from(JSON.stringify(event)));
}

describe('Integration: Stripe webhooks preserve access for billing-exempt users', () => {
  let app;

  beforeAll(() => {
    const { app: expressApp } = require('../../server');
    app = expressApp;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('customer.subscription.deleted does not disable access for an exempt user', async () => {
    const sub = mockSubscription();
    Subscription.findOne.mockReturnValue(sub);
    const user = createMockUser({ _id: 'agent-test-id', billingExempt: true, paymentAccessEnabled: true });
    User.findById.mockReturnValue(user);

    const res = await postWebhook(app, {
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_mock' } }
    });

    expect(res.status).toBe(200);
    expect(user.paymentAccessEnabled).toBe(true);
    expect(user.save).toHaveBeenCalled();
  });

  it('customer.subscription.deleted still disables access for a non-exempt user', async () => {
    const sub = mockSubscription();
    Subscription.findOne.mockReturnValue(sub);
    const user = createMockUser({ _id: 'agent-test-id', billingExempt: false, paymentAccessEnabled: true });
    User.findById.mockReturnValue(user);

    const res = await postWebhook(app, {
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_mock' } }
    });

    expect(res.status).toBe(200);
    expect(user.paymentAccessEnabled).toBe(false);
  });

  it('customer.subscription.updated (canceled) does not disable access for an exempt user', async () => {
    const sub = mockSubscription();
    Subscription.findOne.mockReturnValue(sub);
    const user = createMockUser({
      _id: 'agent-test-id', billingExempt: true, paymentAccessEnabled: true, oneTimePaymentCompleted: true
    });
    User.findById.mockReturnValue(user);

    const res = await postWebhook(app, {
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_mock',
          status: 'canceled',
          cancel_at_period_end: false,
          current_period_start: 1700000000,
          current_period_end: 1702592000
        }
      }
    });

    expect(res.status).toBe(200);
    expect(user.paymentAccessEnabled).toBe(true);
  });

  it('invoice.payment_failed does not disable access for an exempt user', async () => {
    const sub = mockSubscription();
    Subscription.findOne.mockReturnValue(sub);
    const user = createMockUser({ _id: 'agent-test-id', billingExempt: true, paymentAccessEnabled: true });
    User.findById.mockReturnValue(user);

    const res = await postWebhook(app, {
      type: 'invoice.payment_failed',
      data: { object: { subscription: 'sub_mock' } }
    });

    expect(res.status).toBe(200);
    expect(user.paymentAccessEnabled).toBe(true);
  });

  it('invoice.payment_failed still disables access for a non-exempt user', async () => {
    const sub = mockSubscription();
    Subscription.findOne.mockReturnValue(sub);
    const user = createMockUser({ _id: 'agent-test-id', billingExempt: false, paymentAccessEnabled: true });
    User.findById.mockReturnValue(user);

    const res = await postWebhook(app, {
      type: 'invoice.payment_failed',
      data: { object: { subscription: 'sub_mock' } }
    });

    expect(res.status).toBe(200);
    expect(user.paymentAccessEnabled).toBe(false);
  });
});
