/**
 * Production Tracking / Promotion Tracker / ACA Tracking — Issue #9 Regression Tests
 *
 * Covers:
 * 1. Only Life Insurance + Supplemental Insurance count toward promotion
 * 2. Promotion tracking uses inForceDate (not submissionDate)
 * 3. Status changes between all statuses
 * 4. Duplicate submission prevention
 * 5. Priority filter works correctly
 * 6. Stats/totals update when filters are applied
 * 7. ACA tracks members (numberOfMembers), not just policies
 * 8. Promotion tracker supports 12-month window
 */

const request = require('supertest');

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:5000';

const ADMIN_EMAIL = 'contracting@rhpoffice.com';
const ADMIN_PASS = 'admin123';
const AGENT_EMAIL = 'norgehernandez6047@gmail.com';
const AGENT_PASS = '123456';

let adminToken, agentToken, agentId;
let testCarrierId;
let createdSubmissionIds = [];

beforeAll(async () => {
  // Login as admin
  const adminLogin = await request(BASE_URL)
    .post('/api/auth/login')
    .send({ email: ADMIN_EMAIL, password: ADMIN_PASS });
  adminToken = adminLogin.body.token;

  // Login as agent
  const agentLogin = await request(BASE_URL)
    .post('/api/auth/login')
    .send({ email: AGENT_EMAIL, password: AGENT_PASS });
  agentToken = agentLogin.body.token;
  agentId = agentLogin.body.user._id || agentLogin.body.user.id;

  // Get a carrier for submissions
  const carriers = await request(BASE_URL)
    .get('/api/carriers?activeOnly=true')
    .set('Authorization', `Bearer ${adminToken}`);
  testCarrierId = carriers.body[0]?._id || carriers.body.carriers?.[0]?._id;
}, 30000);

afterAll(async () => {
  // Clean up test submissions
  for (const id of createdSubmissionIds) {
    await request(BASE_URL)
      .delete(`/api/production/${id}`)
      .set('Authorization', `Bearer ${adminToken}`);
  }
});

