/**
 * Advanced Income + Promotion Tracker — End-to-End Scenario Tests
 *
 * Follows the same convention as tests/production-promotion-aca.test.js:
 * real HTTP calls (supertest) against a RUNNING server + a REAL database,
 * using seeded admin/agent accounts. This is NOT part of the mocked
 * unit/integration Jest projects (jest.config.json only auto-runs
 * tests/unit/** and tests/integration/**) — run it explicitly against a
 * live/staging server:
 *
 *   TEST_API_URL=http://localhost:5000 npx jest tests/promotion-income-paid-e2e.test.js --coverage=false
 *
 * NOTE: This file has been written to match the existing live-server test
 * convention but has NOT been executed here (no live server/DB available in
 * this environment). The mocked unit tests (tests/unit/promotion-calculations.test.js)
 * and mocked integration tests (tests/integration/income-paid-routes.test.js)
 * ARE executed and passing — this file additionally validates the full
 * request/response contract and cross-feature wiring against a real DB
 * before shipping, and should be run once against staging.
 *
 * Scope note: rank-gated Builder-track promotion (e.g. "1 Advisor on your
 * team") needs a multi-level downline hierarchy that may not exist under the
 * seeded test agent. That scenario is covered by mocked unit tests instead
 * (tests/unit/promotion-calculations.test.js — evaluateTracks builder-rank
 * cases). This file focuses on what's verifiable with a single admin + agent
 * account: the Advanced Income submit → approve/reject → tracker lifecycle.
 */

const request = require('supertest');

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:5000';

const ADMIN_EMAIL = 'contracting@rhpoffice.com';
const ADMIN_PASS = 'admin123';
const AGENT_EMAIL = 'norgehernandez6047@gmail.com';
const AGENT_PASS = '123456';

let adminToken, agentToken, agentId;
const createdEntryIds = [];

beforeAll(async () => {
  const adminLogin = await request(BASE_URL)
    .post('/api/auth/login')
    .send({ email: ADMIN_EMAIL, password: ADMIN_PASS });
  adminToken = adminLogin.body.token;

  const agentLogin = await request(BASE_URL)
    .post('/api/auth/login')
    .send({ email: AGENT_EMAIL, password: AGENT_PASS });
  agentToken = agentLogin.body.token;
  agentId = agentLogin.body.user._id || agentLogin.body.user.id;
}, 30000);

afterAll(async () => {
  // Clean up any entries this suite created that are still pending/rejected
  // (approved entries are left as harmless audit trail, matching how the
  // existing production e2e suite leaves reviewed submissions in place).
  for (const id of createdEntryIds) {
    await request(BASE_URL)
      .delete(`/api/production/income-paid/${id}`)
      .set('Authorization', `Bearer ${adminToken}`);
  }
});

// ============================================================================
// 1. SUBMIT — agent creates a pending entry
// ============================================================================
describe('Advanced Income: submit', () => {
  test('agent can submit an Advanced Income entry; it starts pending', async () => {
    const res = await request(BASE_URL)
      .post('/api/production/income-paid')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ amount: 12345, datePaidByCarrier: '2026-01-01', notes: 'E2E test entry' });

    expect(res.status).toBe(201);
    expect(res.body.entry.status).toBe('pending');
    expect(res.body.entry.amount).toBe(12345);
    createdEntryIds.push(res.body.entry._id);
  });

  test('entry appears in the agent\'s own /mine list', async () => {
    const res = await request(BASE_URL)
      .get('/api/production/income-paid/mine')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.entries.map(e => e._id);
    expect(ids).toEqual(expect.arrayContaining(createdEntryIds));
  });

  test('agent cannot access the admin approval queue', async () => {
    const res = await request(BASE_URL)
      .get('/api/production/income-paid')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(403);
  });

  test('agent cannot approve their own entry', async () => {
    const entryId = createdEntryIds[0];
    const res = await request(BASE_URL)
      .put(`/api/production/income-paid/${entryId}/approve`)
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(403);
  });

  test('rejects a negative amount with a 400', async () => {
    const res = await request(BASE_URL)
      .post('/api/production/income-paid')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ amount: -50, datePaidByCarrier: '2026-01-01' });
    expect(res.status).toBe(400);
  });
});

