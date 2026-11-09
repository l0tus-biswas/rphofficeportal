import { test, expect, Page } from '@playwright/test';
import { API, as, failOnErrors } from './helpers/api';

const { USERS } = require('./helpers/users');

const U = `${API}/user/apa-application`;
const A = `${API}/admin/apa-applications`;

async function raw<T>(fn: (db: any, oid: any) => Promise<T>): Promise<T> {
  const mongoose = require('../backend/node_modules/mongoose');
  const conn = await mongoose.createConnection(process.env.E2E_MONGO || 'mongodb://localhost:27018/rph_e2e_c').asPromise();
  try { return await fn(conn.db, mongoose.Types.ObjectId); } finally { await conn.close(); }
}

/** Fresh, fully valid, already-approved APA application owned by the seeded agent. */
const seedApp = () => raw(async (db, oid) => {
  const agent = await db.collection('users').findOne({ email: USERS.agent.email });
  if (!agent) throw new Error('seeded agent missing - run e2e/seed.js first');
  await db.collection('apaapplications').deleteMany({ userId: agent._id });
  const _id = new oid();
  const answer = { answer: false, explanation: '' };
  await db.collection('apaapplications').insertOne({
    _id, userId: agent._id, user: agent._id, status: 'active',
    personalInfo: {
      legalFirstName: 'Lotus', legalLastName: 'Tester', agencyLegalName: 'N/A', gender: 'F',
      dateOfBirth: new Date('1990-01-01'), ssn: '123-45-6789', mobilePhone: '5550000002',
      email: USERS.agent.email,
      homeAddress: { street: '1 Main St', city: 'Phoenix', state: 'AZ', zipCode: '85001' },
      previouslyContracted: false
    },
    recruitingInfo: { recruiterFullName: 'Original Recruiter', recruiterAgentId: 'ORIG1', recruiterContact: 'recruiter@example.com', uplineLeaderName: 'Up Lead', teamName: 'Team A', referralCode: 'ORIG1' },
    complianceQuestions: {
      previouslyContractedOther: answer, felonyConviction: answer, misdemeanorFraud: answer,
      civilAction: answer, licenseDenied: answer, bondIssues: answer
    },
    financialBackground: { unsatisfiedJudgments: false, unsatisfiedLiens: false, bankruptcy: { filed: false, chapter: null, status: null } },
    licensingStatus: { currentlyLicensed: false, licenseTypes: [], statesLicensed: [] },
    // 'completed' without a signed PDF makes the onboarding page auto-call Zoho
    // (a 400 with no envelope), which is unrelated to what this spec tests.
    docusign: { status: 'sent' },
    editRequest: { status: 'none' }, editHistory: [],
    submittedAt: new Date(), createdAt: new Date(), updatedAt: new Date(), deletedAt: null
  });
  return String(_id);
});

const readApp = (id: string) => raw(async (db, oid) => db.collection('apaapplications').findOne({ _id: new oid(id) }));
const removeApp = (id: string) => raw(async (db, oid) => {
  await db.collection('apaapplications').deleteOne({ _id: new oid(id) });
  await db.collection('notifications').deleteMany({ $or: [{ 'data.applicationId': id }, { type: /^apa_edit/, createdAt: { $gte: new Date(Date.now() - 3600_000) } }] });
});

/** A complete, valid edit payload; `over` is shallow-merged per section. */
const payload = (over: Record<string, any> = {}) => {
  const answer = { answer: false, explanation: '' };
  return {
    personalInfo: {
      legalFirstName: 'Lotus', legalLastName: 'Tester', agencyLegalName: '', gender: 'F',
      dateOfBirth: '1991-02-03', ssn: '', mobilePhone: '5559998888',
      homeAddress: { street: '1 Main St', city: 'Phoenix', state: 'AZ', zipCode: '85001' },
      mailingAddress: null, previouslyContracted: false,
      ...(over.personalInfo || {})
    },
    complianceQuestions: {
      previouslyContractedOther: answer, felonyConviction: answer, misdemeanorFraud: answer,
      civilAction: answer, licenseDenied: answer, bondIssues: answer,
      ...(over.complianceQuestions || {})
    },
    financialBackground: { unsatisfiedJudgments: false, unsatisfiedLiens: false, bankruptcy: { filed: false }, ...(over.financialBackground || {}) },
    licensingStatus: { currentlyLicensed: false, ...(over.licensingStatus || {}) },
    ...(over.extra || {})
  };
};