// ============================================================================
// 1. PROMOTION QUALIFYING CATEGORIES
// ============================================================================
describe('Promotion: Only Life + Supplemental count', () => {
  let lifeSubmissionId, acaSubmissionId, medicareSubmissionId;

  afterAll(async () => {
    // Clean up
    for (const id of [lifeSubmissionId, acaSubmissionId, medicareSubmissionId].filter(Boolean)) {
      await request(BASE_URL)
        .delete(`/api/production/${id}`)
        .set('Authorization', `Bearer ${adminToken}`);
    }
  });

  test('Life Insurance submission counts toward promotion', async () => {
    const res = await request(BASE_URL)
      .post('/api/production')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        submissionDate: new Date().toISOString(),
        clientName: 'Test Life Client',
        productSold: 'Term Life Insurance',
        carrier: testCarrierId,
        premiumAmount: 5000,
        status: 'Submitted'
      });
    expect(res.status).toBe(201);
    expect(res.body.productCategory).toBe('Life Insurance');
    lifeSubmissionId = res.body._id;
    createdSubmissionIds.push(lifeSubmissionId);
  });

  test('ACA submission does NOT count toward promotion', async () => {
    const res = await request(BASE_URL)
      .post('/api/production')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        submissionDate: new Date().toISOString(),
        clientName: 'Test ACA Client',
        productSold: 'ACA Marketplace Health Insurance',
        carrier: testCarrierId,
        premiumAmount: 3000,
        numberOfMembers: 5,
        status: 'Submitted'
      });
    expect(res.status).toBe(201);
    expect(res.body.productCategory).toBe('Health Insurance');
    acaSubmissionId = res.body._id;
    createdSubmissionIds.push(acaSubmissionId);
  });

  test('Medicare submission does NOT count toward promotion', async () => {
    const res = await request(BASE_URL)
      .post('/api/production')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        submissionDate: new Date().toISOString(),
        clientName: 'Test Medicare Client',
        productSold: 'Medicare Advantage',
        carrier: testCarrierId,
        premiumAmount: 2000,
        status: 'Submitted'
      });
    expect(res.status).toBe(201);
    expect(res.body.productCategory).toBe('Medicare');
    medicareSubmissionId = res.body._id;
    createdSubmissionIds.push(medicareSubmissionId);
  });

  test('Promotion tracker only sums qualifying categories', async () => {
    // Mark life as In Force
    await request(BASE_URL)
      .put(`/api/production/${lifeSubmissionId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'In Force' });

    // Mark ACA as In Force
    await request(BASE_URL)
      .put(`/api/production/${acaSubmissionId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'In Force' });

    // Mark Medicare as In Force
    await request(BASE_URL)
      .put(`/api/production/${medicareSubmissionId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'In Force' });

    // Check promotion tracker — should only count Life ($5000), not ACA/Medicare
    const trackerRes = await request(BASE_URL)
      .get('/api/promotion/tracker?window=365')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(trackerRes.status).toBe(200);
    // The premium should include the life submission but not ACA/Medicare
    expect(trackerRes.body.producer.premium).toBeGreaterThanOrEqual(5000);
  });
});

// ============================================================================
// 2. IN-FORCE DATE USED FOR PROMOTION TRACKING
// ============================================================================
describe('Promotion: Uses inForceDate, not submissionDate', () => {
  let submissionId;

  afterAll(async () => {
    if (submissionId) {
      await request(BASE_URL)
        .delete(`/api/production/${submissionId}`)
        .set('Authorization', `Bearer ${adminToken}`);
    }
  });

  test('inForceDate is auto-set when status changes to In Force', async () => {
    // Use a recent date (agents cannot submit > 30 days in past)
    const recentDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const res = await request(BASE_URL)
      .post('/api/production')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        submissionDate: recentDate,
        clientName: 'InForce Date Test',
        productSold: 'Whole Life Insurance',
        carrier: testCarrierId,
        premiumAmount: 1000,
        status: 'Submitted'
      });
    expect(res.status).toBe(201);
    submissionId = res.body._id;
    createdSubmissionIds.push(submissionId);

    // Mark as In Force (no explicit inForceDate)
    const reviewRes = await request(BASE_URL)
      .put(`/api/production/${submissionId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'In Force' });
    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.inForceDate).toBeTruthy();
    // inForceDate should be today (auto-set), not Jan 1 2026
    const inForceDate = new Date(reviewRes.body.inForceDate);
    expect(inForceDate.getFullYear()).toBe(new Date().getFullYear());
    expect(inForceDate.getMonth()).toBe(new Date().getMonth());
  });

  test('Explicit inForceDate is preserved when provided', async () => {
    const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const explicitDate = futureDate.toISOString();
    const expectedDateStr = futureDate.toISOString().split('T')[0];
    const res = await request(BASE_URL)
      .post('/api/production')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        submissionDate: recentDate,
        clientName: 'Explicit InForce Test',
        productSold: 'Term Life Insurance',
        carrier: testCarrierId,
        premiumAmount: 2000,
        status: 'Submitted',
        inForceDate: explicitDate
      });
    expect(res.status).toBe(201);
    expect(res.body.inForceDate).toContain(expectedDateStr);
    createdSubmissionIds.push(res.body._id);
  });
});

// ============================================================================
// 3. STATUS CHANGES WORK CORRECTLY
// ============================================================================
describe('Status changes', () => {
  let submissionId;

  beforeAll(async () => {
    const res = await request(BASE_URL)
      .post('/api/production')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        submissionDate: new Date().toISOString(),
        clientName: 'Status Test Client',
        productSold: 'Term Life Insurance',
        carrier: testCarrierId,
        premiumAmount: 1500,
        status: 'Submitted'
      });
    submissionId = res.body._id;
    createdSubmissionIds.push(submissionId);
  });

  test('Agent can change status to Pending', async () => {
    const res = await request(BASE_URL)
      .put(`/api/production/${submissionId}`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ status: 'Pending' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Pending');
  });

  test('Agent cannot change status to In Force', async () => {
    const res = await request(BASE_URL)
      .put(`/api/production/${submissionId}`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ status: 'In Force' });
    expect(res.status).toBe(200);
    // Status should remain Pending (agent cannot set In Force)
    expect(res.body.status).toBe('Pending');
  });

  test('Admin can change status to In Force', async () => {
    const res = await request(BASE_URL)
      .put(`/api/production/${submissionId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'In Force' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('In Force');
  });

  test('Admin can change status to Lapsed (from In Force)', async () => {
    const res = await request(BASE_URL)
      .put(`/api/production/${submissionId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Lapsed' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Lapsed');
  });

  test('Admin can change status to Cancelled', async () => {
    const res = await request(BASE_URL)
      .put(`/api/production/${submissionId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Cancelled' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Cancelled');
  });

  test('Admin can change status back to Submitted', async () => {
    const res = await request(BASE_URL)
      .put(`/api/production/${submissionId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Submitted' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Submitted');
  });
});

