/**
 * Integration test setup - loaded via setupFiles before all integration tests.
 * Mocks Joi (VM sandbox issue), mongoose, all models, and utility modules.
 * Test files should NOT call jest.mock for these modules - they get the mocks
 * via require() and configure behavior in beforeEach.
 */

// Mock Joi to avoid VM sandbox issues with @hapi/hoek Map.prototype.set
jest.mock('joi', () => {
  const handler = {
    get(target, prop) {
      if (prop === 'validate') return () => ({ error: null });
      if (prop === 'then' || prop === 'catch') return undefined;
      if (typeof prop === 'symbol') return undefined;
      return (...args) => new Proxy({}, handler);
    }
  };
  return new Proxy({}, handler);
});

// Mock mongoose - prevent real DB connections
jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return {
    ...actual,
    connect: jest.fn().mockResolvedValue({}),
    connection: { readyState: 1 },
    Types: actual.Types
  };
});

// Mock all 30 models with factory mocks to avoid Mongoose schema compilation errors
jest.mock('../../models/ACAClientRecord', () => require('../helpers/mock-model')('ACAClientRecord'));
jest.mock('../../models/AcaTierConfig', () => require('../helpers/mock-model')('AcaTierConfig'));
jest.mock('../../models/AgentCarrierStatus', () => require('../helpers/mock-model')('AgentCarrierStatus'));
jest.mock('../../models/APAApplication', () => require('../helpers/mock-model')('APAApplication'));
jest.mock('../../models/AuditLog', () => require('../helpers/mock-model')('AuditLog'));
jest.mock('../../models/Broadcast', () => require('../helpers/mock-model')('Broadcast'));
jest.mock('../../models/Carrier', () => require('../helpers/mock-model')('Carrier'));
jest.mock('../../models/CommissionStatement', () => require('../helpers/mock-model')('CommissionStatement'));
jest.mock('../../models/Coupon', () => require('../helpers/mock-model')('Coupon'));
jest.mock('../../models/DocumentFolder', () => require('../helpers/mock-model')('DocumentFolder'));
jest.mock('../../models/DocumentHubFile', () => require('../helpers/mock-model')('DocumentHubFile'));
jest.mock('../../models/DocumentRequest', () => require('../helpers/mock-model')('DocumentRequest'));
jest.mock('../../models/ExamFXProgress', () => require('../helpers/mock-model')('ExamFXProgress'));
jest.mock('../../models/LicensingProgress', () => require('../helpers/mock-model')('LicensingProgress'));
jest.mock('../../models/Notification', () => require('../helpers/mock-model')('Notification'));
jest.mock('../../models/NotificationPreference', () => require('../helpers/mock-model')('NotificationPreference'));
jest.mock('../../models/Onboarding', () => require('../helpers/mock-model')('Onboarding'));
jest.mock('../../models/OnboardingDocType', () => require('../helpers/mock-model')('OnboardingDocType'));
jest.mock('../../models/OnboardingDocument', () => require('../helpers/mock-model')('OnboardingDocument'));
jest.mock('../../models/Payment', () => require('../helpers/mock-model')('Payment'));
jest.mock('../../models/PrintfulOrder', () => require('../helpers/mock-model')('PrintfulOrder'));
jest.mock('../../models/ProductionSubmission', () => require('../helpers/mock-model')('ProductionSubmission'));
jest.mock('../../models/ProductType', () => require('../helpers/mock-model')('ProductType'));
jest.mock('../../models/PromotionLevel', () => require('../helpers/mock-model')('PromotionLevel'));
jest.mock('../../models/Subscription', () => require('../helpers/mock-model')('Subscription'));
jest.mock('../../models/SystemConfig', () => require('../helpers/mock-model')('SystemConfig'));
jest.mock('../../models/TrainingCategory', () => require('../helpers/mock-model')('TrainingCategory'));
jest.mock('../../models/TrainingFolder', () => require('../helpers/mock-model')('TrainingFolder'));
jest.mock('../../models/TrainingMaterial', () => require('../helpers/mock-model')('TrainingMaterial'));
jest.mock('../../models/User', () => require('../helpers/mock-model')('User'));

// Mock utility modules
jest.mock('../../utils/neuzmail', () => ({
  sendTransactionalEmail: jest.fn().mockResolvedValue({ success: true }),
  sendApplicationConfirmationEmail: jest.fn().mockResolvedValue({ success: true }),
  sendEmail: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock('../../utils/docusign', () => ({
  createAndSendEnvelope: jest.fn().mockResolvedValue({ envelopeId: 'mock-envelope-id' }),
  getEnvelopeStatus: jest.fn().mockResolvedValue({ status: 'completed' }),
  downloadDocument: jest.fn().mockResolvedValue(Buffer.from('mock-pdf')),
}));
jest.mock('../../utils/quickbooks', () => ({
  getAuthUrl: jest.fn().mockReturnValue('https://mock-qb-auth'),
  handleCallback: jest.fn().mockResolvedValue({ success: true }),
  getConnectionStatus: jest.fn().mockResolvedValue({ connected: false }),
  createInvoice: jest.fn().mockResolvedValue({ id: 'mock-invoice' }),
}));
jest.mock('../../utils/stripe', () => ({
  createPaymentIntent: jest.fn().mockResolvedValue({ client_secret: 'mock_secret' }),
  createCustomer: jest.fn().mockResolvedValue({ id: 'cus_mock' }),
  createSubscription: jest.fn().mockResolvedValue({
    id: 'sub_mock',
    status: 'active',
    current_period_start: 1700000000,
    current_period_end: 1702592000,
    latest_invoice: { payment_intent: { client_secret: 'mock_secret' } }
  }),
  cancelSubscription: jest.fn().mockResolvedValue({ id: 'sub_mock', status: 'canceled' }),
  cancelSubscriptionAtPeriodEnd: jest.fn().mockResolvedValue({
    id: 'sub_mock',
    status: 'active',
    cancel_at_period_end: true,
    current_period_end: 1702592000
  }),
  reactivateSubscription: jest.fn().mockResolvedValue({
    id: 'sub_mock',
    status: 'active',
    cancel_at_period_end: false
  }),
  retrieveSubscription: jest.fn().mockResolvedValue({ id: 'sub_mock', status: 'active' }),
  constructWebhookEvent: jest.fn(),
  constructEvent: jest.fn(),
}));
