/**
 * Integration Tests: APA rejection -> edit -> re-sign, and version history
 *  - admin rejects with a reason  -> agent can edit without an edit request
 *  - any edit (edit request or rejection) -> version snapshot, pending_resignature
 *  - re-signed (webhook)          -> pending_review, no payment step, versioned PDF
 */
const request = require('supertest');

const User = require('../../models/User');
const APAApplication = require('../../models/APAApplication');
const Notification = require('../../models/Notification');
const neuzmail = require('../../utils/neuzmail');
const { generateTestToken, generateAdminToken, createMockUser, createMockAdmin } = require('../helpers/test-utils');

const APP_ID = '507f1f77bcf86cd799439011';
const AGENT_ID = 'agent-id';
const ADMIN_ID = 'admin-id';
const U = '/api/user/apa-application';
const A = '/api/admin/apa-applications';
const WEBHOOK = '/api/public/apa-application/docusign-webhook';

const q = (value) => {
  const chain = {};
  ['sort', 'select', 'populate', 'limit', 'skip', 'lean'].forEach((m) => { chain[m] = jest.fn().mockReturnValue(chain); });
  chain.then = (res, rej) => Promise.resolve(value).then(res, rej);
  chain.catch = (rej) => Promise.resolve(value).catch(rej);
  return chain;
};

const QUESTION_KEYS = ['previouslyContractedOther', 'felonyConviction', 'misdemeanorFraud', 'civilAction', 'licenseDenied', 'bondIssues'];

function makeApp(over = {}) {
  const compliance = {};
  QUESTION_KEYS.forEach((k) => { compliance[k] = { answer: false, explanation: '' }; });
  return {
    _id: APP_ID,
    userId: AGENT_ID,
    deletedAt: null,
    status: 'rejected',
    rejectionReason: 'SSN looks wrong',
    personalInfo: {
      legalFirstName: 'Janet', legalLastName: 'Doe', agencyLegalName: 'N/A', gender: 'F',
      dateOfBirth: new Date('1990-05-18T00:00:00.000Z'), ssn: '123-45-6789', mobilePhone: '5551234567',
      email: 'jane@example.com', previouslyContracted: false,
      homeAddress: { street: '1 Main St', city: 'Austin', state: 'TX', zipCode: '73301' }
    },
    recruitingInfo: { recruiterFullName: 'Rita', recruiterContact: 'rita@example.com' },
    complianceQuestions: compliance,
    financialBackground: { unsatisfiedJudgments: false, unsatisfiedLiens: false, bankruptcy: { filed: false } },
    licensingStatus: { currentlyLicensed: false, licenseTypes: [], statesLicensed: [] },
    editRequest: { status: 'none' },
    editHistory: [],
    versions: [],
    currentVersion: 1,
    currentVersionReason: 'original',
    resign: { required: false },
    docusign: { status: 'completed', envelopeId: 'env-1', documentUrl: '/uploads/apa-signed/a.pdf', signedAt: new Date('2026-01-01') },
    save: jest.fn().mockResolvedValue(undefined),
    ...over
  };
}

function payload() {
  const complianceQuestions = {};
  QUESTION_KEYS.forEach((k) => { complianceQuestions[k] = { answer: false, explanation: '' }; });
  return {
    personalInfo: {
      legalFirstName: 'Jane', legalLastName: 'Doe', gender: 'F', dateOfBirth: '1990-05-18', ssn: '987-65-4321',
      mobilePhone: '5551234567', homeAddress: { street: '1 Main St', city: 'Austin', state: 'TX', zipCode: '73301' }
    },
    complianceQuestions,
    financialBackground: { unsatisfiedJudgments: false, unsatisfiedLiens: false, bankruptcy: { filed: false } },
    licensingStatus: { currentlyLicensed: false }
  };
}