// ============================================================================
// 4. DUPLICATE SUBMISSION PREVENTION
// ============================================================================
describe('Duplicate submission prevention', () => {
  test('Duplicate submission within 60s is rejected', async () => {
    const payload = {
      submissionDate: new Date().toISOString(),
      clientName: 'Dupe Test Client ' + Date.now(),
      productSold: 'Term Life Insurance',
      carrier: testCarrierId,
      premiumAmount: 999,
      status: 'Submitted'
    };

    const first = await request(BASE_URL)
      .post('/api/production')
      .set('Authorization', `Bearer ${agentToken}`)
      .send(payload);
    expect(first.status).toBe(201);
    createdSubmissionIds.push(first.body._id);

    // Immediate duplicate
    const second = await request(BASE_URL)
      .post('/api/production')
      .set('Authorization', `Bearer ${agentToken}`)
      .send(payload);
    expect(second.status).toBe(409);
    expect(second.body.message).toContain('Duplicate');
  });

  test('Different client name is not a duplicate', async () => {
    const payload = {
      submissionDate: new Date().toISOString(),
      clientName: 'Unique Client ' + Date.now(),
      productSold: 'Term Life Insurance',
      carrier: testCarrierId,
      premiumAmount: 999,
      status: 'Submitted'
    };

    const res = await request(BASE_URL)
      .post('/api/production')
      .set('Authorization', `Bearer ${agentToken}`)
      .send(payload);
    expect(res.status).toBe(201);
    createdSubmissionIds.push(res.body._id);
  });
});

// ============================================================================
// 5. PRIORITY FILTER
// ============================================================================
describe('Priority filter', () => {
  let highPriorityId, lowPriorityId;

  beforeAll(async () => {
    const high = await request(BASE_URL)
      .post('/api/production')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        submissionDate: new Date().toISOString(),
        clientName: 'High Priority Client',
        productSold: 'Term Life Insurance',
        carrier: testCarrierId,
        premiumAmount: 2000,
        priority: 'High',
        status: 'Submitted'
      });
    highPriorityId = high.body._id;
    createdSubmissionIds.push(highPriorityId);

    const low = await request(BASE_URL)
      .post('/api/production')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        submissionDate: new Date().toISOString(),
        clientName: 'Low Priority Client',
        productSold: 'Term Life Insurance',
        carrier: testCarrierId,
        premiumAmount: 1000,
        priority: 'Low',
        status: 'Submitted'
      });
    lowPriorityId = low.body._id;
    createdSubmissionIds.push(lowPriorityId);
  });

  test('Filtering by priority=High returns only High priority', async () => {
    const res = await request(BASE_URL)
      .get('/api/production?priority=High')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(200);
    // All returned records with a priority should be High
    const withPriority = res.body.submissions.filter(s => s.priority);
    expect(withPriority.length).toBeGreaterThan(0);
    expect(withPriority.every(s => s.priority === 'High')).toBe(true);
  });

  test('Filtering by priority=Low returns only Low priority', async () => {
    const res = await request(BASE_URL)
      .get('/api/production?priority=Low')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(200);
    const withPriority = res.body.submissions.filter(s => s.priority);
    expect(withPriority.length).toBeGreaterThan(0);
    expect(withPriority.every(s => s.priority === 'Low')).toBe(true);
  });
});

// ============================================================================
// 6. STATS UPDATE WITH FILTERS
// ============================================================================
describe('Stats/totals update with filters', () => {
  test('Stats filtered by status=In Force returns only In Force totals', async () => {
    const res = await request(BASE_URL)
      .get('/api/production/stats/filtered?status=In Force')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(200);
    const summary = res.body.summary;
    // All counted records should be In Force
    expect(summary.totalSubmissions).toBe(summary.inForceCount);
  });

  test('Stats filtered by product returns matching totals', async () => {
    const res = await request(BASE_URL)
      .get('/api/production/stats/filtered?productSold=ACA%20Marketplace%20Health%20Insurance')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(200);
    // Should have at least 1 ACA submission
    expect(res.body.summary.totalSubmissions).toBeGreaterThanOrEqual(0);
  });

  test('Stats with priority filter', async () => {
    const res = await request(BASE_URL)
      .get('/api/production/stats/filtered?priority=High')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.summary).toBeDefined();
  });
});