const startedAt = Date.now() - 5000;

// Admin-facing notifications carry data.applicationId; agent-facing ones don't, so those match on type + recency.
async function notificationsOf(request: any, key: 'admin' | 'agent', type: string, applicationId: string) {
  const body = await (await request.get(`${API}/notifications?type=${type}&limit=100`, await as(request, key))).json();
  return (body.notifications || []).filter((n: any) => n.data?.applicationId === applicationId);
}

test.describe('F43 APA edit request (API)', () => {
  test.describe.configure({ mode: 'serial' });
  let id = '';
  let agentId = '';

  test.beforeAll(async ({ request }) => {
    id = await seedApp();
    agentId = (await (await request.get(`${API}/auth/me`, await as(request, 'agent'))).json()).user._id;
  });
  test.afterAll(async () => { if (id) await removeApp(id); });

  test('F43-A1 application is locked by default: agent PUT is 403 and nothing changes', async ({ request }) => {
    const res = await request.put(U, { ...(await as(request, 'agent')), data: payload() });
    expect(res.status()).toBe(403);
    expect((await readApp(id)).personalInfo.mobilePhone).toBe('5550000002');
  });

  test('F43-A2 only authenticated agents can use agent endpoints; only admins can use admin endpoints', async ({ request }) => {
    expect((await request.put(U, { data: payload() })).status()).toBe(401);
    expect((await request.post(`${U}/edit-request`, { data: { reason: 'please let me edit' } })).status()).toBe(401);
    const agent = await as(request, 'agent');
    expect((await request.get(`${A}/edit-requests`, agent)).status()).toBe(403);
    expect((await request.get(`${A}/edit-requests`)).status()).toBe(401);
    for (const act of ['approve', 'deny', 'lock']) {
      expect((await request.put(`${A}/${id}/edit-request/${act}`, { ...agent, data: {} })).status(), `agent ${act}`).toBe(403);
      expect((await request.put(`${A}/${id}/edit-request/${act}`, { data: {} })).status(), `anon ${act}`).toBe(401);
    }
    expect((await request.get(`${A}/by-agent/${agentId}/edit-request`, agent)).status()).toBe(403);
  });

  test('F43-R1 request needs a real reason, becomes pending, and cannot be duplicated', async ({ request }) => {
    const agent = await as(request, 'agent');
    expect((await request.post(`${U}/edit-request`, { ...agent, data: { reason: 'no' } })).status()).toBe(400);
    expect((await request.post(`${U}/edit-request`, { ...agent, data: {} })).status()).toBe(400);
    expect((await request.post(`${U}/edit-request`, { ...agent, data: { reason: 'x'.repeat(1001) } })).status()).toBe(400);

    const ok = await request.post(`${U}/edit-request`, { ...agent, data: { reason: 'My date of birth was entered wrongly' } });
    expect(ok.status()).toBe(200);
    expect((await ok.json()).editRequest.status).toBe('pending');

    expect((await request.post(`${U}/edit-request`, { ...agent, data: { reason: 'asking a second time' } })).status(), 'duplicate').toBe(400);
    expect((await request.put(U, { ...agent, data: payload() })).status(), 'still locked while pending').toBe(403);
  });

  test('F43-R2 admin sees the pending request and is notified', async ({ request }) => {
    const admin = await as(request, 'admin');
    const list = await (await request.get(`${A}/edit-requests?status=pending`, admin)).json();
    const row = list.requests.find((r: any) => r.applicationId === id);
    expect(row, 'pending request listed').toBeTruthy();
    expect(row.agent.email).toBe(USERS.agent.email);
    expect(row.editRequest.reason).toContain('date of birth');
    expect(list.counts.pending).toBeGreaterThanOrEqual(1);

    const byAgent = await (await request.get(`${A}/by-agent/${agentId}/edit-request`, admin)).json();
    expect(byAgent.request.editRequest.status).toBe('pending');

    expect((await notificationsOf(request, 'admin', 'apa_edit_requested', id)).length).toBeGreaterThanOrEqual(1);
    expect((await request.get(`${A}/edit-requests?status=bogus`, admin)).status()).toBe(400);
  });

  test('F43-D1 deny closes the request, notifies the agent, and the agent may ask again', async ({ request }) => {
    const admin = await as(request, 'admin');
    const agent = await as(request, 'agent');
    expect((await request.put(`${A}/${id}/edit-request/deny`, { ...admin, data: { adminNote: { a: 1 } } })).status(), 'note must be a string').toBe(400);
    expect((await request.put(`${A}/${id}/edit-request/deny`, { ...admin, data: { adminNote: 'Not needed' } })).status()).toBe(200);
    expect((await readApp(id)).editRequest.status).toBe('denied');
    expect((await request.put(`${A}/${id}/edit-request/deny`, { ...admin, data: {} })).status(), 'deny only works on pending').toBe(400);
    expect((await request.put(U, { ...agent, data: payload() })).status()).toBe(403);
    expect((await notificationsOf(request, 'agent', 'apa_edit_denied', id)).length).toBeGreaterThanOrEqual(1);

    expect((await request.post(`${U}/edit-request`, { ...agent, data: { reason: 'Asking again with more detail' } })).status()).toBe(200);
    expect((await readApp(id)).editRequest.status).toBe('pending');
  });

  test('F43-P1 approved agent can save once; the save validates, syncs the profile, ignores locked fields and re-locks', async ({ request }) => {
    const admin = await as(request, 'admin');
    const agent = await as(request, 'agent');
    expect((await request.put(`${A}/${id}/edit-request/approve`, { ...admin, data: { adminNote: 'Go ahead' } })).status()).toBe(200);
    expect((await notificationsOf(request, 'agent', 'apa_edit_approved', id)).length).toBeGreaterThanOrEqual(1);

    // Validation: nothing is saved and access stays open while the payload is invalid
    const bad: Array<[string, any]> = [
      ['missing sections', { personalInfo: payload().personalInfo }],
      ['future date of birth', payload({ personalInfo: { dateOfBirth: '2999-01-01' } })],
      ['non-US zip', payload({ personalInfo: { homeAddress: { street: '1 Main St', city: 'Phoenix', state: 'AZ', zipCode: '741101' } } })],
      ['bad ssn', payload({ personalInfo: { ssn: '12-34' } })],
      ['missing gender', payload({ personalInfo: { gender: '' } })],
      ['unanswered compliance question', payload({ complianceQuestions: { felonyConviction: {} } })]
    ];
    for (const [label, data] of bad) {
      expect((await request.put(U, { ...agent, data })).status(), label).toBe(400);
    }
    expect((await readApp(id)).editRequest.status, 'still open after rejected saves').toBe('approved');

    // Valid save, with hostile attempts to change locked fields
    const res = await request.put(U, {
      ...agent,
      data: payload({
        personalInfo: { ssn: '987-65-4321', email: 'hacker@example.com' },
        extra: { recruitingInfo: { recruiterFullName: 'Hacker', recruiterAgentId: 'HACK', referralCode: 'HACK' } }
      })
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).changed).toBeGreaterThan(0);

    const stored = await readApp(id);
    expect(stored.editRequest.status, 'auto-locked after save').toBe('locked');
    expect(stored.personalInfo.dateOfBirth.toISOString().slice(0, 10)).toBe('1991-02-03');
    expect(stored.personalInfo.mobilePhone).toBe('5559998888');
    expect(stored.personalInfo.ssn).toBe('987-65-4321');
    expect(stored.personalInfo.email).toBe(USERS.agent.email);
    expect(stored.recruitingInfo.referralCode).toBe('ORIG1');
    expect(stored.recruitingInfo.recruiterFullName).toBe('Original Recruiter');
    expect(stored.recruitingInfo.recruiterAgentId).toBe('ORIG1');

    const history = JSON.stringify(stored.editHistory);
    expect(stored.editHistory.length).toBe(1);
    expect(history).toContain('personalInfo.dateOfBirth');
    expect(history, 'ssn values are never written to the change log').not.toContain('987-65-4321');
    expect(history).not.toContain('123-45-6789');

    const me = (await (await request.get(`${API}/auth/me`, agent)).json()).user;
    expect(String(me.dateOfBirth).slice(0, 10)).toBe('1991-02-03');
    expect(me.phone).toBe('5559998888');
    expect(me.email).toBe(USERS.agent.email);

    expect((await notificationsOf(request, 'admin', 'apa_edited', id)).length).toBeGreaterThanOrEqual(1);

    // One-shot: the very next save is refused
    expect((await request.put(U, { ...agent, data: payload({ personalInfo: { mobilePhone: '5551112222' } }) })).status(), 'second save').toBe(403);
    expect((await readApp(id)).personalInfo.mobilePhone).toBe('5559998888');
  });

  test('F43-L1 after the lock the agent must request again; admin can unlock, re-lock, and invalid transitions are refused', async ({ request }) => {
    const admin = await as(request, 'admin');
    const agent = await as(request, 'agent');

    const again = await request.post(`${U}/edit-request`, { ...agent, data: { reason: 'One more correction needed' } });
    expect(again.status()).toBe(200);
    expect((await again.json()).editRequest.status).toBe('pending');

    expect((await request.put(`${A}/${id}/edit-request/lock`, { ...admin, data: {} })).status(), 'cannot lock a pending request').toBe(400);
    expect((await request.put(`${A}/${id}/edit-request/approve`, { ...admin, data: {} })).status()).toBe(200);
    expect((await request.post(`${U}/edit-request`, { ...agent, data: { reason: 'already unlocked, ask anyway' } })).status(), 'no request while unlocked').toBe(400);

    expect((await request.put(`${A}/${id}/edit-request/lock`, { ...admin, data: { adminNote: 'Done' } })).status()).toBe(200);
    expect((await readApp(id)).editRequest.status).toBe('locked');
    expect((await request.put(`${A}/${id}/edit-request/lock`, { ...admin, data: {} })).status(), 'lock twice').toBe(400);
    expect((await request.put(U, { ...agent, data: payload() })).status(), 'agent locked out again').toBe(403);
    expect((await notificationsOf(request, 'agent', 'apa_edit_locked', id)).length).toBeGreaterThanOrEqual(1);

    for (const act of ['approve', 'deny', 'lock']) {
      expect((await request.put(`${A}/${'b'.repeat(24)}/edit-request/${act}`, { ...admin, data: {} })).status(), act).toBe(404);
    }
  });
});

