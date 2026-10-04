/**
 * Unit Tests: utils/stripe.js helpers that keep Free Access users from being billed.
 *  - getInvoiceSubscriptionId: must work on old AND new (2025-11-17.clover) invoice shapes
 *  - refundInvoicePayment / discardInvoice / listActiveCustomerSubscriptions
 */
describe('Utils: stripe.js Free Access helpers', () => {
  let stripeUtils;
  let mockStripe;

  beforeEach(() => {
    jest.resetModules();
    mockStripe = {
      refunds: { create: jest.fn().mockResolvedValue({ id: 're_1' }) },
      invoicePayments: { list: jest.fn() },
      invoices: {
        del: jest.fn().mockResolvedValue({ id: 'in_1', deleted: true }),
        voidInvoice: jest.fn().mockResolvedValue({ id: 'in_1', status: 'void' })
      },
      subscriptions: { list: jest.fn() }
    };
    jest.doMock('stripe', () => jest.fn(() => mockStripe));
    process.env.STRIPE_SECRET_KEY = 'sk_test_valid_key';
    stripeUtils = require('../../utils/stripe');
  });

  describe('getInvoiceSubscriptionId', () => {
    it('reads the legacy top-level invoice.subscription', () => {
      expect(stripeUtils.getInvoiceSubscriptionId({ subscription: 'sub_old' })).toBe('sub_old');
    });

    it('reads invoice.parent.subscription_details.subscription (clover API)', () => {
      const invoice = { parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_new' } } };
      expect(stripeUtils.getInvoiceSubscriptionId(invoice)).toBe('sub_new');
    });

    it('handles an expanded subscription object', () => {
      expect(stripeUtils.getInvoiceSubscriptionId({ subscription: { id: 'sub_obj' } })).toBe('sub_obj');
    });

    it('returns null for one-off invoices and missing input', () => {
      expect(stripeUtils.getInvoiceSubscriptionId({ parent: null })).toBeNull();
      expect(stripeUtils.getInvoiceSubscriptionId({})).toBeNull();
      expect(stripeUtils.getInvoiceSubscriptionId(undefined)).toBeNull();
    });
  });

  describe('refundInvoicePayment', () => {
    it('refunds an explicit payment intent without extra lookups', async () => {
      await stripeUtils.refundInvoicePayment({ invoiceId: 'in_1', paymentIntentId: 'pi_1' });
      expect(mockStripe.refunds.create).toHaveBeenCalledWith({ payment_intent: 'pi_1' });
      expect(mockStripe.invoicePayments.list).not.toHaveBeenCalled();
    });

    it('refunds an explicit charge', async () => {
      await stripeUtils.refundInvoicePayment({ chargeId: 'ch_1' });
      expect(mockStripe.refunds.create).toHaveBeenCalledWith({ charge: 'ch_1' });
    });

    it('resolves the payment intent from the invoice payments (clover API)', async () => {
      mockStripe.invoicePayments.list.mockResolvedValue({
        data: [
          { status: 'open', payment: { payment_intent: 'pi_unpaid' } },
          { status: 'paid', payment: { payment_intent: 'pi_paid' } }
        ]
      });
      await stripeUtils.refundInvoicePayment({ invoiceId: 'in_1' });
      expect(mockStripe.invoicePayments.list).toHaveBeenCalledWith({ invoice: 'in_1', limit: 10 });
      expect(mockStripe.refunds.create).toHaveBeenCalledWith({ payment_intent: 'pi_paid' });
    });

    it('throws (so the caller can log a manual-refund alert) when nothing can be resolved', async () => {
      mockStripe.invoicePayments.list.mockResolvedValue({ data: [] });
      await expect(stripeUtils.refundInvoicePayment({ invoiceId: 'in_1' })).rejects.toThrow(/could not resolve/);
      expect(mockStripe.refunds.create).not.toHaveBeenCalled();
    });
  });

  describe('discardInvoice', () => {
    it('deletes a draft invoice', async () => {
      await stripeUtils.discardInvoice('in_1', 'draft');
      expect(mockStripe.invoices.del).toHaveBeenCalledWith('in_1');
    });

    it('voids an open invoice', async () => {
      await stripeUtils.discardInvoice('in_1', 'open');
      expect(mockStripe.invoices.voidInvoice).toHaveBeenCalledWith('in_1');
    });

    it('leaves paid/void invoices alone', async () => {
      expect(await stripeUtils.discardInvoice('in_1', 'paid')).toBeNull();
      expect(mockStripe.invoices.del).not.toHaveBeenCalled();
      expect(mockStripe.invoices.voidInvoice).not.toHaveBeenCalled();
    });
  });

  describe('listActiveCustomerSubscriptions', () => {
    it('excludes canceled subscriptions', async () => {
      mockStripe.subscriptions.list.mockResolvedValue({
        data: [
          { id: 'sub_a', status: 'active' },
          { id: 'sub_b', status: 'canceled' },
          { id: 'sub_c', status: 'past_due' },
          { id: 'sub_d', status: 'incomplete_expired' }
        ]
      });
      const subs = await stripeUtils.listActiveCustomerSubscriptions('cus_1');
      expect(subs.map((s) => s.id)).toEqual(['sub_a', 'sub_c']);
    });

    it('returns [] without calling Stripe when there is no customer id', async () => {
      expect(await stripeUtils.listActiveCustomerSubscriptions(undefined)).toEqual([]);
      expect(mockStripe.subscriptions.list).not.toHaveBeenCalled();
    });

    it('returns [] instead of throwing when Stripe errors', async () => {
      mockStripe.subscriptions.list.mockRejectedValue(new Error('boom'));
      expect(await stripeUtils.listActiveCustomerSubscriptions('cus_1')).toEqual([]);
    });
  });
});