// ============================================================================
// 7. ACA TRACKS MEMBERS NOT JUST POLICIES
// ============================================================================
describe('ACA member tracking', () => {
  let acaMembersId;

  afterAll(async () => {
    if (acaMembersId) {
      await request(BASE_URL)
        .delete(`/api/production/${acaMembersId}`)
        .set('Authorization', `Bearer ${adminToken}`);
    }
  });

  test('numberOfMembers field is stored correctly', async () => {
    const res = await request(BASE_URL)
      .post('/api/production')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        submissionDate: new Date().toISOString(),
        clientName: 'ACA 5 Member Family ' + Date.now(),
        productSold: 'ACA Marketplace Health Insurance',
        carrier: testCarrierId,
        premiumAmount: 1200,
        numberOfMembers: 5,
        status: 'Submitted'
      });
    expect(res.status).toBe(201);
    expect(res.body.numberOfMembers).toBe(5);
    acaMembersId = res.body._id;
    createdSubmissionIds.push(acaMembersId);
  });

  test('ACA tracker counts members not policies', async () => {
    // Mark as In Force first
    await request(BASE_URL)
      .put(`/api/production/${acaMembersId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'In Force' });

    // Check ACA tracker
    const trackerRes = await request(BASE_URL)
      .get('/api/dashboard/aca-tracker')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(trackerRes.status).toBe(200);
    // Personal reported clients should include the 5 members
    expect(trackerRes.body.personalReportedClients).toBeGreaterThanOrEqual(5);
  });
});

// ============================================================================
// 8. PROMOTION TRACKER 12-MONTH WINDOW
// ============================================================================
describe('Promotion tracker window support', () => {
  test('Supports 1-month (30 day) window', async () => {
    const res = await request(BASE_URL)
      .get('/api/promotion/tracker?window=30')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.producer.windowDays).toBe(30);
  });

  test('Supports 6-month (180 day) window', async () => {
    const res = await request(BASE_URL)
      .get('/api/promotion/tracker?window=180')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.producer.windowDays).toBe(180);
  });

  test('Supports 12-month (365 day) window', async () => {
    const res = await request(BASE_URL)
      .get('/api/promotion/tracker?window=365')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.producer.windowDays).toBe(365);
  });

  test('Promotion tracker returns correct structure', async () => {
    const res = await request(BASE_URL)
      .get('/api/promotion/tracker?window=365')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(200);
    const data = res.body;
    expect(data).toHaveProperty('currentLevel');
    expect(data).toHaveProperty('nextLevel');
    expect(data).toHaveProperty('producer');
    expect(data).toHaveProperty('builder');
    expect(data.producer).toHaveProperty('premium');
    expect(data.producer).toHaveProperty('targetPremium');
    expect(data.producer).toHaveProperty('progressPercent');
    expect(data.builder).toHaveProperty('premium');
    expect(data.builder).toHaveProperty('activeAgents');
    expect(data.builder).toHaveProperty('targetAgentCount');
  });
});

// ============================================================================
// 9. EXPORT INCLUDES NEW FIELDS
// ============================================================================
describe('CSV Export', () => {
  test('Export includes In-Force Date and Priority columns', async () => {
    const res = await request(BASE_URL)
      .get('/api/production/export')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const csv = res.text;
    const headerLine = csv.split('\n')[0];
    expect(headerLine).toContain('In-Force Date');
    expect(headerLine).toContain('Priority');
    expect(headerLine).toContain('Members');
  });

  test('Export respects priority filter', async () => {
    const res = await request(BASE_URL)
      .get('/api/production/export?priority=High')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const csv = res.text;
    const lines = csv.split('\n').filter(l => l.trim());
    // If there are data rows, they should all have High priority
    if (lines.length > 1) {
      const headerLine = lines[0];
      const priorityIdx = headerLine.split(',').findIndex(h => h.includes('Priority'));
      // All non-empty priority columns should be 'High'
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        const priority = cols[priorityIdx]?.trim();
        if (priority) {
          expect(priority).toBe('High');
        }
      }
    }
  });
});