// ============================================================================
// 2. PENDING ENTRIES DO NOT COUNT TOWARD THE TRACKER
// ============================================================================
describe('Advanced Income: pending entries are excluded from promotion income', () => {
  let pendingEntryId;

  test('create a pending entry with a large, distinctive amount', async () => {
    const res = await request(BASE_URL)
      .post('/api/production/income-paid')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ amount: 987654, datePaidByCarrier: new Date().toISOString().slice(0, 7) + '-01' });
    expect(res.status).toBe(201);
    pendingEntryId = res.body.entry._id;
    createdEntryIds.push(pendingEntryId);
  });

  test('tracker income figure does NOT yet include the pending amount', async () => {
    const res = await request(BASE_URL)
      .get('/api/promotion/tracker?window=365')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(200);
    if (res.body.hasData && res.body.producer) {
      // Only meaningful if this level has an income requirement configured;
      // otherwise targetIncome is 0 and income is always reported as 0.
      if (res.body.producer.targetIncome > 0) {
        expect(res.body.producer.income).toBeLessThan(987654);
      }
    }
  });

  test('admin approves the entry', async () => {
    const res = await request(BASE_URL)
      .put(`/api/production/income-paid/${pendingEntryId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.entry.status).toBe('approved');
  });

  test('tracker income figure now reflects the approved amount', async () => {
    const res = await request(BASE_URL)
      .get('/api/promotion/tracker?window=365')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(200);
    if (res.body.hasData && res.body.producer && res.body.producer.targetIncome > 0) {
      expect(res.body.producer.income).toBeGreaterThanOrEqual(987654);
    }
  });
});

// ============================================================================
// 3. REJECT FLOW
// ============================================================================
describe('Advanced Income: reject flow', () => {
  let rejectedEntryId;

  test('agent submits an entry', async () => {
    const res = await request(BASE_URL)
      .post('/api/production/income-paid')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ amount: 5000, datePaidByCarrier: '2026-02-01' });
    expect(res.status).toBe(201);
    rejectedEntryId = res.body.entry._id;
    createdEntryIds.push(rejectedEntryId);
  });

  test('admin rejects it with a reason', async () => {
    const res = await request(BASE_URL)
      .put(`/api/production/income-paid/${rejectedEntryId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reviewNotes: 'Does not match carrier statement' });
    expect(res.status).toBe(200);
    expect(res.body.entry.status).toBe('rejected');
    expect(res.body.entry.reviewNotes).toBe('Does not match carrier statement');
  });

  test('agent can no longer delete the rejected entry as if it were pending (owner-delete requires pending)', async () => {
    const res = await request(BASE_URL)
      .delete(`/api/production/income-paid/${rejectedEntryId}`)
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(403);
  });
});

// ============================================================================
// 4. OWNERSHIP — agent cannot delete another agent's pending entry
//    (Skipped by default: requires a second known agent account. Enable by
//    setting TEST_SECOND_AGENT_EMAIL / TEST_SECOND_AGENT_PASS.)
// ============================================================================
const SECOND_AGENT_EMAIL = process.env.TEST_SECOND_AGENT_EMAIL;
const SECOND_AGENT_PASS = process.env.TEST_SECOND_AGENT_PASS;
const maybeDescribe = SECOND_AGENT_EMAIL && SECOND_AGENT_PASS ? describe : describe.skip;

maybeDescribe('Advanced Income: cross-agent ownership', () => {
  let secondAgentToken, ownEntryId;

  beforeAll(async () => {
    const login = await request(BASE_URL)
      .post('/api/auth/login')
      .send({ email: SECOND_AGENT_EMAIL, password: SECOND_AGENT_PASS });
    secondAgentToken = login.body.token;
  });

  test('first agent creates a pending entry', async () => {
    const res = await request(BASE_URL)
      .post('/api/production/income-paid')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ amount: 1000, datePaidByCarrier: '2026-03-01' });
    expect(res.status).toBe(201);
    ownEntryId = res.body.entry._id;
    createdEntryIds.push(ownEntryId);
  });

  test("second agent cannot delete the first agent's entry", async () => {
    const res = await request(BASE_URL)
      .delete(`/api/production/income-paid/${ownEntryId}`)
      .set('Authorization', `Bearer ${secondAgentToken}`);
    expect(res.status).toBe(403);
  });
});

// ============================================================================
// 5. TRACKER RESPONSE SHAPE — new fields are present (regression guard for FE contract)
// ============================================================================
describe('Promotion tracker: new income/rank fields are present', () => {
  test('tracker response includes producer/builder income + builder rank-requirement fields', async () => {
    const res = await request(BASE_URL)
      .get('/api/promotion/tracker?window=180')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(200);
    if (res.body.hasData) {
      expect(res.body.producer).toHaveProperty('income');
      expect(res.body.producer).toHaveProperty('targetIncome');
      expect(res.body.producer).toHaveProperty('incomeProgress');
      expect(res.body.builder).toHaveProperty('income');
      expect(res.body.builder).toHaveProperty('targetIncome');
      expect(res.body.builder).toHaveProperty('requiredRanks');
      expect(res.body.builder).toHaveProperty('rankRequirementMet');
      expect(Array.isArray(res.body.builder.requiredRanks)).toBe(true);
    }
  });
});
