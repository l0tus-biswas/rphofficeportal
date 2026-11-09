/**
 * Integration Tests: APA "request to edit" workflow
 *  - agent side:  /api/user/apa-application (edit-request + edit)
 *  - admin side:  /api/admin/apa-applications/edit-requests and .../edit-request/{approve,deny,lock}
 *
 * Models are mocked (see setup-integration.js); each test supplies in-memory
 * application/user documents and asserts on the mutations the routes perform.
 */
const request = require('supertest');

const User = require('../../models/User');
const APAApplication = require('../../models/APAApplication');
const Notification = require('../../models/Notification');
const SystemConfig = require('../../models/SystemConfig');
const { generateTestToken, generateAdminToken, createMockUser, createMockAdmin } = require('../helpers/test-utils');

const APP_ID = '507f1f77bcf86cd799439011';
const AGENT_ID = 'agent-id';
const ADMIN_ID = 'admin-id';
const U = '/api/user/apa-application';
const A = '/api/admin/apa-applications';

// Chainable + thenable stand-in for a Mongoose query.
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
    personalInfo: {
      legalFirstName: 'Janet', legalMiddleName: '', legalLastName: 'Doe', agencyLegalName: 'N/A',
      gender: 'F', dateOfBirth: new Date('1990-05-18T00:00:00.000Z'), ssn: '123-45-6789',
      mobilePhone: '5551234567', email: 'jane@example.com',
      homeAddress: { street: '1 Main St', city: 'Austin', state: 'TX', zipCode: '73301' },
      previouslyContracted: false
    },
    recruitingInfo: {
      recruiterFullName: 'Rita Recruiter', recruiterAgentId: 'AGT1', recruiterContact: 'rita@example.com',
      uplineLeaderName: 'Up Line', teamName: 'Team A', referralCode: 'REF123'
    },
    complianceQuestions: compliance,
    financialBackground: {
      unsatisfiedJudgments: false, unsatisfiedJudgmentsExplanation: '',
      unsatisfiedLiens: false, unsatisfiedLiensExplanation: '',
      bankruptcy: { filed: false, chapter: null, status: null }
    },
    licensingStatus: { currentlyLicensed: false, licenseTypes: [], statesLicensed: [], licenseNumber: '', licenseStatus: null },
    editRequest: { status: 'approved' },
    editHistory: [],
    versions: [],
    currentVersion: 1,
    currentVersionReason: 'original',
    status: 'active',
    docusign: { status: 'completed', envelopeId: 'env-1', documentUrl: '/uploads/apa-signed/a.pdf' },
    save: jest.fn().mockResolvedValue(undefined),
    ...over
  };
}

// Payload identical to makeApp() — a save that changes nothing.
function unchangedPayload() {
  const complianceQuestions = {};
  QUESTION_KEYS.forEach((k) => { complianceQuestions[k] = { answer: false, explanation: '' }; });
  return {
    personalInfo: {
      legalFirstName: 'Janet', legalMiddleName: '', legalLastName: 'Doe', agencyLegalName: '',
      gender: 'F', dateOfBirth: '1990-05-18', ssn: '', mobilePhone: '5551234567',
      homeAddress: { street: '1 Main St', city: 'Austin', state: 'TX', zipCode: '73301' },
      mailingAddress: null, previouslyContracted: false
    },
    recruitingInfo: { recruiterFullName: 'IGNORED', recruiterContact: 'ignored@x.com', referralCode: 'EVIL' },
    complianceQuestions,
    financialBackground: { unsatisfiedJudgments: false, unsatisfiedLiens: false, bankruptcy: { filed: false } },
    licensingStatus: { currentlyLicensed: false }
  };
}

function changedPayload() {
  const p = unchangedPayload();
  p.personalInfo.legalFirstName = 'Jane';
  p.personalInfo.dateOfBirth = '1990-05-17';
  p.personalInfo.ssn = '987-65-4321';
  p.personalInfo.mobilePhone = '5559998888';
  p.personalInfo.homeAddress = { street: '9 Oak Ave', city: 'Dallas', state: 'TX', zipCode: '75001' };
  return p;
}