describe('Integration: APA rejection resubmit, re-sign and version history', () => {
  let app, agentToken, adminToken;
  const agentReq = (m, url) => request(app)[m](url).set('Authorization', `Bearer ${agentToken}`);
  const adminReq = (m, url) => request(app)[m](url).set('Authorization', `Bearer ${adminToken}`);
  const notified = (type) => Notification.createNotification.mock.calls.filter(([n]) => n.type === type);

  beforeAll(() => {
    app = require('../../server').app;
    agentToken = generateTestToken(AGENT_ID);
    adminToken = generateAdminToken(ADMIN_ID);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    const users = {
      [AGENT_ID]: createMockUser({ _id: AGENT_ID, role: 'agent', email: 'jane@example.com' }),
      [ADMIN_ID]: createMockAdmin({ _id: ADMIN_ID })
    };
    User.findById.mockImplementation((id) => {
      const p = Promise.resolve(users[id] || null);
      p.select = jest.fn().mockResolvedValue(users[id] || null);
      return p;
    });
    User.find.mockReturnValue(q([{ _id: 'admin-1' }]));
    Notification.createNotification.mockResolvedValue({});
  });

  describe('admin rejection', () => {
    it('requires a reason', async () => {
      const a = makeApp({ status: 'pending_review' });
      APAApplication.findById.mockReturnValue(q(a));
      const res = await adminReq('put', `${A}/${APP_ID}/reject`).send({ reason: '   ' });
      expect(res.status).toBe(400);
      expect(a.save).not.toHaveBeenCalled();
    });

    it('rejects a pending_review application, stores the reason and tells the agent how to resubmit', async () => {
      const a = makeApp({ status: 'pending_review', rejectionReason: undefined });
      APAApplication.findById.mockReturnValue(q(a));
      const res = await adminReq('put', `${A}/${APP_ID}/reject`).send({ reason: ' Wrong DOB ' });
      expect(res.status).toBe(200);
      expect(a.status).toBe('rejected');
      expect(a.rejectionReason).toBe('Wrong DOB');
      const [n] = notified('apa_rejected')[0];
      expect(n.link).toBe('/onboarding');
      expect(n.message).toMatch(/resubmit/i);
    });

    it('cannot approve or reject while the agent still has to sign', async () => {
      const a = makeApp({ status: 'pending_resignature' });
      APAApplication.findById.mockReturnValue(q(a));
      expect((await adminReq('put', `${A}/${APP_ID}/approve`).send({})).status).toBe(400);
      expect((await adminReq('put', `${A}/${APP_ID}/reject`).send({ reason: 'x' })).status).toBe(400);
    });

    it('approving a pending_review (re-signed) application activates it', async () => {
      const a = makeApp({ status: 'pending_review' });
      APAApplication.findById.mockReturnValue(q(a));
      expect((await adminReq('put', `${A}/${APP_ID}/approve`).send({})).status).toBe(200);
      expect(a.status).toBe('active');
    });
  });

  describe('agent edit after rejection (PUT /api/user/apa-application)', () => {
    it('is allowed without an approved edit request and moves to pending_resignature', async () => {
      const a = makeApp();
      APAApplication.findOne.mockReturnValue(q(a));

      const res = await agentReq('put', U).send(payload());

      expect(res.status).toBe(200);
      expect(res.body.resignRequired).toBe(true);
      expect(res.body.signatureSent).toBe(true);
      expect(res.body.version).toBe(2);
      expect(a.status).toBe('pending_resignature');
      expect(a.resign.required).toBe(true);
      expect(a.resign.source).toBe('rejection_resubmit');
      expect(a.rejectionReason).toBeUndefined();
      expect(a.currentVersion).toBe(2);
      expect(a.currentVersionReason).toBe('rejection_resubmit');
      expect(a.docusign.envelopeId).not.toBe('old');
      expect(notified('apa_resign_required')).toHaveLength(1);
    });

    it('snapshots the replaced version without the SSN and keeps its PDF and rejection reason', async () => {
      const a = makeApp();
      APAApplication.findOne.mockReturnValue(q(a));
      await agentReq('put', U).send(payload());

      expect(a.versions).toHaveLength(1);
      const v = a.versions[0];
      expect(v.version).toBe(1);
      expect(v.reason).toBe('original');
      expect(v.signedDocumentUrl).toBe('/uploads/apa-signed/a.pdf');
      expect(v.rejectionReason).toBe('SSN looks wrong');
      expect(v.snapshot.personalInfo.legalFirstName).toBe('Janet');
      expect(JSON.stringify(v.snapshot)).not.toContain('123-45-6789');
      expect(a.personalInfo.legalFirstName).toBe('Jane');
    });

    it('resubmits even when nothing changed (a rejection always needs a fresh signature)', async () => {
      const a = makeApp();
      APAApplication.findOne.mockReturnValue(q(a));
      const p = payload();
      p.personalInfo.legalFirstName = 'Janet';
      p.personalInfo.ssn = '';
      const res = await agentReq('put', U).send(p);
      expect(res.status).toBe(200);
      expect(a.status).toBe('pending_resignature');
      expect(a.versions).toHaveLength(1);
    });

    it('keeps the recruiting fields and email locked', async () => {
      const a = makeApp();
      APAApplication.findOne.mockReturnValue(q(a));
      const p = payload();
      p.recruitingInfo = { recruiterFullName: 'HACK' };
      p.personalInfo.email = 'evil@x.com';
      await agentReq('put', U).send(p);
      expect(a.recruitingInfo.recruiterFullName).toBe('Rita');
      expect(a.personalInfo.email).toBe('jane@example.com');
    });

    it('stays pending_resignature when the signature request cannot be sent', async () => {
      const a = makeApp();
      APAApplication.findOne.mockReturnValue(q(a));
      require('../../utils/zohosign').createAPAEnvelope.mockRejectedValueOnce(new Error('zoho down'));
      const keys = ['ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_REFRESH_TOKEN', 'ZOHO_SIGN_TEMPLATE_ID'];
      const saved = keys.map((k) => process.env[k]);
      keys.forEach((k) => { process.env[k] = 'x'; });
      try {
        const res = await agentReq('put', U).send(payload());
        expect(res.status).toBe(200);
        expect(res.body.signatureSent).toBe(false);
        expect(a.status).toBe('pending_resignature');
      } finally {
        keys.forEach((k, i) => { if (saved[i] === undefined) delete process.env[k]; else process.env[k] = saved[i]; });
      }
    });

    it('blocks a further edit while the new signature is pending', async () => {
      const a = makeApp({ status: 'pending_resignature', resign: { required: true } });
      APAApplication.findOne.mockReturnValue(q(a));
      expect((await agentReq('put', U).send(payload())).status).toBe(403);
    });

    it('is still forbidden for an active application with no approved edit request', async () => {
      const a = makeApp({ status: 'active' });
      APAApplication.findOne.mockReturnValue(q(a));
      expect((await agentReq('put', U).send(payload())).status).toBe(403);
    });
  });

  describe('agent edit via an approved edit request', () => {
    it('versions the application, locks the request and requires a new signature', async () => {
      const a = makeApp({ status: 'active', rejectionReason: undefined, editRequest: { status: 'approved' } });
      APAApplication.findOne.mockReturnValue(q(a));
      const res = await agentReq('put', U).send(payload());
      expect(res.status).toBe(200);
      expect(a.editRequest.status).toBe('locked');
      expect(a.status).toBe('pending_resignature');
      expect(a.resign.source).toBe('edit_request');
      expect(a.versions[0].rejectionReason).toBeUndefined();
    });

    it('does not create a version when nothing changed', async () => {
      const a = makeApp({ status: 'active', editRequest: { status: 'approved' } });
      APAApplication.findOne.mockReturnValue(q(a));
      const p = payload();
      p.personalInfo.legalFirstName = 'Janet';
      p.personalInfo.ssn = '';
      const res = await agentReq('put', U).send(p);
      expect(res.status).toBe(200);
      expect(res.body.resignRequired).toBe(false);
      expect(a.status).toBe('active');
      expect(a.versions).toHaveLength(0);
      expect(a.currentVersion).toBe(1);
    });
  });

  describe('POST /api/user/apa-application/resign', () => {
    it('re-sends the request when the earlier one was declined', async () => {
      const a = makeApp({ status: 'pending_resignature', resign: { required: true }, docusign: { status: 'declined', envelopeId: 'old' } });
      APAApplication.findOne.mockReturnValue(q(a));
      const res = await agentReq('post', `${U}/resign`).send({});
      expect(res.status).toBe(200);
      expect(a.docusign.envelopeId).not.toBe('old');
    });

    it('refuses while a request is already waiting in the inbox', async () => {
      const a = makeApp({ status: 'pending_resignature', resign: { required: true }, docusign: { status: 'sent', envelopeId: 'old' } });
      APAApplication.findOne.mockReturnValue(q(a));
      expect((await agentReq('post', `${U}/resign`).send({})).status).toBe(400);
    });

    it('refuses when no re-sign is needed', async () => {
      APAApplication.findOne.mockReturnValue(q(makeApp({ status: 'active' })));
      expect((await agentReq('post', `${U}/resign`).send({})).status).toBe(400);
    });
  });

  describe('version history endpoints', () => {
    const withHistory = () => makeApp({
      status: 'pending_review', currentVersion: 3, currentVersionReason: 'edit_request',
      versions: [
        { version: 1, reason: 'original', snapshot: { personalInfo: { legalFirstName: 'A' } }, signedDocumentUrl: '/uploads/apa-signed/a.pdf', rejectionReason: 'bad', supersededAt: new Date() },
        { version: 2, reason: 'rejection_resubmit', snapshot: { personalInfo: { legalFirstName: 'B' } }, signedDocumentUrl: '/uploads/apa-signed/a_v2.pdf', supersededAt: new Date() }
      ]
    });

    it('agent sees their own history, current first then newest superseded', async () => {
      APAApplication.findOne.mockReturnValue(q(withHistory()));
      const res = await agentReq('get', `${U}/versions`);
      expect(res.status).toBe(200);
      expect(res.body.currentVersion).toBe(3);
      expect(res.body.versions.map((v) => v.version)).toEqual([3, 2, 1]);
      expect(res.body.versions[0].isCurrent).toBe(true);
      expect(res.body.versions[2].rejectionReason).toBe('bad');
      expect(res.body.versions[1].signedDocumentUrl).toMatch(/^https?:\/\/.+\/uploads\/apa-signed\/a_v2\.pdf$/);
    });

    it('admin sees the history; non-admins are refused', async () => {
      APAApplication.findById.mockReturnValue(q(withHistory()));
      expect((await adminReq('get', `${A}/${APP_ID}/versions`)).body.versions).toHaveLength(3);
      expect((await agentReq('get', `${A}/${APP_ID}/versions`)).status).toBe(403);
      expect((await request(app).get(`${A}/${APP_ID}/versions`)).status).toBe(401);
    });

    it('agent history needs authentication and 404s without an application', async () => {
      expect((await request(app).get(`${U}/versions`)).status).toBe(401);
      APAApplication.findOne.mockReturnValue(q(null));
      expect((await agentReq('get', `${U}/versions`)).status).toBe(404);
    });
  });

  describe('Zoho webhook for a re-signed application', () => {
    const { processWebhook } = require('../../utils/zohosign');
    const post = () => request(app).post(WEBHOOK).set('Content-Type', 'application/json').send('{}');

    it('completes into pending_review: no payment email, versioned PDF, both sides notified', async () => {
      const a = makeApp({ status: 'pending_resignature', currentVersion: 2, resign: { required: true, source: 'edit_request' }, docusign: { status: 'sent', envelopeId: 'env-2' } });
      processWebhook.mockResolvedValueOnce({ envelopeId: 'env-2', status: 'completed', signedAt: new Date() });
      APAApplication.findOne.mockResolvedValue(a);

      const res = await post();

      expect(res.status).toBe(200);
      expect(a.status).toBe('pending_review');
      expect(a.resign.required).toBe(false);
      expect(a.docusign.documentUrl).toBe(`/uploads/apa-signed/${APP_ID}_signed_apa_v2.pdf`);
      expect(neuzmail.sendPaymentLinkEmail).not.toHaveBeenCalled();
      expect(notified('apa_resigned').map(([n]) => n.userId).sort()).toEqual(['admin-1', AGENT_ID]);
    });

    it('a declined re-sign keeps pending_resignature so the agent can retry', async () => {
      const a = makeApp({ status: 'pending_resignature', resign: { required: true }, docusign: { status: 'sent', envelopeId: 'env-2' } });
      processWebhook.mockResolvedValueOnce({ envelopeId: 'env-2', status: 'declined' });
      APAApplication.findOne.mockResolvedValue(a);
      await post();
      expect(a.status).toBe('pending_resignature');
      expect(a.docusign.status).toBe('declined');
    });

    it('a duplicate "completed" delivery does not push a reviewed application back to payment', async () => {
      const a = makeApp({ status: 'pending_review', resign: { required: false }, docusign: { status: 'completed', envelopeId: 'env-2' } });
      processWebhook.mockResolvedValueOnce({ envelopeId: 'env-2', status: 'completed', signedAt: new Date() });
      APAApplication.findOne.mockResolvedValue(a);
      await post();
      expect(a.status).toBe('pending_review');
      expect(a.save).not.toHaveBeenCalled();
      expect(neuzmail.sendPaymentLinkEmail).not.toHaveBeenCalled();
    });

    it('the initial signature still goes to pending_payment and sends the payment email', async () => {
      const a = makeApp({ status: 'pending_signature', userId: undefined, resign: { required: false }, docusign: { status: 'sent', envelopeId: 'env-0' } });
      processWebhook.mockResolvedValueOnce({ envelopeId: 'env-0', status: 'completed', signedAt: new Date() });
      APAApplication.findOne.mockResolvedValue(a);
      await post();
      expect(a.status).toBe('pending_payment');
      expect(neuzmail.sendPaymentLinkEmail).toHaveBeenCalledTimes(1);
      expect(a.docusign.documentUrl).toBe(`/uploads/apa-signed/${APP_ID}_signed_apa.pdf`);
    });
  });
});