async function login(page: Page, key: 'admin' | 'agent') {
  await page.goto('/login');
  await page.getByLabel('Email Address').fill(USERS[key].email);
  await page.getByLabel('Password', { exact: true }).fill(USERS[key].password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL((url) => !/\/login/.test(url.pathname));
}

test.describe('F43 APA edit request (UI)', () => {
  test.describe.configure({ mode: 'serial' });
  let id = '';

  test.beforeAll(async () => { id = await seedApp(); });
  test.afterAll(async () => { if (id) await removeApp(id); });

  test('F43-U1 agent requests edit access from the onboarding page', async ({ page }) => {
    failOnErrors(page);
    await login(page, 'agent');
    await page.goto('/onboarding');
    await expect(page.getByTestId('apa-pending-resign')).toBeVisible();
    await expect(page.getByRole('button', { name: /request to edit/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /edit application/i })).toHaveCount(0);

    await page.getByRole('button', { name: /request to edit/i }).click();
    await page.getByRole('button', { name: /send request/i }).click();
    await expect(page.getByText(/at least 5 characters/i)).toBeVisible();

    await page.locator('textarea').fill('My date of birth was typed incorrectly');
    await page.getByRole('button', { name: /send request/i }).click();
    await expect(page.getByText(/edit request was sent to an admin/i)).toBeVisible();
    await expect(page.getByText(/awaiting admin review/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /request to edit/i })).toHaveCount(0);
    expect((await readApp(id)).editRequest.status).toBe('pending');
  });

  test('F43-U2 admin approves it from the Edit Requests tab', async ({ page }) => {
    failOnErrors(page);
    await login(page, 'admin');
    await page.goto('/admin/onboarding?tab=edit-requests');
    const row = page.getByRole('row').filter({ hasText: USERS.agent.email });
    await expect(row).toContainText('My date of birth was typed incorrectly');
    await expect(row).toContainText(/pending/i);
    await row.getByRole('button', { name: /approve/i }).click();
    await expect(page.getByText(/edit access granted/i)).toBeVisible();
    expect((await readApp(id)).editRequest.status).toBe('approved');
  });

  test('F43-U3 agent edits the form: recruiting + email are disabled, save asks for confirmation', async ({ page }) => {
    failOnErrors(page);
    await login(page, 'agent');
    await page.goto('/onboarding');
    await expect(page.getByText(/unlocked your application/i)).toBeVisible();
    await page.getByRole('link', { name: /edit application/i }).click();
    await expect(page).toHaveURL(/\/onboarding\/edit/);

    for (const name of ['email', 'recruiterFullName', 'recruiterAgentId', 'recruiterContact', 'uplineLeaderName', 'teamName', 'referralCode']) {
      await expect(page.locator(`input[formcontrolname="${name}"]`), name).toBeDisabled();
    }
    await expect(page.locator('input[formcontrolname="recruiterFullName"]')).toHaveValue('Original Recruiter');
    await expect(page.locator('input[formcontrolname="dateOfBirth"]')).toHaveValue('1990-01-01');

    // Declining the confirmation must not save anything
    page.once('dialog', (d) => { expect(d.message()).toMatch(/locked/i); d.dismiss(); });
    await page.locator('input[formcontrolname="dateOfBirth"]').fill('1991-02-03');
    await page.getByRole('button', { name: /save changes/i }).click();
    expect((await readApp(id)).personalInfo.dateOfBirth.toISOString().slice(0, 10)).toBe('1990-01-01');
    expect((await readApp(id)).editRequest.status).toBe('approved');

    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: /save changes/i }).click();
    await expect(page.getByText(/sign the updated agreement/i)).toBeVisible();

    const stored = await readApp(id);
    expect(stored.personalInfo.dateOfBirth.toISOString().slice(0, 10)).toBe('1991-02-03');
    expect(stored.editRequest.status).toBe('locked');
    expect(stored.recruitingInfo.recruiterFullName).toBe('Original Recruiter');
  });

  test('F43-U4 once saved the form is locked and the agent must sign the updated agreement', async ({ page }) => {
    failOnErrors(page);
    await login(page, 'agent');
    await page.goto('/onboarding/edit');
    await expect(page.getByTestId('awaiting-signature')).toBeVisible();
    await expect(page.getByRole('button', { name: /save changes/i })).toHaveCount(0);

    await page.goto('/onboarding');
    await expect(page.getByTestId('apa-pending-resign')).toBeVisible();
    await expect(page.getByRole('button', { name: /request to edit/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /edit application/i })).toHaveCount(0);
  });
});
