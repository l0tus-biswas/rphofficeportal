import { test, expect } from '@playwright/test';
import { API, as } from './helpers/api';

const { USERS } = require('./helpers/users');

const U = `${API}/user/apa-application`;
const A = `${API}/admin/apa-applications`;

async function raw<T>(fn: (db: any, oid: any) => Promise<T>): Promise<T> {
  const mongoose = require('../backend/node_modules/mongoose');
  const conn = await mongoose.createConnection(process.env.E2E_MONGO || 'mongodb://localhost:27018/rph_e2e_c').asPromise();
  try { return await fn(conn.db, mongoose.Types.ObjectId); } finally { await conn.close(); }
}

// Adds a NEW approved application for the seeded agent. Nothing existing is deleted:
// the agent's newest application is the one the API acts on.
const seedApp = () => raw(async (db, oid) => {
  const agent = await db.collection('users').findOne({ email: USERS.agent.email });
  if (!agent) throw new Error('seeded agent missing - run e2e/seed.js first');
  const _id = new oid();
  const answer = { answer: false, explanation: '' };
  const now = new Date(Date.now() + 1000);
  await db.collection('apaapplications').insertOne({
    _id, userId: agent._id, user: agent._id, status: 'active',
    personalInfo: {
      legalFirstName: 'Reject', legalLastName: 'Flow', agencyLegalName: 'N/A', gender: 'F',
      dateOfBirth: new Date('1990-01-01'), ssn: '123-45-6789', mobilePhone: '5550000002',
      email: USERS.agent.email,
      homeAddress: { street: '1 Main St', city: 'Phoenix', state: 'AZ', zipCode: '85001' },
      previouslyContracted: false
    },
    recruitingInfo: { recruiterFullName: 'Original Recruiter', recruiterContact: 'recruiter@example.com', referralCode: 'ORIG1' },
    complianceQuestions: {
      previouslyContractedOther: answer, felonyConviction: answer, misdemeanorFraud: answer,
      civilAction: answer, licenseDenied: answer, bondIssues: answer
    },
    financialBackground: { unsatisfiedJudgments: false, unsatisfiedLiens: false, bankruptcy: { filed: false, chapter: null, status: null } },
    licensingStatus: { currentlyLicensed: false, licenseTypes: [], statesLicensed: [] },
    docusign: { status: 'sent', documentUrl: '/uploads/apa-signed/original.pdf' },
    editRequest: { status: 'none' }, editHistory: [], versions: [], currentVersion: 1, currentVersionReason: 'original',
    submittedAt: now, createdAt: now, updatedAt: now, deletedAt: null
  });
  return String(_id);
});

const readApp = (id: string) => raw(async (db, oid) => db.collection('apaapplications').findOne({ _id: new oid(id) }));

const payload = (over: Record<string, any> = {}) => {
  const answer = { answer: false, explanation: '' };
  return {
    personalInfo: {
      legalFirstName: 'Reject', legalLastName: 'Flow', agencyLegalName: '', gender: 'F',
      dateOfBirth: '1991-02-03', ssn: '', mobilePhone: '5559998888',
      homeAddress: { street: '1 Main St', city: 'Phoenix', state: 'AZ', zipCode: '85001' },
      mailingAddress: null, previouslyContracted: false, ...over
    },
    complianceQuestions: {
      previouslyContractedOther: answer, felonyConviction: answer, misdemeanorFraud: answer,
      civilAction: answer, licenseDenied: answer, bondIssues: answer
    },
    financialBackground: { unsatisfiedJudgments: false, unsatisfiedLiens: false, bankruptcy: { filed: false } },
    licensingStatus: { currentlyLicensed: false },
    recruitingInfo: { recruiterFullName: 'HACKED' }
  };
};

