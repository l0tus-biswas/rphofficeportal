/**
 * Unit tests for jobs/resumeBilling.job.js — the scheduled job that
 * actually resumes billing (charges the saved card) once the grace period
 * set by the admin billing-exempt route has elapsed.
 */
jest.mock('../../models/User');
jest.mock('../../models/Subscription');
jest.mock('../../models/Notification');
jest.mock('../../utils/stripe');

const User = require('../../models/User');
const Subscription = require('../../models/Subscription');
const Notification = require('../../models/Notification');
const { resumeSubscriptionForCustomer, getSubscriptionPeriod } = require('../../utils/stripe');
const { processDueBillingResumes } = require('../../jobs/resumeBilling.job');
const { RESUME_MAX_ATTEMPTS } = require('../../config/billingResume.constants');

// utils/stripe is auto-mocked (jest.mock with no factory above), so
// getSubscriptionPeriod becomes a jest.fn() returning undefined by default.
// Give it the real (pure) implementation so the job's period-resolution
// logic is actually exercised.
getSubscriptionPeriod.mockImplementation((subscription) => {
  if (subscription?.current_period_start && subscription?.current_period_end) {
    return { start: subscription.current_period_start, end: subscription.current_period_end };
  }
  const item = subscription?.items?.data?.[0];
  return { start: item?.current_period_start || null, end: item?.current_period_end || null };
});

function mockAgent(overrides = {}) {
  return {
    _id: 'agent-1',
    name: 'Test Agent',
    email: 'agent@test.com',
    role: 'agent',
    stripeCustomerId: 'cus_mock',
    pendingBillingResumeAt: new Date(Date.now() - 1000),
    billingResumeAttempts: 0,
    billingExempt: false,
    paymentAccessEnabled: true,
    save: jest.fn().mockResolvedValue(true),
    ...overrides
  };
}

describe('resumeBilling.job', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_MONTHLY_PRICE_ID = 'price_mock';
    User.find.mockReturnValue({ });
    Notification.createNotification = jest.fn().mockResolvedValue({});
    Subscription.findOneAndUpdate = jest.fn().mockResolvedValue({});
  });

  it('resumes billing for a due user: creates a subscription, updates the user, notifies them', async () => {
    const agent = mockAgent();
    User.find.mockImplementation((query) => {
      if (query.role === 'admin') return { select: () => ({ lean: () => Promise.resolve([]) }) };
      return Promise.resolve([agent]);
    });
    resumeSubscriptionForCustomer.mockResolvedValue({
      id: 'sub_new', status: 'active', current_period_start: 1700000000, current_period_end: 1702592000
    });

    await processDueBillingResumes();

    expect(resumeSubscriptionForCustomer).toHaveBeenCalledWith('cus_mock', 'price_mock', expect.objectContaining({ userId: 'agent-1' }));
    expect(Subscription.findOneAndUpdate).toHaveBeenCalledWith(
      { user: 'agent-1' },
      expect.objectContaining({ $set: expect.objectContaining({ stripeSubscriptionId: 'sub_new', user: 'agent-1' }) }),
      expect.objectContaining({ upsert: true })
    );
    expect(agent.stripeSubscriptionId).toBe('sub_new');
    expect(agent.paymentAccessEnabled).toBe(true);
    expect(agent.pendingBillingResumeAt).toBeNull();
    expect(agent.save).toHaveBeenCalled();
    expect(Notification.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'agent-1', type: 'subscription_resumed' }), true
    );
  });

  it('on the first failed attempt: drops access, schedules a retry, and notifies only the agent', async () => {
    const agent = mockAgent(); // billingResumeAttempts: 0
    const admin = { _id: 'admin-1' };
    User.find.mockImplementation((query) => {
      if (query.role === 'admin') return { select: () => ({ lean: () => Promise.resolve([admin]) }) };
      return Promise.resolve([agent]);
    });
    resumeSubscriptionForCustomer.mockRejectedValue(new Error('Your card was declined'));

    await processDueBillingResumes();

    expect(agent.billingResumeAttempts).toBe(1);
    expect(agent.paymentAccessEnabled).toBe(false);
    expect(agent.pendingBillingResumeAt).toBeInstanceOf(Date);
    expect(agent.pendingBillingResumeAt.getTime()).toBeGreaterThan(Date.now());
    expect(agent.save).toHaveBeenCalled();
    expect(Notification.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'agent-1', type: 'payment_failed', title: 'Payment Failed — Retrying' }), true
    );
    expect(Notification.createNotification).not.toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'admin-1' }), expect.anything()
    );
  });

  it('after the final attempt fails: stops retrying and notifies agent + admins', async () => {
    const agent = mockAgent({ billingResumeAttempts: RESUME_MAX_ATTEMPTS - 1 });
    const admin = { _id: 'admin-1' };
    User.find.mockImplementation((query) => {
      if (query.role === 'admin') return { select: () => ({ lean: () => Promise.resolve([admin]) }) };
      return Promise.resolve([agent]);
    });
    resumeSubscriptionForCustomer.mockRejectedValue(new Error('Your card was declined'));

    await processDueBillingResumes();

    expect(agent.billingResumeAttempts).toBe(RESUME_MAX_ATTEMPTS);
    expect(agent.paymentAccessEnabled).toBe(false);
    expect(agent.pendingBillingResumeAt).toBeNull();
    expect(agent.save).toHaveBeenCalled();
    expect(Notification.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'agent-1', type: 'payment_failed', title: 'Could Not Resume Billing' }), true
    );
    expect(Notification.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'admin-1', type: 'agent_billing_resume_failed' }), true
    );
  });

  it('skips and clears the flag when the user has no Stripe customer id', async () => {
    const agent = mockAgent({ stripeCustomerId: undefined });
    User.find.mockImplementation((query) => {
      if (query.role === 'admin') return { select: () => ({ lean: () => Promise.resolve([]) }) };
      return Promise.resolve([agent]);
    });

    await processDueBillingResumes();

    expect(resumeSubscriptionForCustomer).not.toHaveBeenCalled();
    expect(agent.pendingBillingResumeAt).toBeNull();
    expect(agent.save).toHaveBeenCalled();
  });
});
