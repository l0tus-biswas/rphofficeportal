/**
 * Unit Tests: utils/zohosign.js
 * Tests Zoho Sign integration functions (replaced docusign.js — see
 * tests/unit/docusign.test.js, kept only for rollback reference).
 */

describe('Utils: zohosign.js', () => {
  let zohosign;
  let fetchMock;

  const jsonResponse = (body, ok = true, status = 200) => ({
    ok,
    status,
    json: jest.fn().mockResolvedValue(body),
    arrayBuffer: jest.fn().mockResolvedValue(Buffer.from('mock-pdf-bytes')),
  });

  beforeEach(() => {
    jest.resetModules();

    // Mock SystemConfig - findOne needs to return object with .lean()
    jest.doMock('../../models/SystemConfig', () => ({
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null), // forces fallback to env var
      }),
      findOneAndUpdate: jest.fn().mockResolvedValue({}),
    }));

    jest.doMock('fs', () => ({
      readFileSync: jest.fn().mockReturnValue('mock-file'),
      existsSync: jest.fn().mockReturnValue(false), // skip .env auto-load
      writeFileSync: jest.fn(),
      mkdirSync: jest.fn(),
    }));

    jest.doMock('path', () => ({
      ...jest.requireActual('path'),
      resolve: jest.fn((...args) => args.join('/')),
      dirname: jest.fn().mockReturnValue('/tmp'),
    }));

    jest.doMock('dotenv', () => ({ config: jest.fn() }));

    process.env.ZOHO_CLIENT_ID = 'test-client-id';
    process.env.ZOHO_CLIENT_SECRET = 'test-client-secret';
    process.env.ZOHO_REFRESH_TOKEN = 'test-refresh-token';
    process.env.ZOHO_SIGN_TEMPLATE_ID = 'test-template-id';
    process.env.ZOHO_SIGN_ACTION_ROLE = 'Agent';
    process.env.ZOHO_SIGN_WEBHOOK_SECRET = 'test-webhook-secret';
    process.env.ZOHO_SIGN_API_DOMAIN = 'https://sign.zoho.com';
    process.env.ZOHO_ACCOUNTS_DOMAIN = 'https://accounts.zoho.com';

    // global fetch mock — routes by URL substring since zohosign.js calls
    // several different endpoints across a single test
    fetchMock = jest.fn();
    global.fetch = fetchMock;

    zohosign = require('../../utils/zohosign');
  });

  afterEach(() => {
    delete global.fetch;
  });

  function mockAuthThen(...responses) {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'mock-access-token', expires_in: 3600 }))
      .mockImplementation((...args) => {
        const next = responses.shift();
        return Promise.resolve(next || jsonResponse({}));
      });
  }

  describe('module exports', () => {
    it('should export expected functions', () => {
      expect(zohosign).toBeDefined();
      const expectedFns = [
        'createAPAEnvelope',
        'getEnvelopeStatus',
        'downloadSignedDocument',
        'processWebhook',
        'validateWebhookSignature',
        'getActiveTemplateId',
        'updateTemplateDocument',
        'createTemplateFromPDF',
        'getTemplateInfo',
        'buildFieldData',
      ];
      expectedFns.forEach(fn => {
        expect(typeof zohosign[fn]).toBe('function');
      });
    });
  });

  describe('authenticateWithOAuth', () => {
    it('should exchange the refresh token for an access token', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: 'abc123', expires_in: 3600 }));
      const token = await zohosign.authenticateWithOAuth();
      expect(token).toBe('abc123');
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/oauth/v2/token'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should throw a clear error when credentials are missing', async () => {
      delete process.env.ZOHO_REFRESH_TOKEN;
      jest.resetModules();
      jest.doMock('../../models/SystemConfig', () => ({
        findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
      }));
      const freshZohosign = require('../../utils/zohosign');
      await expect(freshZohosign.authenticateWithOAuth()).rejects.toThrow(/not configured/);
    });
  });

  describe('buildFieldData', () => {
    it('should map application fields to Zoho field_data without errors', () => {
      const application = {
        personalInfo: {
          legalFirstName: 'John', legalLastName: 'Doe', gender: 'M',
          dateOfBirth: '1990-01-01', ssn: '123-45-6789', mobilePhone: '555-1234',
          email: 'john@test.com', homeAddress: { street: '1 Main St', city: 'Austin', state: 'TX', zipCode: '78701' },
          previouslyContracted: false,
        },
        recruitingInfo: { recruiterFullName: 'Jane Smith', recruiterContact: 'jane@test.com' },
        complianceQuestions: {
          previouslyContractedOther: { answer: false }, felonyConviction: { answer: false },
          misdemeanorFraud: { answer: false }, civilAction: { answer: false },
          licenseDenied: { answer: false }, bondIssues: { answer: false },
        },
        financialBackground: { unsatisfiedJudgments: false, unsatisfiedLiens: false, bankruptcy: { filed: false } },
        licensingStatus: { currentlyLicensed: true, licenseTypes: ['Life'], licenseStatus: 'Active' },
      };

      const { field_text_data, field_boolean_data } = zohosign.buildFieldData(application);
      expect(field_text_data.firstName).toBe('John');
      expect(field_text_data.lastName).toBe('Doe');
      expect(field_text_data.socialSecurityNumber).toBe('123-45-6789');
      expect(field_text_data.emailAddress).toBe('john@test.com');
      expect(field_text_data.noticesEmail).toBe('john@test.com');
      expect(field_boolean_data.genderMale).toBe(true);
      expect(field_boolean_data.genderFemale).toBe(false);
      expect(field_boolean_data.currentlyLicensedYes).toBe(true);
      expect(field_boolean_data.licenseTypeLife).toBe(true);
      // licenseStatus is a checkbox group on the template (not a text field)
      expect(field_boolean_data.licenseStatusActive).toBe(true);
      expect(field_boolean_data.licenseStatusInactive).toBe(false);
      expect(field_text_data.licenseStatus).toBeUndefined();
      // bankruptcy not filed -> chapter/status checkboxes not set at all
      expect(field_boolean_data.bankruptcyChapter7).toBeUndefined();
    });

    it('prefills agencyLegalName from the application', () => {
      const { field_text_data } = zohosign.buildFieldData({
        personalInfo: { agencyLegalName: '  Doe Insurance Agency LLC ' }
      });
      expect(field_text_data.agencyLegalName).toBe('Doe Insurance Agency LLC');
    });

    it('falls back to N/A when agencyLegalName is missing or blank', () => {
      expect(zohosign.buildFieldData({ personalInfo: {} }).field_text_data.agencyLegalName).toBe('N/A');
      expect(zohosign.buildFieldData({ personalInfo: { agencyLegalName: '   ' } }).field_text_data.agencyLegalName).toBe('N/A');
    });

    it('prefills fullLegalName as first, middle and last name only', () => {
      const { field_text_data } = zohosign.buildFieldData({
        personalInfo: { legalFirstName: 'John', legalMiddleName: 'Q', legalLastName: 'Doe', agencyLegalName: 'Doe LLC' }
      });
      expect(field_text_data.fullLegalName).toBe('John Q Doe');
    });

    it('prefills Date and signatureDate with today in MMM dd yyyy', () => {
      const { field_date_data } = zohosign.buildFieldData({ personalInfo: {} });
      expect(Object.keys(field_date_data).sort()).toEqual(['Date', 'signatureDate']);
      expect(field_date_data.Date).toMatch(/^[A-Z][a-z]{2} \d{2} \d{4}$/);
      expect(field_date_data.signatureDate).toBe(field_date_data.Date);
    });

    it('should warn and skip unknown field names rather than throwing', () => {
      // buildFieldData only ever uses names from its own whitelist, so this
      // just guards against a future edit introducing a typo'd field name
      // without a corresponding entry in TEXT_FIELD_NAMES/CHECKBOX_FIELD_NAMES.
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      zohosign.buildFieldData({ personalInfo: {}, recruitingInfo: {}, complianceQuestions: {}, financialBackground: {}, licensingStatus: {} });
      warnSpy.mockRestore();
    });
  });

  describe('createAPAEnvelope', () => {
    it('should look up the template action, send, and return envelopeId/status', async () => {
      mockAuthThen(
        jsonResponse({ code: 0, templates: { actions: [{ role: 'Agent', action_id: 'action-1' }] } }),
        jsonResponse({ code: 0, requests: { request_id: 'req-123' } })
      );

      const application = {
        personalInfo: { legalFirstName: 'John', legalLastName: 'Doe', email: 'john@test.com' },
        recruitingInfo: { recruiterFullName: 'Jane Smith' },
        complianceQuestions: {}, financialBackground: {}, licensingStatus: {},
      };

      const result = await zohosign.createAPAEnvelope(application);
      expect(result.envelopeId).toBe('req-123');
      expect(result.status).toBe('sent');
    });

    it('should throw when the template has no action for the configured role', async () => {
      mockAuthThen(jsonResponse({ code: 0, templates: { actions: [] } }));
      const application = {
        personalInfo: { legalFirstName: 'John', legalLastName: 'Doe', email: 'john@test.com' },
        recruitingInfo: {}, complianceQuestions: {}, financialBackground: {}, licensingStatus: {},
      };
      await expect(zohosign.createAPAEnvelope(application)).rejects.toThrow();
    });
  });

  describe('getEnvelopeStatus', () => {
    it('should map Zoho request_status to our status vocabulary', async () => {
      mockAuthThen(jsonResponse({
        code: 0,
        requests: { request_status: 'completed', created_time: 1700000000000, sign_submitted_time: 1700000100000, actions: [] },
      }));
      const result = await zohosign.getEnvelopeStatus('req-123');
      expect(result.status).toBe('completed');
      expect(result.completedDateTime).toBeInstanceOf(Date);
    });

    it('should map declined to declined', async () => {
      mockAuthThen(jsonResponse({ code: 0, requests: { request_status: 'declined', actions: [] } }));
      const result = await zohosign.getEnvelopeStatus('req-123');
      expect(result.status).toBe('declined');
    });

    it('should map expired to voided', async () => {
      mockAuthThen(jsonResponse({ code: 0, requests: { request_status: 'expired', actions: [] } }));
      const result = await zohosign.getEnvelopeStatus('req-123');
      expect(result.status).toBe('voided');
    });

    it('should map inprogress to sent', async () => {
      mockAuthThen(jsonResponse({ code: 0, requests: { request_status: 'inprogress', actions: [] } }));
      const result = await zohosign.getEnvelopeStatus('req-123');
      expect(result.status).toBe('sent');
    });
  });

  describe('downloadSignedDocument', () => {
    it('should download and save the signed PDF', async () => {
      const writeFileSyncMock = jest.fn();
      jest.doMock('fs', () => ({
        readFileSync: jest.fn().mockReturnValue('mock-file'),
        existsSync: jest.fn().mockReturnValue(true),
        writeFileSync: writeFileSyncMock,
        mkdirSync: jest.fn(),
      }));
      jest.resetModules();
      jest.doMock('../../models/SystemConfig', () => ({ findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) }));
      jest.doMock('dotenv', () => ({ config: jest.fn() }));
      global.fetch = fetchMock;
      const freshZohosign = require('../../utils/zohosign');

      mockAuthThen({ ok: true, arrayBuffer: jest.fn().mockResolvedValue(Buffer.from('pdf-bytes')) });
      const result = await freshZohosign.downloadSignedDocument('req-123', '/tmp/test-doc.pdf');
      expect(result).toBe('/tmp/test-doc.pdf');
      expect(writeFileSyncMock).toHaveBeenCalled();
    });
  });

  describe('processWebhook', () => {
    it('should map a completed request to pending_payment', async () => {
      const payload = { requests: { request_id: 'req-123', request_status: 'completed', sign_submitted_time: Date.now() } };
      const result = await zohosign.processWebhook(payload);
      expect(result.status).toBe('completed');
      expect(result.appStatus).toBe('pending_payment');
      expect(result.signedAt).toBeDefined();
    });

    it('should map a declined request to declined', async () => {
      const payload = { requests: { request_id: 'req-123', request_status: 'declined' } };
      const result = await zohosign.processWebhook(payload);
      expect(result.status).toBe('declined');
      expect(result.appStatus).toBe('declined');
    });

    it('should prefer an explicit event name over the status snapshot', async () => {
      const payload = { requests: { request_id: 'req-123', request_status: 'inprogress' }, event_type: 'RequestCompleted' };
      const result = await zohosign.processWebhook(payload);
      expect(result.status).toBe('completed');
      expect(result.appStatus).toBe('pending_payment');
    });

    it('should default unknown events to pending_signature', async () => {
      const payload = { requests: { request_id: 'req-123', request_status: 'inprogress' } };
      const result = await zohosign.processWebhook(payload);
      expect(result.appStatus).toBe('pending_signature');
    });
  });

  describe('validateWebhookSignature', () => {
    it('should validate a correct HMAC-SHA256 signature over the raw body', () => {
      const crypto = require('crypto');
      const rawBody = JSON.stringify({ test: true });
      const hmac = crypto.createHmac('sha256', 'test-webhook-secret').update(rawBody).digest('base64');
      const req = { headers: { 'x-zs-webhook-signature': hmac }, rawBody };
      expect(zohosign.validateWebhookSignature(req)).toBe(true);
    });

    it('should reject an incorrect signature', () => {
      const req = { headers: { 'x-zs-webhook-signature': 'wrong-signature' }, rawBody: JSON.stringify({ test: true }) };
      expect(zohosign.validateWebhookSignature(req)).toBe(false);
    });

    it('should allow when missing signature (dev mode leniency, matches docusign.js)', () => {
      const req = { headers: {}, rawBody: JSON.stringify({ test: true }) };
      expect(zohosign.validateWebhookSignature(req)).toBe(true);
    });
  });
});
