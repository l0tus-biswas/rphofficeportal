/**
 * Unit tests for services/apaRegistration.js — turning a paid Stripe Checkout
 * session into an agent account. Focus: the guarantees that fix the
 * registration bugs (atomic claim, validate-before-write, nothing marked
 * "completed" for an application that got no account).
 */
jest.mock('../../models/APAApplication');
jest.mock('../../models/User');
jest.mock('../../models/Notification');
jest.mock('../../models/Onboarding');
jest.mock('../../models/SystemConfig');
jest.mock('../../models/Coupon');
jest.mock('../../models/Payment');
jest.mock('../../models/Subscription');
jest.mock('../../models/OnboardingDocument');
jest.mock('../../models/OnboardingDocType');
jest.mock('../../utils/neuzmail');
jest.mock('../../utils/stripe', () => ({
  stripe: { subscriptions: { retrieve: jest.fn() } },
  resolveStripeReceiptUrl: jest.fn().mockResolvedValue('https://receipt'),
  getSubscriptionPeriod: jest.fn().mockReturnValue({ start: null, end: null })
}));

const APAApplication = require('../../models/APAApplication');
const User = require('../../models/User');
const Payment = require('../../models/Payment');
const { completeApaRegistration, RegistrationError } = require('../../services/apaRegistration');

const paidSession = (overrides = {}) => ({
  id: 'cs_1',
  payment_status: 'paid',
  client_reference_id: 'app-1',
  amount_total: 2000,
  customer: 'cus_1',
  subscription: 'sub_1',
  invoice: 'in_1',
  ...overrides
});

const pendingApplication = (overrides = {}) => ({
  _id: 'app-1',
  status: 'pending_payment',
  personalInfo: { email: 'new@agent.com', legalFirstName: 'New', legalLastName: 'Agent', mobilePhone: '5551234567' },
  recruitingInfo: {},
  payment: {},
  save: jest.fn().mockResolvedValue(true),
  ...overrides
});

describe('completeApaRegistration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    APAApplication.updateOne = jest.fn().mockResolvedValue({});
  });

  it('rejects a session that is not paid', async () => {
    await expect(completeApaRegistration(paidSession({ payment_status: 'unpaid' })))
      .rejects.toMatchObject({ statusCode: 400, message: 'Payment not completed' });
    expect(APAApplication.findById).not.toHaveBeenCalled();
  });

  it('rejects a session without an application id', async () => {
    await expect(completeApaRegistration(paidSession({ client_reference_id: undefined })))
      .rejects.toBeInstanceOf(RegistrationError);
  });

  it('returns already-processed (and creates nothing) when the application is already completed', async () => {
    APAApplication.findById.mockResolvedValue(pendingApplication({ status: 'completed' }));
    User.findOne.mockResolvedValue({ email: 'new@agent.com' });

    const result = await completeApaRegistration(paidSession());

    expect(result).toEqual({ alreadyProcessed: true, email: 'new@agent.com' });
    expect(APAApplication.findOneAndUpdate).not.toHaveBeenCalled();
    expect(Payment.prototype.save).not.toHaveBeenCalled();
  });

  it('does nothing when another caller holds the claim and wait is off', async () => {
    APAApplication.findById.mockResolvedValue(pendingApplication());
    APAApplication.findOneAndUpdate.mockResolvedValue(null); // claim lost

    const result = await completeApaRegistration(paidSession());

    expect(result).toEqual({ inProgress: true });
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it('missing phone: throws 400, releases the claim, and never marks the application completed', async () => {
    const application = pendingApplication({
      personalInfo: { email: 'new@agent.com', legalFirstName: 'New', legalLastName: 'Agent' }
    });
    APAApplication.findById.mockResolvedValue(application);
    APAApplication.findOneAndUpdate.mockResolvedValue(application); // claim won

    await expect(completeApaRegistration(paidSession()))
      .rejects.toMatchObject({ statusCode: 400, message: 'Application is missing a contact phone number' });

    expect(application.status).toBe('pending_payment');
    expect(application.save).not.toHaveBeenCalled();
    expect(User.findOne).not.toHaveBeenCalled();
    // claim released so a retry (after the data is fixed) can proceed
    expect(APAApplication.updateOne).toHaveBeenCalledWith(
      { _id: 'app-1', status: 'pending_payment' },
      { $unset: { 'payment.registrationClaimedAt': '' } }
    );
  });

  it('refuses when the email already belongs to a different account, and releases the claim', async () => {
    const application = pendingApplication();
    APAApplication.findById.mockResolvedValue(application);
    APAApplication.findOneAndUpdate.mockResolvedValue(application);
    User.findOne.mockResolvedValue({ email: 'new@agent.com', metadata: { applicationId: 'someone-elses-app' } });

    await expect(completeApaRegistration(paidSession()))
      .rejects.toMatchObject({ statusCode: 409 });

    expect(application.status).toBe('pending_payment');
    expect(APAApplication.updateOne).toHaveBeenCalled();
  });

  it('claims atomically only from pending_payment', async () => {
    APAApplication.findById.mockResolvedValue(pendingApplication());
    APAApplication.findOneAndUpdate.mockResolvedValue(null);

    await completeApaRegistration(paidSession());

    const [filter, update] = APAApplication.findOneAndUpdate.mock.calls[0];
    expect(filter).toMatchObject({ _id: 'app-1', status: 'pending_payment' });
    expect(update.$set).toHaveProperty(['payment.registrationClaimedAt']);
  });
});