test.describe('F44 APA rejection, re-sign and version history (API)', () => {
  test.describe.configure({ mode: 'serial' });
  let id = '';

  test.beforeAll(async () => { id = await seedApp(); });

  test('F44-1 an active application with no edit access cannot be edited', async ({ request }) => {
    const res = await request.put(U, { ...(await as(request, 'agent')), data: payload() });
    expect(res.status()).toBe(403);
  });

  test('F44-2 admin rejection needs a reason; the agent can then edit without an edit request', async ({ request }) => {
    const admin = await as(request, 'admin');
    expect((await request.put(`${A}/${id}/reject`, { ...admin, data: { reason: '  ' } })).status()).toBe(400);
    const rej = await request.put(`${A}/${id}/reject`, { ...admin, data: { reason: 'Date of birth is wrong' } });
    expect(rej.status()).toBe(200);
    const app = await readApp(id);
    expect(app.status).toBe('rejected');
    expect(app.rejectionReason).toBe('Date of birth is wrong');

    const mine = await (await request.get(U, await as(request, 'agent'))).json();
    expect(mine.application.status).toBe('rejected');
    expect(mine.application.rejectionReason).toBe('Date of birth is wrong');
  });

  test('F44-3 resubmitting versions the application and requires a new signature', async ({ request }) => {
    const res = await request.put(U, { ...(await as(request, 'agent')), data: payload() });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.resignRequired).toBe(true);
    expect(body.version).toBe(2);

    const app = await readApp(id);
    expect(app.status).toBe('pending_resignature');
    expect(app.currentVersion).toBe(2);
    expect(app.currentVersionReason).toBe('rejection_resubmit');
    expect(app.rejectionReason).toBeFalsy();
    expect(app.personalInfo.mobilePhone).toBe('5559998888');
    expect(app.recruitingInfo.recruiterFullName, 'recruiting stays locked').toBe('Original Recruiter');
    expect(app.versions).toHaveLength(1);
    expect(app.versions[0].snapshot.personalInfo.mobilePhone).toBe('5550000002');
    expect(app.versions[0].rejectionReason).toBe('Date of birth is wrong');
    expect(JSON.stringify(app.versions[0].snapshot)).not.toContain('123-45-6789');
  });

  test('F44-4 while the new signature is pending: no further edits, no approve/reject', async ({ request }) => {
    expect((await request.put(U, { ...(await as(request, 'agent')), data: payload() })).status()).toBe(403);
    const admin = await as(request, 'admin');
    expect((await request.put(`${A}/${id}/approve`, { ...admin, data: {} })).status()).toBe(400);
    expect((await request.put(`${A}/${id}/reject`, { ...admin, data: { reason: 'x' } })).status()).toBe(400);
  });

  test('F44-5 version history is visible to the agent and the admin only', async ({ request }) => {
    const agentHist = await (await request.get(`${U}/versions`, await as(request, 'agent'))).json();
    expect(agentHist.versions.map((v: any) => v.version)).toEqual([2, 1]);
    expect(agentHist.versions[0].isCurrent).toBe(true);

    const adminHist = await (await request.get(`${A}/${id}/versions`, await as(request, 'admin'))).json();
    expect(adminHist.currentVersion).toBe(2);
    expect((await request.get(`${A}/${id}/versions`, await as(request, 'agent'))).status()).toBe(403);
    expect((await request.get(`${U}/versions`)).status()).toBe(401);
  });

  test('F44-6 once re-signed (pending_review) the admin re-approves it', async ({ request }) => {
    // Stand-in for the Zoho webhook, which cannot fire in the local e2e environment.
    await raw(async (db, oid) => db.collection('apaapplications').updateOne(
      { _id: new oid(id) },
      { $set: { status: 'pending_review', 'resign.required': false, 'docusign.status': 'completed' } }
    ));
    const ok = await request.put(`${A}/${id}/approve`, { ...(await as(request, 'admin')), data: {} });
    expect(ok.status()).toBe(200);
    expect((await readApp(id)).status).toBe('active');
  });
});
