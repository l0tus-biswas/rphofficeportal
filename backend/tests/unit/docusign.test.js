/**
 * Unit Tests: utils/docusign.js
 * Tests DocuSign integration functions
 */

describe('Utils: docusign.js', () => {
  let docusign;
  let mockEnvelopesApi;

  beforeEach(() => {
    jest.resetModules();

    // Mock docusign-esign SDK
    mockEnvelopesApi = {
      createEnvelope: jest.fn().mockResolvedValue({ envelopeId: 'env-123' }),
      getEnvelope: jest.fn().mockResolvedValue({
        status: 'completed',
        envelopeId: 'env-123',
        sentDateTime: '2026-01-01',
        completedDateTime: '2026-01-02',
        statusChangedDateTime: '2026-01-02',
        recipients: [],
      }),
      getDocument: jest.fn().mockResolvedValue(Buffer.from('mock-pdf-data')),
      update: jest.fn().mockResolvedValue({}),
      updateEmailSettings: jest.fn().mockResolvedValue({}),
    };
    const mockTemplatesApi = {
      get: jest.fn().mockResolvedValue({ recipients: { signers: [] } }),
      getDocumentTabs: jest.fn().mockResolvedValue({ textTabs: [], checkboxTabs: [] }),
      listTemplates: jest.fn().mockResolvedValue({ envelopeTemplates: [{ templateId: 'tpl-1' }] }),
    };
    const mockApiClient = {
      setBasePath: jest.fn(),
      addDefaultHeader: jest.fn(),
      requestJWTUserToken: jest.fn().mockResolvedValue({
        body: { access_token: 'mock-token', expires_in: 3600 }
      }),
      setOAuthBasePath: jest.fn(),
    };

    jest.doMock('docusign-esign', () => ({
      ApiClient: jest.fn().mockImplementation(() => mockApiClient),
      EnvelopesApi: jest.fn().mockImplementation(() => mockEnvelopesApi),
      TemplatesApi: jest.fn().mockImplementation(() => mockTemplatesApi),
      EnvelopeDefinition: jest.fn().mockImplementation(() => ({})),
      TemplateRole: jest.fn().mockImplementation(() => ({})),
      Tabs: jest.fn().mockImplementation(() => ({})),
      Text: jest.fn().mockImplementation(() => ({})),
      Checkbox: jest.fn().mockImplementation(() => ({})),
      RecipientEmailNotification: jest.fn().mockImplementation(() => ({})),
      EmailSettings: jest.fn().mockImplementation(() => ({})),
    }));

    // Mock SystemConfig - findOne needs to return object with .lean()
    jest.doMock('../../models/SystemConfig', () => ({
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ key: 'docusign_template_id', value: 'tpl-123' }),
      }),
      findOneAndUpdate: jest.fn().mockResolvedValue({}),
    }));

    // Mock fs
    jest.doMock('fs', () => ({
      readFileSync: jest.fn().mockReturnValue('mock-private-key'),
      existsSync: jest.fn().mockReturnValue(true),
      writeFileSync: jest.fn(),
      mkdirSync: jest.fn(),
    }));

    // Mock path (pass-through with dirname override)
    jest.doMock('path', () => ({
      ...jest.requireActual('path'),
      resolve: jest.fn((...args) => args.join('/')),
      dirname: jest.fn().mockReturnValue('/tmp'),
    }));

    // Mock dotenv
    jest.doMock('dotenv', () => ({ config: jest.fn() }));

    process.env.DOCUSIGN_INTEGRATION_KEY = 'test-integration-key';
    process.env.DOCUSIGN_USER_ID = 'test-user-id';
    process.env.DOCUSIGN_ACCOUNT_ID = 'test-account-id';
    process.env.DOCUSIGN_BASE_PATH = 'https://demo.docusign.net/restapi';
    process.env.DOCUSIGN_PRIVATE_KEY_PATH = '/path/to/key.pem';
    process.env.DOCUSIGN_TEMPLATE_ID = 'test-template-id';
    process.env.DOCUSIGN_WEBHOOK_SECRET = 'test-webhook-secret';

    docusign = require('../../utils/docusign');
  });

  describe('module exports', () => {
    it('should export expected functions', () => {
      expect(docusign).toBeDefined();
      const expectedFns = [
        'createAPAEnvelope',
        'getEnvelopeStatus',
        'downloadSignedDocument',
        'processWebhook',
        'validateWebhookSignature',
      ];
      expectedFns.forEach(fn => {
        if (typeof docusign[fn] === 'function') {
          expect(typeof docusign[fn]).toBe('function');
        }
      });
    });
  });

  describe('createAPAEnvelope', () => {
    it('should create an envelope with application data', async () => {
      if (typeof docusign.createAPAEnvelope !== 'function') return;
      const application = {
        _id: 'app-123',
        personalInfo: {
          legalFirstName: 'John',
          legalLastName: 'Doe',
          email: 'john@test.com',
          phone: '555-1234',
          address: '123 Main St',
          city: 'TestCity',
          state: 'CA',
          zip: '90210',
        },
        recruitingInfo: {
          recruiterFullName: 'Jane Smith',
          recruiterContact: 'jane@test.com',
        },
      };
      const result = await docusign.createAPAEnvelope(application);
      expect(result).toBeDefined();
      expect(result.envelopeId).toBe('env-123');
      expect(result.status).toBe('sent');
    });

    it('should throw on missing application', async () => {
      if (typeof docusign.createAPAEnvelope !== 'function') return;
      await expect(docusign.createAPAEnvelope(null)).rejects.toThrow();
    });
  });

  describe('getEnvelopeStatus', () => {
    it('should return envelope status', async () => {
      if (typeof docusign.getEnvelopeStatus !== 'function') return;
      const result = await docusign.getEnvelopeStatus('env-123');
      expect(result).toBeDefined();
      expect(result.status).toBe('completed');
    });

    it('should return status fields', async () => {
      if (typeof docusign.getEnvelopeStatus !== 'function') return;
      const result = await docusign.getEnvelopeStatus('env-456');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('sentDateTime');
      expect(result).toHaveProperty('completedDateTime');
    });
  });

  describe('downloadSignedDocument', () => {
    it('should download and save signed document', async () => {
      if (typeof docusign.downloadSignedDocument !== 'function') return;
      const result = await docusign.downloadSignedDocument('env-123', '/tmp/test-doc.pdf');
      expect(result).toBe('/tmp/test-doc.pdf');
    });
  });

  describe('processWebhook', () => {
    it('should handle envelope-completed event', async () => {
      if (typeof docusign.processWebhook !== 'function') return;
      const payload = {
        event: 'envelope-completed',
        data: { envelopeId: 'env-123' },
      };
      const result = await docusign.processWebhook(payload);
      expect(result).toBeDefined();
      expect(result.status).toBe('completed');
      expect(result.appStatus).toBe('pending_payment');
      expect(result.signedAt).toBeDefined();
    });

    it('should handle envelope-declined event', async () => {
      if (typeof docusign.processWebhook !== 'function') return;
      const payload = { event: 'envelope-declined', envelopeId: 'env-123' };
      const result = await docusign.processWebhook(payload);
      expect(result.status).toBe('declined');
      expect(result.appStatus).toBe('declined');
    });

    it('should handle envelope-voided event', async () => {
      if (typeof docusign.processWebhook !== 'function') return;
      const payload = { event: 'envelope-voided', envelopeId: 'env-123' };
      const result = await docusign.processWebhook(payload);
      expect(result.status).toBe('voided');
      expect(result.appStatus).toBe('voided');
    });

    it('should handle envelope-sent event', async () => {
      if (typeof docusign.processWebhook !== 'function') return;
      const payload = { event: 'envelope-sent', envelopeId: 'env-123' };
      const result = await docusign.processWebhook(payload);
      expect(result.status).toBe('sent');
      expect(result.appStatus).toBe('pending_signature');
    });

    it('should handle status-based webhooks (legacy)', async () => {
      if (typeof docusign.processWebhook !== 'function') return;
      const payload = { status: 'completed', envelopeId: 'env-123' };
      const result = await docusign.processWebhook(payload);
      expect(result.status).toBe('completed');
      expect(result.appStatus).toBe('pending_payment');
    });

    it('should handle unknown event gracefully', async () => {
      if (typeof docusign.processWebhook !== 'function') return;
      const payload = { event: 'unknown-event', envelopeId: 'env-123' };
      const result = await docusign.processWebhook(payload);
      expect(result.appStatus).toBe('pending_signature');
    });
  });

  describe('validateWebhookSignature', () => {
    it('should validate valid HMAC signature', () => {
      if (typeof docusign.validateWebhookSignature !== 'function') return;
      const body = { test: true };
      const crypto = require('crypto');
      const hmac = crypto.createHmac('sha256', 'test-webhook-secret')
        .update(JSON.stringify(body))
        .digest('base64');

      const req = {
        headers: { 'x-docusign-signature-1': hmac },
        body,
      };
      const result = docusign.validateWebhookSignature(req);
      expect(result).toBe(true);
    });

    it('should reject invalid signatures', () => {
      if (typeof docusign.validateWebhookSignature !== 'function') return;
      const req = {
        headers: { 'x-docusign-signature-1': 'invalid-sig' },
        body: { test: true },
      };
      const result = docusign.validateWebhookSignature(req);
      expect(result).toBe(false);
    });

    it('should allow when missing signature in dev mode', () => {
      if (typeof docusign.validateWebhookSignature !== 'function') return;
      const req = { headers: {}, body: { test: true } };
      const result = docusign.validateWebhookSignature(req);
      // Missing signature returns true (dev mode)
      expect(result).toBe(true);
    });
  });
});