describe('Integration: APA edit-request workflow', () => {
  let app, agentToken, adminToken, agentDoc, adminDoc;

  const agentReq = (method, url) => request(app)[method](url).set('Authorization', `Bearer ${agentToken}`);
  const adminReq = (method, url) => request(app)[method](url).set('Authorization', `Bearer ${adminToken}`);
  const notified = (type) => Notification.createNotification.mock.calls.filter(([n]) => n.type === type);

  beforeAll(() => {
    app = require('../../server').app;
    agentToken = generateTestToken(AGENT_ID);
    adminToken = generateAdminToken(ADMIN_ID);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    agentDoc = createMockUser({ _id: AGENT_ID, name: 'Old Name', phone: '0000000000', role: 'agent', email: 'jane@example.com' });
    adminDoc = createMockAdmin({ _id: ADMIN_ID });
    const users = { [AGENT_ID]: agentDoc, [ADMIN_ID]: adminDoc };

    // Auth awaits `.select('-password')`; routes await findById directly — support both.
    User.findById.mockImplementation((id) => {
      const doc = users[id] || null;
      const p = Promise.resolve(doc);
      p.select = jest.fn().mockResolvedValue(doc);
      return p;
    });
    User.find.mockReturnValue(q([{ _id: 'admin-1' }, { _id: 'admin-2' }]));
    SystemConfig.findOne.mockImplementation(() => ({ lean: jest.fn().mockResolvedValue({ value: 'true' }) }));
    Notification.createNotification.mockResolvedValue({});
  });

  // ─────────────────────────────── agent: request ───────────────────────────────
  describe('POST /api/user/apa-application/edit-request', () => {
    const url = `${U}/edit-request`;

    it('requires authentication', async () => {
      expect((await request(app).post(url).send({ reason: 'fix my dob' })).status).toBe(401);
    });

    it.each([
      ['missing', undefined],
      ['too short', 'abcd'],
      ['whitespace only', '       '],
      ['too long', 'x'.repeat(1001)],
      ['non-string', { $ne: 1 }]
    ])('rejects a %s reason with 400', async (_label, reason) => {
      const a = makeApp({ editRequest: { status: 'none' } });
      APAApplication.findOne.mockReturnValue(q(a));
      const res = await agentReq('post', url).send({ reason });
      expect(res.status).toBe(400);
      expect(a.save).not.toHaveBeenCalled();
    });

    it('returns 404 when the agent has no application', async () => {
      APAApplication.findOne.mockReturnValue(q(null));
      const res = await agentReq('post', url).send({ reason: 'fix my date of birth' });
      expect(res.status).toBe(404);
    });

    it('returns 400 when a request is already pending', async () => {
      const a = makeApp({ editRequest: { status: 'pending' } });
      APAApplication.findOne.mockReturnValue(q(a));
      const res = await agentReq('post', url).send({ reason: 'fix my date of birth' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/already have an edit request/i);
      expect(a.save).not.toHaveBeenCalled();
    });

    it('returns 400 when editing is already unlocked', async () => {
      const a = makeApp({ editRequest: { status: 'approved' } });
      APAApplication.findOne.mockReturnValue(q(a));
      const res = await agentReq('post', url).send({ reason: 'fix my date of birth' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/already unlocked/i);
      expect(a.save).not.toHaveBeenCalled();
    });

    it.each(['none', 'denied', 'locked'])('accepts a new request from "%s", sets pending and notifies every admin', async (from) => {
      const a = makeApp({ editRequest: { status: from, adminNote: 'old' } });
      APAApplication.findOne.mockReturnValue(q(a));

      const res = await agentReq('post', url).send({ reason: '  My date of birth was entered wrong  ' });

      expect(res.status).toBe(200);
      expect(res.body.editRequest.status).toBe('pending');
      expect(a.editRequest.status).toBe('pending');
      expect(a.editRequest.reason).toBe('My date of birth was entered wrong');
      expect(a.editRequest.requestedAt).toBeInstanceOf(Date);
      expect(a.save).toHaveBeenCalledTimes(1);

      const calls = notified('apa_edit_requested');
      expect(calls.map(([n]) => n.userId).sort()).toEqual(['admin-1', 'admin-2']);
      expect(calls[0][0].link).toBe('/admin/onboarding?tab=edit-requests');
      expect(calls[0][0].message).toContain('Janet Doe');
      expect(calls[0][0].data).toEqual({ agentId: AGENT_ID, applicationId: APP_ID });
    });

    it('falls back to the email lookup when no application is linked by userId', async () => {
      const a = makeApp({ editRequest: { status: 'none' } });
      APAApplication.findOne.mockReturnValueOnce(q(null)).mockReturnValueOnce(q(a));
      const res = await agentReq('post', url).send({ reason: 'fix my date of birth' });
      expect(res.status).toBe(200);
      expect(APAApplication.findOne.mock.calls[1][0]).toEqual({ 'personalInfo.email': 'jane@example.com', deletedAt: null });
    });

    it('still succeeds when notifying admins fails', async () => {
      const a = makeApp({ editRequest: { status: 'none' } });
      APAApplication.findOne.mockReturnValue(q(a));
      Notification.createNotification.mockRejectedValue(new Error('push down'));
      const res = await agentReq('post', url).send({ reason: 'fix my date of birth' });
      expect(res.status).toBe(200);
      expect(a.editRequest.status).toBe('pending');
    });
  });

  // ─────────────────────────────── agent: edit ───────────────────────────────
  describe('PUT /api/user/apa-application', () => {
    it('requires authentication', async () => {
      expect((await request(app).put(U).send(unchangedPayload())).status).toBe(401);
    });

    it('returns 404 when the agent has no application', async () => {
      APAApplication.findOne.mockReturnValue(q(null));
      expect((await agentReq('put', U).send(unchangedPayload())).status).toBe(404);
    });

    it.each(['none', 'pending', 'denied', 'locked'])('is forbidden (403) while status is "%s"', async (status) => {
      const a = makeApp({ editRequest: { status } });
      APAApplication.findOne.mockReturnValue(q(a));
      const res = await agentReq('put', U).send(changedPayload());
      expect(res.status).toBe(403);
      expect(a.save).not.toHaveBeenCalled();
      expect(a.personalInfo.legalFirstName).toBe('Janet');
      expect(agentDoc.save).not.toHaveBeenCalled();
    });

    it('is forbidden when the application has no editRequest at all', async () => {
      const a = makeApp({ editRequest: undefined });
      APAApplication.findOne.mockReturnValue(q(a));
      expect((await agentReq('put', U).send(changedPayload())).status).toBe(403);
    });

    describe('validation (400, nothing saved, access stays open)', () => {
      const bad = (label, mutate) => it(label, async () => {
        const a = makeApp();
        APAApplication.findOne.mockReturnValue(q(a));
        const body = unchangedPayload();
        mutate(body);
        const res = await agentReq('put', U).send(body);
        expect(res.status).toBe(400);
        expect(a.save).not.toHaveBeenCalled();
        expect(agentDoc.save).not.toHaveBeenCalled();
        expect(a.editRequest.status).toBe('approved');
      });

      bad('missing personalInfo section', (b) => { delete b.personalInfo; });
      bad('missing complianceQuestions section', (b) => { delete b.complianceQuestions; });
      bad('missing financialBackground section', (b) => { delete b.financialBackground; });
      bad('missing licensingStatus section', (b) => { delete b.licensingStatus; });
      bad('blank first name', (b) => { b.personalInfo.legalFirstName = '   '; });
      bad('blank last name', (b) => { b.personalInfo.legalLastName = ''; });
      bad('missing phone', (b) => { delete b.personalInfo.mobilePhone; });
      bad('missing home street', (b) => { b.personalInfo.homeAddress.street = ''; });
      bad('missing home address object', (b) => { delete b.personalInfo.homeAddress; });
      bad('invalid gender', (b) => { b.personalInfo.gender = 'X'; });
      bad('unparseable date of birth', (b) => { b.personalInfo.dateOfBirth = 'not-a-date'; });
      bad('future date of birth', (b) => { b.personalInfo.dateOfBirth = '2999-01-01'; });
      bad('date of birth before 1900', (b) => { b.personalInfo.dateOfBirth = '1899-12-31'; });
      bad('malformed SSN', (b) => { b.personalInfo.ssn = '12-345-678'; });
      bad('6-digit zip code', (b) => { b.personalInfo.homeAddress.zipCode = '741101'; });
      bad('alphabetic zip code', (b) => { b.personalInfo.homeAddress.zipCode = 'ABCDE'; });
      bad('non-boolean compliance answer', (b) => { b.complianceQuestions.felonyConviction.answer = 'yes'; });
      bad('missing compliance question', (b) => { delete b.complianceQuestions.bondIssues; });
      bad('non-boolean judgments answer', (b) => { b.financialBackground.unsatisfiedJudgments = null; });
      bad('non-boolean liens answer', (b) => { b.financialBackground.unsatisfiedLiens = 'no'; });
      bad('non-boolean bankruptcy answer', (b) => { b.financialBackground.bankruptcy.filed = undefined; });
      bad('non-boolean licensed answer', (b) => { b.licensingStatus.currentlyLicensed = 'true'; });
    });

    describe('successful save', () => {
      it('updates the application, syncs the agent account and returns the change count', async () => {
        const a = makeApp();
        APAApplication.findOne.mockReturnValue(q(a));
        const body = changedPayload();
        body.personalInfo.mailingAddress = { street: 'PO Box 1', city: 'Plano', state: 'TX', zipCode: '75074' };

        const res = await agentReq('put', U).send(body);

        expect(res.status).toBe(200);
        expect(res.body.changed).toBe(a.editHistory[0].changes.length);
        expect(res.body.changed).toBeGreaterThan(0);
        expect(a.save).toHaveBeenCalledTimes(2);

        expect(a.personalInfo.legalFirstName).toBe('Jane');
        expect(a.personalInfo.mobilePhone).toBe('5559998888');
        expect(a.personalInfo.ssn).toBe('987-65-4321');
        expect(a.personalInfo.dateOfBirth.toISOString().slice(0, 10)).toBe('1990-05-17');
        expect(a.personalInfo.homeAddress).toEqual({ street: '9 Oak Ave', city: 'Dallas', state: 'TX', zipCode: '75001' });
        expect(a.personalInfo.mailingAddress).toEqual({ street: 'PO Box 1', city: 'Plano', state: 'TX', zipCode: '75074' });
        expect(a.personalInfo.agencyLegalName).toBe('N/A');

        // account profile mirrors the corrected application
        expect(agentDoc.name).toBe('Jane Doe');
        expect(agentDoc.phone).toBe('5559998888');
        expect(agentDoc.dateOfBirth.toISOString().slice(0, 10)).toBe('1990-05-17');
        expect(agentDoc.address).toBe('9 Oak Ave');
        expect(agentDoc.city).toBe('Dallas');
        expect(agentDoc.state).toBe('TX');
        expect(agentDoc.zipCode).toBe('75001');
        expect(agentDoc.updatedBy).toBe(AGENT_ID);
        expect(agentDoc.save).toHaveBeenCalledTimes(1);
      });

      it('keeps the existing SSN when the field is left blank and records no SSN change', async () => {
        const a = makeApp();
        APAApplication.findOne.mockReturnValue(q(a));
        const body = changedPayload();
        body.personalInfo.ssn = '';
        const res = await agentReq('put', U).send(body);
        expect(res.status).toBe(200);
        expect(a.personalInfo.ssn).toBe('123-45-6789');
        expect(a.editHistory[0].changes.map((c) => c.field)).not.toContain('personalInfo.ssn');
      });

      it('records an audit entry with old/new values and masks the SSN', async () => {
        const a = makeApp();
        APAApplication.findOne.mockReturnValue(q(a));
        await agentReq('put', U).send(changedPayload());

        expect(a.editHistory).toHaveLength(1);
        const entry = a.editHistory[0];
        expect(entry.editedBy).toBe(AGENT_ID);
        expect(entry.editedAt).toBeInstanceOf(Date);

        const byField = Object.fromEntries(entry.changes.map((c) => [c.field, c]));
        expect(byField['personalInfo.legalFirstName']).toMatchObject({ from: 'Janet', to: 'Jane' });
        expect(byField['personalInfo.dateOfBirth']).toMatchObject({ from: '1990-05-18', to: '1990-05-17' });
        expect(byField['personalInfo.mobilePhone']).toMatchObject({ from: '5551234567', to: '5559998888' });
        expect(byField['personalInfo.homeAddress.city']).toMatchObject({ from: 'Austin', to: 'Dallas' });
        expect(byField['personalInfo.ssn']).toEqual({ field: 'personalInfo.ssn', from: '***', to: '***' });

        const serialised = JSON.stringify(a.editHistory);
        expect(serialised).not.toContain('123-45-6789');
        expect(serialised).not.toContain('987-65-4321');
      });

      it('ignores recruitingInfo and keeps the login email and referral code', async () => {
        const a = makeApp();
        const recruitingBefore = JSON.parse(JSON.stringify(a.recruitingInfo));
        APAApplication.findOne.mockReturnValue(q(a));
        const body = changedPayload();
        body.personalInfo.email = 'attacker@example.com';

        const res = await agentReq('put', U).send(body);

        expect(res.status).toBe(200);
        expect(a.recruitingInfo).toEqual(recruitingBefore);
        expect(a.recruitingInfo.referralCode).toBe('REF123');
        expect(a.personalInfo.email).toBe('jane@example.com');
        expect(a.editHistory[0].changes.map((c) => c.field).some((f) => f.startsWith('recruitingInfo'))).toBe(false);
        expect(agentDoc.email).toBe('jane@example.com');
      });

      it('succeeds without a recruitingInfo section in the payload', async () => {
        const a = makeApp();
        APAApplication.findOne.mockReturnValue(q(a));
        const body = changedPayload();
        delete body.recruitingInfo;
        expect((await agentReq('put', U).send(body)).status).toBe(200);
      });

      it('normalises dependent fields (explanations, bankruptcy, licensing)', async () => {
        const a = makeApp({
          complianceQuestions: Object.fromEntries(QUESTION_KEYS.map((k) => [k, { answer: false, explanation: '', documentUrl: `/doc/${k}` }]))
        });
        APAApplication.findOne.mockReturnValue(q(a));
        const body = unchangedPayload();
        body.complianceQuestions.felonyConviction = { answer: true, explanation: '  Resolved in 2015  ' };
        body.complianceQuestions.civilAction = { answer: false, explanation: 'stale text must be dropped' };
        body.financialBackground = {
          unsatisfiedJudgments: false, unsatisfiedJudgmentsExplanation: 'stale',
          unsatisfiedLiens: true, unsatisfiedLiensExplanation: 'Paid off',
          bankruptcy: { filed: false, chapter: '7', status: 'Open' }
        };
        body.licensingStatus = {
          currentlyLicensed: true, licenseTypes: ['Life'], statesLicensed: ['TX', ' ', 'FL'],
          licenseNumber: 'L-123', licenseStatus: 'Active'
        };

        const res = await agentReq('put', U).send(body);

        expect(res.status).toBe(200);
        expect(a.complianceQuestions.felonyConviction).toEqual({ answer: true, explanation: 'Resolved in 2015', documentUrl: '/doc/felonyConviction' });
        expect(a.complianceQuestions.civilAction.explanation).toBe('');
        expect(a.financialBackground.unsatisfiedJudgmentsExplanation).toBe('');
        expect(a.financialBackground.unsatisfiedLiensExplanation).toBe('Paid off');
        expect(a.financialBackground.bankruptcy).toEqual({ filed: false, chapter: null, status: null });
        expect(a.licensingStatus).toMatchObject({
          currentlyLicensed: true, licenseTypes: ['Life'], statesLicensed: ['TX', 'FL'], licenseNumber: 'L-123', licenseStatus: 'Active'
        });
      });

      it('clears licensing details when the agent is no longer licensed', async () => {
        const a = makeApp({
          licensingStatus: { currentlyLicensed: true, licenseTypes: ['Life'], statesLicensed: ['TX'], licenseNumber: 'L-1', licenseStatus: 'Active' }
        });
        APAApplication.findOne.mockReturnValue(q(a));
        const body = unchangedPayload();
        body.licensingStatus = { currentlyLicensed: false, licenseTypes: ['Life'], statesLicensed: ['TX'], licenseNumber: 'L-1', licenseStatus: 'Active' };
        expect((await agentReq('put', U).send(body)).status).toBe(200);
        expect(a.licensingStatus).toMatchObject({ currentlyLicensed: false, licenseTypes: [], statesLicensed: [], licenseNumber: '', licenseStatus: null });
      });
    });

    describe('one-shot access: a confirmed save locks the application', () => {
      it('sets status to "locked" and stamps lastEditedAt after a save with changes', async () => {
        const a = makeApp();
        APAApplication.findOne.mockReturnValue(q(a));
        const res = await agentReq('put', U).send(changedPayload());
        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/sign/i);
        expect(a.editRequest.status).toBe('locked');
        expect(a.editRequest.lastEditedAt).toBeInstanceOf(Date);
      });

      it('locks even when nothing changed, without writing an audit entry', async () => {
        const a = makeApp();
        APAApplication.findOne.mockReturnValue(q(a));
        const res = await agentReq('put', U).send(unchangedPayload());
        expect(res.status).toBe(200);
        expect(res.body.changed).toBe(0);
        expect(a.editRequest.status).toBe('locked');
        expect(a.editHistory).toHaveLength(0);
        expect(a.save).toHaveBeenCalledTimes(1);
      });

      it('rejects a second save with 403 until a new request is approved', async () => {
        const a = makeApp();
        APAApplication.findOne.mockReturnValue(q(a));

        expect((await agentReq('put', U).send(changedPayload())).status).toBe(200);
        const again = changedPayload();
        again.personalInfo.legalFirstName = 'Different';
        const second = await agentReq('put', U).send(again);

        expect(second.status).toBe(403);
        expect(a.save).toHaveBeenCalledTimes(2);
        expect(a.personalInfo.legalFirstName).toBe('Jane');
        expect(a.editHistory).toHaveLength(1);
      });

      it('allows the agent to request edit access again after being locked', async () => {
        const a = makeApp();
        APAApplication.findOne.mockReturnValue(q(a));
        await agentReq('put', U).send(changedPayload());
        expect(a.editRequest.status).toBe('locked');

        const res = await agentReq('post', `${U}/edit-request`).send({ reason: 'one more correction needed' });
        expect(res.status).toBe(200);
        expect(a.editRequest.status).toBe('pending');
      });

      it('does not lock when validation fails', async () => {
        const a = makeApp();
        APAApplication.findOne.mockReturnValue(q(a));
        const body = changedPayload();
        body.personalInfo.homeAddress.zipCode = '741101';
        expect((await agentReq('put', U).send(body)).status).toBe(400);
        expect(a.editRequest.status).toBe('approved');
      });
    });

    describe('admin notification (apa_edited)', () => {
      it('notifies each admin when something changed', async () => {
        const a = makeApp();
        APAApplication.findOne.mockReturnValue(q(a));
        await agentReq('put', U).send(changedPayload());

        const calls = notified('apa_edited');
        expect(calls.map(([n]) => n.userId).sort()).toEqual(['admin-1', 'admin-2']);
        expect(calls[0][0].link).toBe(`/admin/onboarding/${AGENT_ID}`);
        expect(calls[0][0].message).toMatch(/Jane Doe updated their APA application \(\d+ fields? changed\)/);
        expect(calls[0][0].data).toEqual({ agentId: AGENT_ID, applicationId: APP_ID });
      });

      it('does not notify when nothing changed', async () => {
        const a = makeApp();
        APAApplication.findOne.mockReturnValue(q(a));
        await agentReq('put', U).send(unchangedPayload());
        expect(notified('apa_edited')).toHaveLength(0);
      });

      it('still saves when notifying admins fails', async () => {
        const a = makeApp();
        APAApplication.findOne.mockReturnValue(q(a));
        Notification.createNotification.mockRejectedValue(new Error('push down'));
        expect((await agentReq('put', U).send(changedPayload())).status).toBe(200);
        expect(a.editRequest.status).toBe('locked');
      });
    });
  });

  // ─────────────────────────────── admin: list ───────────────────────────────
  describe('GET /api/admin/apa-applications/edit-requests', () => {
    const url = `${A}/edit-requests`;
    const row = (over = {}) => ({
      _id: APP_ID,
      userId: { _id: AGENT_ID, name: 'Jane Doe', email: 'jane@example.com' },
      personalInfo: { legalFirstName: 'Jane', legalLastName: 'Doe', email: 'jane-app@example.com' },
      editRequest: { status: 'pending', reason: 'fix dob' },
      editHistory: [],
      ...over
    });

    beforeEach(() => {
      APAApplication.find.mockReturnValue(q([row()]));
      APAApplication.aggregate.mockReturnValue(q([{ _id: 'pending', count: 2 }, { _id: 'approved', count: 1 }]));
    });

    it('requires authentication and the admin role', async () => {
      expect((await request(app).get(url)).status).toBe(401);
      expect((await agentReq('get', url)).status).toBe(403);
    });

    it('defaults to pending requests and returns counts by status', async () => {
      const res = await adminReq('get', url);
      expect(res.status).toBe(200);
      expect(APAApplication.find).toHaveBeenCalledWith({ deletedAt: null, 'editRequest.status': 'pending' });
      expect(res.body.counts).toEqual({ pending: 2, approved: 1 });
      expect(res.body.requests).toHaveLength(1);
      expect(res.body.requests[0]).toMatchObject({
        applicationId: APP_ID,
        agent: { _id: AGENT_ID, name: 'Jane Doe', email: 'jane@example.com' },
        editRequest: { status: 'pending', reason: 'fix dob' }
      });
    });

    it.each(['approved', 'denied', 'locked', 'pending'])('filters by status=%s', async (status) => {
      expect((await adminReq('get', `${url}?status=${status}`)).status).toBe(200);
      expect(APAApplication.find).toHaveBeenCalledWith({ deletedAt: null, 'editRequest.status': status });
    });

    it('status=all matches every request state (never "none")', async () => {
      expect((await adminReq('get', `${url}?status=all`)).status).toBe(200);
      expect(APAApplication.find).toHaveBeenCalledWith({
        deletedAt: null,
        'editRequest.status': { $in: ['pending', 'approved', 'denied', 'locked'] }
      });
    });

    it.each(['none', 'bogus', 'APPROVED'])('rejects invalid status "%s" with 400', async (status) => {
      const res = await adminReq('get', `${url}?status=${status}`);
      expect(res.status).toBe(400);
      expect(APAApplication.find).not.toHaveBeenCalled();
    });

    it('treats a non-string status (query-operator injection) as the default', async () => {
      const res = await adminReq('get', `${url}?status[$ne]=x`);
      expect(res.status).toBe(200);
      expect(APAApplication.find).toHaveBeenCalledWith({ deletedAt: null, 'editRequest.status': 'pending' });
    });

    it('falls back to personalInfo when the user is not populated', async () => {
      APAApplication.find.mockReturnValue(q([row({ userId: AGENT_ID })]));
      const res = await adminReq('get', url);
      expect(res.body.requests[0].agent).toEqual({ _id: AGENT_ID, name: 'Jane Doe', email: 'jane-app@example.com' });
    });

    it('returns the 10 most recent edit-history entries, newest first', async () => {
      const history = Array.from({ length: 12 }, (_, i) => ({ editedAt: `2026-01-${String(i + 1).padStart(2, '0')}`, changes: [] }));
      APAApplication.find.mockReturnValue(q([row({ editHistory: history })]));
      const res = await adminReq('get', url);
      const out = res.body.requests[0].editHistory;
      expect(out).toHaveLength(10);
      expect(out[0].editedAt).toBe('2026-01-12');
      expect(out[9].editedAt).toBe('2026-01-03');
    });

    it('returns an empty list and counts when there are no requests', async () => {
      APAApplication.find.mockReturnValue(q([]));
      APAApplication.aggregate.mockReturnValue(q([]));
      const res = await adminReq('get', url);
      expect(res.body.requests).toEqual([]);
      expect(res.body.counts).toEqual({});
    });
  });

  describe('GET /api/admin/apa-applications/by-agent/:userId/edit-request', () => {
    const url = `${A}/by-agent/${APP_ID}/edit-request`;

    it('requires the admin role', async () => {
      expect((await request(app).get(url)).status).toBe(401);
      expect((await agentReq('get', url)).status).toBe(403);
    });

    it("returns the agent's edit-request state", async () => {
      APAApplication.findOne.mockReturnValue(q({
        _id: APP_ID,
        userId: { _id: AGENT_ID, name: 'Jane Doe', email: 'jane@example.com' },
        personalInfo: { legalFirstName: 'Jane', legalLastName: 'Doe' },
        editRequest: { status: 'approved' },
        editHistory: [{ editedAt: '2026-01-01', changes: [] }]
      }));
      const res = await adminReq('get', url);
      expect(res.status).toBe(200);
      expect(APAApplication.findOne).toHaveBeenCalledWith({ userId: APP_ID, deletedAt: null });
      expect(res.body.request).toMatchObject({ applicationId: APP_ID, editRequest: { status: 'approved' } });
      expect(res.body.request.editHistory).toHaveLength(1);
    });

    it('returns request: null when the agent has no application', async () => {
      APAApplication.findOne.mockReturnValue(q(null));
      const res = await adminReq('get', url);
      expect(res.status).toBe(200);
      expect(res.body.request).toBeNull();
    });

    it('404s for a malformed user id', async () => {
      expect((await adminReq('get', `${A}/by-agent/zzz/edit-request`)).status).toBe(404);
    });
  });

  // ─────────────────────────────── admin: approve / deny / lock ───────────────────────────────
  describe('edit-access transitions', () => {
    const path = (action, id = APP_ID) => `${A}/${id}/edit-request/${action}`;
    const load = (over = {}) => {
      const a = makeApp({ editRequest: { status: 'pending', reason: 'fix dob' }, ...over });
      APAApplication.findById.mockReturnValue(q(a));
      return a;
    };

    describe.each(['approve', 'deny', 'lock'])('%s guards', (action) => {
      it('requires authentication and the admin role', async () => {
        const a = load();
        expect((await request(app).put(path(action))).status).toBe(401);
        expect((await agentReq('put', path(action))).status).toBe(403);
        expect(a.save).not.toHaveBeenCalled();
      });

      it('returns 404 for an unknown application', async () => {
        APAApplication.findById.mockReturnValue(q(null));
        expect((await adminReq('put', path(action)).send({})).status).toBe(404);
      });

      it('returns 404 for a soft-deleted application', async () => {
        load({ deletedAt: new Date() });
        expect((await adminReq('put', path(action)).send({})).status).toBe(404);
      });

      it('returns 404 for a malformed id', async () => {
        expect((await adminReq('put', path(action, 'zzz')).send({})).status).toBe(404);
      });

      it('rejects a non-string adminNote with 400', async () => {
        const a = load({ editRequest: { status: action === 'lock' ? 'approved' : 'pending' } });
        const res = await adminReq('put', path(action)).send({ adminNote: { $ne: 1 } });
        expect(res.status).toBe(400);
        expect(a.save).not.toHaveBeenCalled();
      });
    });

    describe('approve', () => {
      it.each(['none', 'pending', 'denied', 'locked'])('is allowed from "%s" and notifies the agent', async (from) => {
        const a = load({ editRequest: { status: from } });
        const res = await adminReq('put', path('approve')).send({ adminNote: '  Go ahead  ' });

        expect(res.status).toBe(200);
        expect(res.body.editRequest.status).toBe('approved');
        expect(a.editRequest.status).toBe('approved');
        expect(a.editRequest.reviewedBy).toBe(ADMIN_ID);
        expect(a.editRequest.reviewedAt).toBeInstanceOf(Date);
        expect(a.editRequest.adminNote).toBe('Go ahead');
        expect(a.save).toHaveBeenCalledTimes(1);

        const [[payload, sendEmail]] = notified('apa_edit_approved').map((c) => c);
        expect(payload.userId).toBe(AGENT_ID);
        expect(payload.link).toBe('/onboarding');
        expect(payload.message).toMatch(/locks again once you save/i);
        expect(payload.message).toContain('Go ahead');
        expect(sendEmail).toBe(true);
      });

      it('returns 400 when editing is already unlocked', async () => {
        const a = load({ editRequest: { status: 'approved' } });
        const res = await adminReq('put', path('approve')).send({});
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/cannot change edit access from "approved"/i);
        expect(a.save).not.toHaveBeenCalled();
        expect(notified('apa_edit_approved')).toHaveLength(0);
      });

      it('truncates an over-long note to 1000 characters', async () => {
        const a = load();
        await adminReq('put', path('approve')).send({ adminNote: 'n'.repeat(1500) });
        expect(a.editRequest.adminNote).toHaveLength(1000);
      });

      it('works without a body and omits the note from the notification', async () => {
        const a = load();
        const res = await adminReq('put', path('approve'));
        expect(res.status).toBe(200);
        expect(a.editRequest.adminNote).toBe('');
        expect(notified('apa_edit_approved')[0][0].message).not.toMatch(/Note from admin/);
      });

      it('notifies the linked user when only `user` (not `userId`) is set', async () => {
        load({ userId: undefined, user: 'legacy-agent-id' });
        await adminReq('put', path('approve')).send({});
        expect(notified('apa_edit_approved')[0][0].userId).toBe('legacy-agent-id');
      });

      it('skips the notification when the application has no linked user', async () => {
        const a = load({ userId: undefined, user: undefined });
        expect((await adminReq('put', path('approve')).send({})).status).toBe(200);
        expect(a.editRequest.status).toBe('approved');
        expect(Notification.createNotification).not.toHaveBeenCalled();
      });

      it('still succeeds when the notification fails', async () => {
        const a = load();
        Notification.createNotification.mockRejectedValue(new Error('push down'));
        expect((await adminReq('put', path('approve')).send({})).status).toBe(200);
        expect(a.editRequest.status).toBe('approved');
      });
    });

    describe('deny', () => {
      it('is allowed from "pending", records the reason and notifies the agent', async () => {
        const a = load();
        const res = await adminReq('put', path('deny')).send({ adminNote: 'Not needed' });

        expect(res.status).toBe(200);
        expect(a.editRequest.status).toBe('denied');
        expect(a.editRequest.adminNote).toBe('Not needed');
        expect(a.editRequest.reviewedBy).toBe(ADMIN_ID);
        const [payload] = notified('apa_edit_denied')[0];
        expect(payload.userId).toBe(AGENT_ID);
        expect(payload.message).toContain('Not needed');
      });

      it.each(['none', 'approved', 'denied', 'locked'])('returns 400 from "%s"', async (from) => {
        const a = load({ editRequest: { status: from } });
        const res = await adminReq('put', path('deny')).send({});
        expect(res.status).toBe(400);
        expect(a.save).not.toHaveBeenCalled();
        expect(a.editRequest.status).toBe(from);
        expect(notified('apa_edit_denied')).toHaveLength(0);
      });
    });

    describe('lock', () => {
      it('is allowed from "approved" and notifies the agent', async () => {
        const a = load({ editRequest: { status: 'approved' } });
        const res = await adminReq('put', path('lock')).send({});

        expect(res.status).toBe(200);
        expect(res.body.editRequest.status).toBe('locked');
        expect(a.editRequest.status).toBe('locked');
        expect(a.editRequest.reviewedBy).toBe(ADMIN_ID);
        expect(notified('apa_edit_locked')[0][0].userId).toBe(AGENT_ID);
      });

      it.each(['none', 'pending', 'denied', 'locked'])('returns 400 from "%s"', async (from) => {
        const a = load({ editRequest: { status: from } });
        const res = await adminReq('put', path('lock')).send({});
        expect(res.status).toBe(400);
        expect(a.save).not.toHaveBeenCalled();
        expect(a.editRequest.status).toBe(from);
        expect(notified('apa_edit_locked')).toHaveLength(0);
      });
    });

    describe('full cycle', () => {
      it('request → approve → edit → locked → request again', async () => {
        const a = makeApp({ editRequest: { status: 'none' } });
        APAApplication.findOne.mockReturnValue(q(a));
        APAApplication.findById.mockReturnValue(q(a));

        expect((await agentReq('put', U).send(changedPayload())).status).toBe(403);
        expect((await agentReq('post', `${U}/edit-request`).send({ reason: 'dob is wrong, please unlock' })).status).toBe(200);
        expect(a.editRequest.status).toBe('pending');
        expect((await agentReq('put', U).send(changedPayload())).status).toBe(403);

        expect((await adminReq('put', path('approve')).send({})).status).toBe(200);
        expect((await agentReq('put', U).send(changedPayload())).status).toBe(200);
        expect(a.editRequest.status).toBe('locked');
        expect((await agentReq('put', U).send(changedPayload())).status).toBe(403);

        expect((await agentReq('post', `${U}/edit-request`).send({ reason: 'one more fix please' })).status).toBe(200);
        expect(a.editRequest.status).toBe('pending');
      });
    });
  });
});
