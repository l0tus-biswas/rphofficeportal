/**
 * Integration Tests: APA signature/payment bypass guards
 * The public "mock" completion endpoints must never let an applicant skip e-signature
 * or payment, and the e-sign webhook must reject unsigned/forged calls in production.
 */
const crypto = require('crypto');
const request = require('supertest');

const APAApplication = require('../../models/APAApplication');
const User = require('../../models/User');

describe('Integration: APA bypass guards', () => {
  let app;
  const realEnv = process.env.NODE_ENV;
  const secret = 'webhook-test-secret';

  const application = (overrides = {}) => ({
    _id: 'app-1',
    status: 'pending_signature',
    docusign: { envelopeId: 'REAL-REQUEST-ID', status: 'sent' },
    payment: {},
    personalInfo: { email: 'new@example.com', legalFirstName: 'A', legalLastName: 'B', mobilePhone: '5550001111' },
    recruitingInfo: {},
    save: jest.fn().mockResolvedValue(true),
    ...overrides
  });

  beforeAll(() => {
    app = require('../../server').app;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ZOHO_SIGN_WEBHOOK_SECRET = secret;
  });

  afterEach(() => {
    process.env.NODE_ENV = realEnv;
  });

  describe('POST /api/public/apa-application/:id/complete-signature', () => {
    it('refuses to mark a REAL e-sign request as signed (no provider confirmation)', async () => {
      const doc = application();
      APAApplication.findById.mockResolvedValue(doc);

      const res = await request(app).post('/api/public/apa-application/app-1/complete-signature');

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(doc.status).toBe('pending_signature');
      expect(doc.save).not.toHaveBeenCalled();
    });

    it('refuses even a mock envelope in production', async () => {
      process.env.NODE_ENV = 'production';
      const doc = application({ docusign: { envelopeId: 'MOCK_123', status: 'sent' } });
      APAApplication.findById.mockResolvedValue(doc);

      const res = await request(app).post('/api/public/apa-application/app-1/complete-signature');

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(doc.save).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/public/apa-application/:id/complete-payment', () => {
    it('is unavailable in production (no unauthenticated account creation without payment)', async () => {
      process.env.NODE_ENV = 'production';
      const doc = application({ status: 'pending_payment' });
      APAApplication.findById.mockResolvedValue(doc);
      User.findOne.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/public/apa-application/app-1/complete-payment')
        .send({ mockPayment: { paymentIntentId: 'pi_fake' } });

      expect(res.status).toBe(404);
      expect(doc.save).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/public/apa-application/docusign-webhook', () => {
    // The shared integration setup mocks validateWebhookSignature to always return true,
    // which hides forged calls. Use the real implementation here.
    beforeEach(() => {
      const real = jest.requireActual('../../utils/zohosign').validateWebhookSignature;
      require('../../utils/zohosign').validateWebhookSignature.mockImplementation(real);
    });

    afterEach(() => {
      require('../../utils/zohosign').validateWebhookSignature.mockReturnValue(true);
    });

    const body = JSON.stringify({ requests: { request_id: 'REAL-REQUEST-ID', request_status: 'completed' }, notifications: { operation_type: 'RequestCompleted' } });
    const post = (headers = {}) =>
      request(app)
        .post('/api/public/apa-application/docusign-webhook')
        .set('Content-Type', 'application/json')
        .set(headers)
        .send(body);

    it('rejects an unsigned webhook in production and changes nothing', async () => {
      process.env.NODE_ENV = 'production';
      const doc = application();
      APAApplication.findOne.mockResolvedValue(doc);

      const res = await post();

      expect(res.status).toBe(401);
      expect(doc.save).not.toHaveBeenCalled();
    });

    it('rejects a webhook with a wrong signature in production', async () => {
      process.env.NODE_ENV = 'production';
      const doc = application();
      APAApplication.findOne.mockResolvedValue(doc);

      const res = await post({ 'x-zs-webhook-signature': 'not-the-right-signature' });

      expect(res.status).toBe(401);
      expect(doc.save).not.toHaveBeenCalled();
    });

    it('accepts a correctly signed webhook in production', async () => {
      process.env.NODE_ENV = 'production';
      const doc = application();
      APAApplication.findOne.mockResolvedValue(doc);
      const signature = crypto.createHmac('sha256', secret).update(body).digest('base64');

      const res = await post({ 'x-zs-webhook-signature': signature });

      expect(res.status).toBe(200);
      expect(APAApplication.findOne).toHaveBeenCalled();
    });
  });
});
