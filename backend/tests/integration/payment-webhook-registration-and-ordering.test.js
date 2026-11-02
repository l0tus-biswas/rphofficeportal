/**
 * Integration Tests: Stripe webhook
 *  - checkout.session.completed creates the agent account even if the
 *    applicant never returns to the success page
 *  - out-of-order customer.subscription.* events can't overwrite newer state
 *
 * Covers POST /api/payments/webhook
 * Models and utils/stripe are mocked globally via setup-integration.js.
 */
jest.mock('../../services/apaRegistration', () => ({
  completeApaRegistration: jest.fn().mockResolvedValue({ created: true }),
  RegistrationError: class RegistrationError extends Error {}
}));

const request = require('supertest');

const User = require('../../models/User');
const Subscription = require('../../models/Subscription');
const stripe = require('../../utils/stripe');
const { completeApaRegistration } = require('../../services/apaRegistration');
const { createMockUser } = require('../helpers/test-utils');

function postWebhook(app, event) {
  stripe.constructWebhookEvent.mockReturnValue(event);
  return request(app)
    .post('/api/payments/webhook')
    .set('stripe-signature', 'test-sig')
    .set('Content-Type', 'application/json')
    .send(Buffer.from(JSON.stringify(event)));
}

function mockSubscription(overrides = {}) {
  return {
    user: 'agent-test-id',
    stripeSubscriptionId: 'sub_mock',
    status: 'active',
    cancelAtPeriodEnd: false,
    lastStripeEventAt: undefined,
    save: jest.fn().mockResolvedValue(true),
    ...overrides
  };
}

describe('Integration: webhook registration + event ordering', () => {
  let app;

  beforeAll(() => {
    app = require('../../server').app;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    completeApaRegistration.mockResolvedValue({ created: true });
  });

  describe('checkout.session.completed', () => {
    it('completes the registration for a paid subscription checkout', async () => {
      const session = { id: 'cs_1', mode: 'subscription', payment_status: 'paid', client_reference_id: 'app-1' };

      const res = await postWebhook(app, { type: 'checkout.session.completed', created: 1700000000, data: { object: session } });

      expect(res.status).toBe(200);
      expect(completeApaRegistration).toHaveBeenCalledWith(session);
    });

    it('also completes a 100%-discounted checkout (no_payment_required)', async () => {
      const session = { id: 'cs_2', mode: 'subscription', payment_status: 'no_payment_required', client_reference_id: 'app-2' };

      await postWebhook(app, { type: 'checkout.session.completed', created: 1700000000, data: { object: session } });

      expect(completeApaRegistration).toHaveBeenCalledWith(session);
    });

    it('ignores unpaid sessions, non-subscription sessions, and sessions without an application id', async () => {
      for (const session of [
        { id: 'a', mode: 'subscription', payment_status: 'unpaid', client_reference_id: 'app-1' },
        { id: 'b', mode: 'payment', payment_status: 'paid', client_reference_id: 'app-1' },
        { id: 'c', mode: 'subscription', payment_status: 'paid' }
      ]) {
        const res = await postWebhook(app, { type: 'checkout.session.completed', created: 1700000000, data: { object: session } });
        expect(res.status).toBe(200);
      }
      expect(completeApaRegistration).not.toHaveBeenCalled();
    });

    it('returns 400 so Stripe retries when registration fails', async () => {
      completeApaRegistration.mockRejectedValue(new Error('db down'));

      const res = await postWebhook(app, {
        type: 'checkout.session.completed', created: 1700000000,
        data: { object: { id: 'cs_3', mode: 'subscription', payment_status: 'paid', client_reference_id: 'app-3' } }
      });

      expect(res.status).toBe(400);
    });
  });

  describe('out-of-order subscription events', () => {
    const NEWER = 1700000600;
    const OLDER = 1700000000;

    it('ignores an older customer.subscription.updated than the one already applied', async () => {
      const sub = mockSubscription({ status: 'past_due', lastStripeEventAt: new Date(NEWER * 1000) });
      Subscription.findOne.mockReturnValue(sub);
      const user = createMockUser({ _id: 'agent-test-id', paymentAccessEnabled: false, oneTimePaymentCompleted: true });
      User.findById.mockReturnValue(user);

      const res = await postWebhook(app, {
        type: 'customer.subscription.updated', created: OLDER,
        data: { object: { id: 'sub_mock', status: 'active', cancel_at_period_end: false } }
      });

      expect(res.status).toBe(200);
      expect(sub.status).toBe('past_due');
      expect(sub.save).not.toHaveBeenCalled();
      expect(user.paymentAccessEnabled).toBe(false);
    });

    it('applies a newer event and records its timestamp', async () => {
      const sub = mockSubscription({ status: 'past_due', lastStripeEventAt: new Date(OLDER * 1000) });
      Subscription.findOne.mockReturnValue(sub);
      const user = createMockUser({ _id: 'agent-test-id', paymentAccessEnabled: false, oneTimePaymentCompleted: true });
      User.findById.mockReturnValue(user);

      await postWebhook(app, {
        type: 'customer.subscription.updated', created: NEWER,
        data: { object: { id: 'sub_mock', status: 'active', cancel_at_period_end: false } }
      });

      expect(sub.status).toBe('active');
      expect(sub.lastStripeEventAt.getTime()).toBe(NEWER * 1000);
      expect(sub.save).toHaveBeenCalled();
      expect(user.paymentAccessEnabled).toBe(true);
    });

    it('a stale update cannot resurrect a subscription that was already deleted', async () => {
      const sub = mockSubscription({ status: 'canceled', lastStripeEventAt: new Date(NEWER * 1000) });
      Subscription.findOne.mockReturnValue(sub);
      User.findById.mockReturnValue(createMockUser({ _id: 'agent-test-id' }));

      await postWebhook(app, {
        type: 'customer.subscription.updated', created: OLDER,
        data: { object: { id: 'sub_mock', status: 'active', cancel_at_period_end: false } }
      });

      expect(sub.status).toBe('canceled');
    });
  });
});
