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

  describe('Free Access safety net (Stripe still billing an exempt user)', () => {
    const Payment = require('../../models/Payment');

    beforeEach(() => {
      Subscription.findOne.mockReturnValue(mockSubscription());
    });

    it('invoice.created discards the draft invoice and cancels the subscription', async () => {
      User.findById.mockReturnValue(createMockUser({ _id: 'agent-test-id', billingExempt: true }));

      const res = await postWebhook(app, {
        type: 'invoice.created',
        data: { object: { id: 'in_1', subscription: 'sub_mock', customer: 'cus_mock', status: 'draft', amount_due: 2000 } }
      });

      expect(res.status).toBe(200);
      expect(stripe.discardInvoice).toHaveBeenCalledWith('in_1', 'draft');
      expect(stripe.cancelSubscription).toHaveBeenCalledWith('sub_mock');
    });

    it('invoice.created leaves a non-exempt user alone', async () => {
      User.findById.mockReturnValue(createMockUser({ _id: 'agent-test-id', billingExempt: false }));

      await postWebhook(app, {
        type: 'invoice.created',
        data: { object: { id: 'in_1', subscription: 'sub_mock', customer: 'cus_mock', status: 'draft', amount_due: 2000 } }
      });

      expect(stripe.discardInvoice).not.toHaveBeenCalled();
      expect(stripe.cancelSubscription).not.toHaveBeenCalled();
    });

    it('invoice.paid refunds an exempt user, cancels the subscription and records no payment', async () => {
      User.findById.mockReturnValue(createMockUser({ _id: 'agent-test-id', billingExempt: true }));

      const res = await postWebhook(app, {
        type: 'invoice.paid',
        data: { object: { id: 'in_2', subscription: 'sub_mock', customer: 'cus_mock', amount_paid: 2000, payment_intent: 'pi_1' } }
      });

      expect(res.status).toBe(200);
      expect(stripe.refundInvoicePayment).toHaveBeenCalledWith({ invoiceId: 'in_2', paymentIntentId: 'pi_1', chargeId: undefined });
      expect(stripe.cancelSubscription).toHaveBeenCalledWith('sub_mock');
      expect(Payment.findOneAndUpdate).not.toHaveBeenCalled();
    });

    // The live account is pinned to API 2025-11-17.clover: invoices carry the
    // subscription under parent.subscription_details and have no payment_intent.
    const cloverInvoice = (extra = {}) => ({
      id: 'in_clover',
      customer: 'cus_mock',
      parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_mock' } },
      ...extra
    });

    it('clover-shaped invoice.created is blocked for an exempt user', async () => {
      User.findById.mockReturnValue(createMockUser({ _id: 'agent-test-id', billingExempt: true }));

      await postWebhook(app, {
        type: 'invoice.created',
        data: { object: cloverInvoice({ status: 'draft', amount_due: 2000 }) }
      });

      expect(stripe.discardInvoice).toHaveBeenCalledWith('in_clover', 'draft');
      expect(stripe.cancelSubscription).toHaveBeenCalledWith('sub_mock');
    });

    it('clover-shaped invoice.paid refunds by invoice id for an exempt user', async () => {
      User.findById.mockReturnValue(createMockUser({ _id: 'agent-test-id', billingExempt: true }));

      await postWebhook(app, {
        type: 'invoice.paid',
        data: { object: cloverInvoice({ amount_paid: 2000 }) }
      });

      expect(stripe.refundInvoicePayment).toHaveBeenCalledWith(expect.objectContaining({ invoiceId: 'in_clover' }));
      expect(stripe.cancelSubscription).toHaveBeenCalledWith('sub_mock');
      expect(Payment.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('clover-shaped invoice.paid still records a normal payment for a non-exempt user', async () => {
      User.findById.mockReturnValue(createMockUser({ _id: 'agent-test-id', billingExempt: false }));

      await postWebhook(app, {
        type: 'invoice.paid',
        data: { object: cloverInvoice({ amount_paid: 2000, currency: 'usd', hosted_invoice_url: 'https://x' }) }
      });

      expect(stripe.refundInvoicePayment).not.toHaveBeenCalled();
      expect(Payment.findOneAndUpdate).toHaveBeenCalled();
    });

    it('a failed refund is swallowed (logged) but the subscription is still canceled', async () => {
      User.findById.mockReturnValue(createMockUser({ _id: 'agent-test-id', billingExempt: true }));
      stripe.refundInvoicePayment.mockRejectedValueOnce(new Error('already refunded'));

      const res = await postWebhook(app, {
        type: 'invoice.paid',
        data: { object: cloverInvoice({ amount_paid: 2000 }) }
      });

      expect(res.status).toBe(200);
      expect(stripe.cancelSubscription).toHaveBeenCalledWith('sub_mock');
    });

    it('a failed discard does not stop the subscription from being canceled', async () => {
      User.findById.mockReturnValue(createMockUser({ _id: 'agent-test-id', billingExempt: true }));
      stripe.discardInvoice.mockRejectedValueOnce(new Error('nope'));

      const res = await postWebhook(app, {
        type: 'invoice.created',
        data: { object: cloverInvoice({ status: 'draft', amount_due: 2000 }) }
      });

      expect(res.status).toBe(200);
      expect(stripe.cancelSubscription).toHaveBeenCalledWith('sub_mock');
    });

    it('invoice.paid does not refund a non-exempt user', async () => {
      User.findById.mockReturnValue(createMockUser({ _id: 'agent-test-id', billingExempt: false }));

      await postWebhook(app, {
        type: 'invoice.paid',
        data: { object: { id: 'in_2', subscription: 'sub_mock', customer: 'cus_mock', amount_paid: 2000, payment_intent: 'pi_1' } }
      });

      expect(stripe.refundInvoicePayment).not.toHaveBeenCalled();
    });
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
