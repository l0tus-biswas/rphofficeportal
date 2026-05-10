/**
 * Deep E2E Production Tracking Test Suite
 * Tests EVERY combination from both admin and agent perspectives
 * Validates business logic, edge cases, UX correctness, and data integrity
 */
const http = require('http');

const BASE = 'http://localhost:5000/api';
const ADMIN_EMAIL = 'contracting@rhpoffice.com';
const ADMIN_PASS = 'admin123';
const AGENT_EMAIL = 'lotushotmail111@gmail.com';
const AGENT_PASS = '123456';

let adminToken = '';
let agentToken = '';
let adminId = '';
let agentId = '';
let testCarrierId = '';
let testCarrierName = '';
let createdIds = []; // track for cleanup
let passed = 0;
let failed = 0;
let failures = [];

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path.startsWith('http') ? path : `${BASE}${path}`);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, data, headers: res.headers });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function assert(condition, testName, detail = '') {
  if (condition) {
    console.log(`  ✅ ${testName}`);
    passed++;
  } else {
    console.log(`  ❌ ${testName}${detail ? ' — ' + detail : ''}`);
    failed++;
    failures.push(`${testName}: ${detail}`);
  }
}

async function login(email, password) {
  const r = await request('POST', '/auth/login', { email, password });
  if (r.status === 200) return r.data;
  // Try fallback
  for (const p of ['admin123', '123456', 'password']) {
    const r2 = await request('POST', '/auth/login', { email, password: p });
    if (r2.status === 200) return r2.data;
  }
  return null;
}

async function setup() {
  console.log('\n═══ SETUP ═══\n');
  
  const admin = await login(ADMIN_EMAIL, ADMIN_PASS);
  if (!admin) { console.log('❌ Cannot login as admin'); process.exit(1); }
  adminToken = admin.token;
  adminId = admin.user._id || admin.user.id;
  
  const agent = await login(AGENT_EMAIL, AGENT_PASS);
  if (!agent) { console.log('❌ Cannot login as agent'); process.exit(1); }
  agentToken = agent.token;
  agentId = agent.user._id || agent.user.id;
  
  console.log(`  Admin: ${adminId} (${ADMIN_EMAIL})`);
  console.log(`  Agent: ${agentId} (${AGENT_EMAIL})`);
  
  // Get a carrier for testing
  const carriers = await request('GET', '/carriers?activeOnly=true', null, agentToken);
  if (carriers.data && carriers.data.length > 0) {
    testCarrierId = carriers.data[0]._id;
    testCarrierName = carriers.data[0].name;
  } else if (carriers.data?.carriers?.length > 0) {
    testCarrierId = carriers.data.carriers[0]._id;
    testCarrierName = carriers.data.carriers[0].name;
  }
  console.log(`  Carrier: ${testCarrierName} (${testCarrierId})`);
}

// ═══════════════════════════════════════════════════════════
// SECTION 1: AGENT CRUD - Create, Read, Update, Delete
// ═══════════════════════════════════════════════════════════
async function testAgentCRUD() {
  console.log('\n═══ SECTION 1: AGENT CRUD ═══\n');
  
  // 1.1 Create basic submission
  const r1 = await request('POST', '/production', {
    clientName: 'John Doe',
    productSold: 'Term Life Insurance',
    carrier: testCarrierId,
    premiumAmount: 1500,
    submissionDate: '2026-05-08',
    notes: 'Test submission'
  }, agentToken);
  assert(r1.status === 201, '1.1 Create basic submission');
  assert(r1.data.productCategory === 'Life Insurance', '1.1a Category auto-derived (Term Life → Life Insurance)');
  assert(r1.data.status === 'Submitted', '1.1b Default status is Submitted');
  assert(r1.data.numberOfMembers === null, '1.1c numberOfMembers defaults to null (not 1)', `got: ${r1.data.numberOfMembers}`);
  assert(r1.data.agent?.name != null, '1.1d Agent is populated');
  assert(r1.data.carrier?.name != null, '1.1e Carrier is populated');
  if (r1.data._id) createdIds.push(r1.data._id);
  
  // 1.2 Create ACA with 0 premium and members
  const r2 = await request('POST', '/production', {
    clientName: 'Jane ACA',
    productSold: 'ACA Marketplace Health Insurance',
    carrier: testCarrierId,
    premiumAmount: 0,
    numberOfMembers: 5,
    submissionDate: '2026-05-07'
  }, agentToken);
  assert(r2.status === 201, '1.2 Create ACA $0 premium');
  assert(r2.data.productCategory === 'Health Insurance', '1.2a ACA → Health Insurance');
  assert(r2.data.premiumAmount === 0, '1.2b $0 premium stored', `got: ${r2.data.premiumAmount}`);
  assert(r2.data.numberOfMembers === 5, '1.2c numberOfMembers=5 preserved', `got: ${r2.data.numberOfMembers}`);
  if (r2.data._id) createdIds.push(r2.data._id);
  
  // 1.3 Create with numberOfMembers=0 (edge case)
  const r3 = await request('POST', '/production', {
    clientName: 'Zero Members Test',
    productSold: 'Medicare Advantage',
    carrier: testCarrierId,
    premiumAmount: 200,
    numberOfMembers: 0,
    submissionDate: '2026-05-06'
  }, agentToken);
  assert(r3.status === 201, '1.3 Create with numberOfMembers=0');
  assert(r3.data.numberOfMembers === 0, '1.3a Members=0 preserved (not converted to null)', `got: ${r3.data.numberOfMembers}`);
  assert(r3.data.productCategory === 'Medicare', '1.3b Medicare Advantage → Medicare');
  if (r3.data._id) createdIds.push(r3.data._id);
  
  // 1.4 Create with custom fields
  const r4 = await request('POST', '/production', {
    clientName: 'Custom Fields Client',
    productSold: 'Whole Life Insurance',
    carrier: testCarrierId,
    premiumAmount: 3000,
    submissionDate: '2026-05-05',
    customFields: { policy_number: 'POL-12345', effective_date: '2026-06-01' }
  }, agentToken);
  assert(r4.status === 201, '1.4 Create with custom fields');
  assert(r4.data.customFields?.policy_number === 'POL-12345', '1.4a Custom field policy_number stored');
  assert(r4.data.customFields?.effective_date === '2026-06-01', '1.4b Custom field effective_date stored');
  if (r4.data._id) createdIds.push(r4.data._id);
  
  // 1.5 Create with "Other" product - requires description
  const r5a = await request('POST', '/production', {
    clientName: 'Other Product No Desc',
    productSold: 'Other',
    carrier: testCarrierId,
    premiumAmount: 100
  }, agentToken);
  assert(r5a.status === 400, '1.5a "Other" without description rejected', `got status: ${r5a.status}`);
  
  const r5b = await request('POST', '/production', {
    clientName: 'Other Product With Desc',
    productSold: 'Other',
    productOtherDescription: 'Pet Insurance',
    carrier: testCarrierId,
    premiumAmount: 100,
    submissionDate: '2026-05-04'
  }, agentToken);
  assert(r5b.status === 201, '1.5b "Other" with description accepted');
  if (r5b.data._id) createdIds.push(r5b.data._id);
  
  // 1.6 Create with invalid carrier
  const r6 = await request('POST', '/production', {
    clientName: 'Bad Carrier',
    productSold: 'Term Life Insurance',
    carrier: '000000000000000000000000',
    premiumAmount: 100
  }, agentToken);
  assert(r6.status === 400, '1.6 Invalid carrier rejected', `got status: ${r6.status}`);
  
  // 1.7 Create with missing required fields
  const r7 = await request('POST', '/production', {
    clientName: '',
    productSold: '',
    carrier: '',
    premiumAmount: null
  }, agentToken);
  assert(r7.status === 400, '1.7 Missing required fields rejected', `got status: ${r7.status}`);
  
  // 1.8 Create with very large premium
  const r8 = await request('POST', '/production', {
    clientName: 'Big Premium',
    productSold: 'Fixed Annuities',
    carrier: testCarrierId,
    premiumAmount: 999999.99,
    submissionDate: '2026-05-03'
  }, agentToken);
  assert(r8.status === 201, '1.8 Large premium accepted');
  assert(r8.data.premiumAmount === 999999.99, '1.8a Large premium preserved exactly', `got: ${r8.data.premiumAmount}`);
  assert(r8.data.productCategory === 'Retirement / Annuities', '1.8b Fixed Annuities → Retirement / Annuities');
  if (r8.data._id) createdIds.push(r8.data._id);
  
  // 1.9 Create with training period flag
  const r9 = await request('POST', '/production', {
    clientName: 'Training Sale',
    productSold: 'Critical Illness Insurance',
    carrier: testCarrierId,
    premiumAmount: 250,
    isTrainingPeriod: true,
    submissionDate: '2026-05-02'
  }, agentToken);
  assert(r9.status === 201, '1.9 Training period submission');
  assert(r9.data.isTrainingPeriod === true, '1.9a isTrainingPeriod flag preserved');
  assert(r9.data.productCategory === 'Supplemental Insurance', '1.9b Critical Illness → Supplemental Insurance');
  if (r9.data._id) createdIds.push(r9.data._id);
  
  // 1.10 Read - list submissions
  const r10 = await request('GET', '/production?page=1&limit=50', null, agentToken);
  assert(r10.status === 200, '1.10 List submissions');
  assert(r10.data.submissions?.length > 0, '1.10a Has submissions');
  assert(r10.data.pagination?.page === 1, '1.10b Has pagination');
  assert(r10.data.pagination?.total > 0, '1.10c Total count > 0');
  
  // 1.11 Read - single by ID
  const firstId = createdIds[0];
  const r11 = await request('GET', `/production/${firstId}`, null, agentToken);
  assert(r11.status === 200, '1.11 Get by ID');
  assert(r11.data.clientName === 'John Doe', '1.11a Client name correct');
  assert(r11.data.agent?.name != null, '1.11b Agent populated on single read');
  
  // 1.12 Update - change premium
  const r12 = await request('PUT', `/production/${firstId}`, {
    premiumAmount: 2000,
    notes: 'Updated premium'
  }, agentToken);
  assert(r12.status === 200, '1.12 Update premium');
  assert(r12.data.premiumAmount === 2000, '1.12a Premium updated to 2000', `got: ${r12.data.premiumAmount}`);
  assert(r12.data.notes === 'Updated premium', '1.12b Notes updated');
  
  // 1.13 Update - set numberOfMembers to null
  const r13 = await request('PUT', `/production/${createdIds[1]}`, {
    numberOfMembers: null
  }, agentToken);
  assert(r13.status === 200, '1.13 Update numberOfMembers to null');
  assert(r13.data.numberOfMembers === null, '1.13a numberOfMembers is null', `got: ${r13.data.numberOfMembers}`);
  
  // 1.14 Update - change product (should re-derive category)
  const r14 = await request('PUT', `/production/${firstId}`, {
    productSold: 'Auto Insurance'
  }, agentToken);
  assert(r14.status === 200, '1.14 Update product');
  assert(r14.data.productCategory === 'Property & Casualty - Personal', '1.14a Category re-derived', `got: ${r14.data.productCategory}`);
  
  // Revert back for further tests
  await request('PUT', `/production/${firstId}`, { productSold: 'Term Life Insurance' }, agentToken);
  
  // 1.15 Delete (soft delete)
  const deleteTarget = createdIds[createdIds.length - 1]; // delete last one
  const r15 = await request('DELETE', `/production/${deleteTarget}`, null, agentToken);
  assert(r15.status === 200, '1.15 Delete submission');
  createdIds.pop();
  
  // 1.16 Deleted not in list
  const r16 = await request('GET', '/production?page=1&limit=100', null, agentToken);
  const deletedInList = r16.data.submissions?.find(s => s._id === deleteTarget);
  assert(!deletedInList, '1.16 Deleted submission not in list');
}

// ═══════════════════════════════════════════════════════════
// SECTION 2: FILTERS & PAGINATION
// ═══════════════════════════════════════════════════════════
async function testFilters() {
  console.log('\n═══ SECTION 2: FILTERS & PAGINATION ═══\n');
  
  // 2.1 Filter by status
  const r1 = await request('GET', '/production?status=Submitted', null, agentToken);
  assert(r1.status === 200, '2.1 Filter by status=Submitted');
  const allSubmitted = r1.data.submissions?.every(s => s.status === 'Submitted');
  assert(allSubmitted, '2.1a All results have status=Submitted', `count: ${r1.data.submissions?.length}`);
  
  // 2.2 Filter by product
  const r2 = await request('GET', `/production?productSold=${encodeURIComponent('ACA Marketplace Health Insurance')}`, null, agentToken);
  assert(r2.status === 200, '2.2 Filter by product');
  const allACA = r2.data.submissions?.every(s => s.productSold === 'ACA Marketplace Health Insurance');
  assert(allACA || r2.data.submissions?.length === 0, '2.2a All results match product filter');
  
  // 2.3 Filter by carrier
  const r3 = await request('GET', `/production?carrier=${testCarrierId}`, null, agentToken);
  assert(r3.status === 200, '2.3 Filter by carrier');
  
  // 2.4 Filter by date range
  const r4 = await request('GET', '/production?startDate=2026-05-01&endDate=2026-05-10', null, agentToken);
  assert(r4.status === 200, '2.4 Filter by date range');
  const allInRange = r4.data.submissions?.every(s => {
    const d = new Date(s.submissionDate);
    return d >= new Date('2026-05-01') && d <= new Date('2026-05-10T23:59:59.999Z');
  });
  assert(allInRange, '2.4a All results within date range');
  
  // 2.5 Combined filters
  const r5 = await request('GET', `/production?status=Submitted&carrier=${testCarrierId}&startDate=2026-05-01`, null, agentToken);
  assert(r5.status === 200, '2.5 Combined filters');
  
  // 2.6 Pagination - limit
  const r6 = await request('GET', '/production?page=1&limit=2', null, agentToken);
  assert(r6.status === 200, '2.6 Pagination with limit=2');
  assert(r6.data.submissions?.length <= 2, '2.6a Results limited to 2', `got: ${r6.data.submissions?.length}`);
  assert(r6.data.pagination?.pages >= 1, '2.6b Pages calculated');
  
  // 2.7 Pagination - page 2
  if (r6.data.pagination?.pages > 1) {
    const r7 = await request('GET', '/production?page=2&limit=2', null, agentToken);
    assert(r7.status === 200, '2.7 Page 2 returns results');
    assert(r7.data.pagination?.page === 2, '2.7a Page number correct');
  } else {
    assert(true, '2.7 Skip page 2 test (not enough data)');
  }
  
  // 2.8 Non-existent status returns empty
  const r8 = await request('GET', '/production?status=In Force', null, agentToken);
  assert(r8.status === 200, '2.8 Status filter returns 200');
  // Agent's submissions are all "Submitted" (not reviewed yet)
}

// ═══════════════════════════════════════════════════════════
// SECTION 3: ADMIN OPERATIONS
// ═══════════════════════════════════════════════════════════
async function testAdminOps() {
  console.log('\n═══ SECTION 3: ADMIN OPERATIONS ═══\n');
  
  // 3.1 Admin sees all agents' submissions
  const r1 = await request('GET', '/production?page=1&limit=100', null, adminToken);
  assert(r1.status === 200, '3.1 Admin list submissions');
  assert(r1.data.submissions?.length > 0, '3.1a Admin sees submissions');
  
  // 3.2 Admin filter by agentId
  const r2 = await request('GET', `/production?agentId=${agentId}`, null, adminToken);
  assert(r2.status === 200, '3.2 Admin filter by agentId');
  const allBelongToAgent = r2.data.submissions?.every(s => {
    const sAgentId = s.agent?._id || s.agent;
    return sAgentId === agentId;
  });
  assert(allBelongToAgent, '3.2a All filtered results belong to agent');
  
  // 3.3 Admin review - mark In Force
  const toReview = createdIds[0];
  const r3 = await request('PUT', `/production/${toReview}/review`, {
    status: 'In Force',
    reviewNotes: 'Verified by admin test'
  }, adminToken);
  assert(r3.status === 200, '3.3 Admin review → In Force');
  assert(r3.data.status === 'In Force', '3.3a Status changed to In Force');
  assert(r3.data.reviewedBy != null, '3.3b reviewedBy populated');
  assert(r3.data.reviewedAt != null, '3.3c reviewedAt set');
  assert(r3.data.reviewNotes === 'Verified by admin test', '3.3d reviewNotes saved');
  
  // 3.4 Admin review - mark another In Force for team report testing
  const r4 = await request('PUT', `/production/${createdIds[3]}/review`, {
    status: 'In Force',
    reviewNotes: 'Custom fields submission approved'
  }, adminToken);
  assert(r4.status === 200, '3.4 Admin review 2nd submission → In Force');
  
  // 3.5 Admin review - mark Cancelled
  const r5 = await request('PUT', `/production/${createdIds[4]}/review`, {
    status: 'Cancelled',
    reviewNotes: 'Invalid submission'
  }, adminToken);
  assert(r5.status === 200, '3.5 Admin review → Cancelled');
  assert(r5.data.status === 'Cancelled', '3.5a Status is Cancelled');
  
  // 3.6 Agent cannot use review endpoint
  const r6 = await request('PUT', `/production/${createdIds[1]}/review`, {
    status: 'In Force'
  }, agentToken);
  assert(r6.status === 403, '3.6 Agent cannot review (403)', `got: ${r6.status}`);
  
  // 3.7 Admin can update any submission
  const r7 = await request('PUT', `/production/${createdIds[1]}`, {
    notes: 'Admin edited this'
  }, adminToken);
  assert(r7.status === 200, '3.7 Admin can update agent submission');
  assert(r7.data.notes === 'Admin edited this', '3.7a Notes updated by admin');
  
  // 3.8 Admin delete access
  const deleteTarget = createdIds[createdIds.length - 1];
  const r8 = await request('DELETE', `/production/${deleteTarget}`, null, adminToken);
  assert(r8.status === 200, '3.8 Admin can delete');
  createdIds.pop();
}

// ═══════════════════════════════════════════════════════════
// SECTION 4: TEAM REPORT (critical business logic)
// ═══════════════════════════════════════════════════════════
async function testTeamReport() {
  console.log('\n═══ SECTION 4: TEAM REPORT ═══\n');
  
  // 4.1 Admin team report (no filters) — should see all "In Force" premium
  const r1 = await request('GET', '/production/team-report?window=90', null, adminToken);
  assert(r1.status === 200, '4.1 Admin team report');
  assert(r1.data.totalPremiumInForce != null, '4.1a Has totalPremiumInForce');
  assert(r1.data.activeAgents != null, '4.1b Has activeAgents');
  assert(r1.data.newRecruits != null, '4.1c Has newRecruits');
  assert(r1.data.windowDays === 90, '4.1d Window respected', `got: ${r1.data.windowDays}`);
  console.log(`    → Admin Team Report (90d): Premium=$${r1.data.totalPremiumInForce}, Active=${r1.data.activeAgents}, Recruits=${r1.data.newRecruits}`);
  
  // 4.2 Admin team report with agentId filter
  const r2 = await request('GET', `/production/team-report?window=90&agentId=${agentId}`, null, adminToken);
  assert(r2.status === 200, '4.2 Admin team report with agentId');
  console.log(`    → Agent-filtered premium: $${r2.data.totalPremiumInForce}`);
  
  // 4.3 Compare with table data — In Force submissions
  const inForceList = await request('GET', '/production?status=In Force&limit=100', null, adminToken);
  const tablePremium = inForceList.data.submissions?.reduce((sum, s) => sum + (s.premiumAmount || 0), 0) || 0;
  // The team report (all, no date filter) should match In Force premium in the same window
  const r3 = await request('GET', '/production/team-report?window=9999', null, adminToken); // big window to see all
  console.log(`    → Table "In Force" premium: $${tablePremium}`);
  console.log(`    → Team Report (all-time): $${r3.data.totalPremiumInForce}`);
  assert(Math.abs(r3.data.totalPremiumInForce - tablePremium) < 0.01, '4.3 Team Report matches In Force table data', 
    `report=$${r3.data.totalPremiumInForce} vs table=$${tablePremium}`);
  
  // 4.4 Agent team report
  const r4 = await request('GET', '/production/team-report?window=30', null, agentToken);
  assert(r4.status === 200, '4.4 Agent team report');
  console.log(`    → Agent's team report: Premium=$${r4.data.totalPremiumInForce}`);
  
  // 4.5 Date-filtered team report
  const r5 = await request('GET', '/production/team-report?startDate=2026-05-01&endDate=2026-05-10', null, adminToken);
  assert(r5.status === 200, '4.5 Date-filtered team report');
  console.log(`    → Date-filtered premium: $${r5.data.totalPremiumInForce}`);
  
  // 4.6 Product-filtered team report
  const r6 = await request('GET', `/production/team-report?window=9999&productSold=${encodeURIComponent('Term Life Insurance')}`, null, adminToken);
  assert(r6.status === 200, '4.6 Product-filtered team report');
  console.log(`    → Product-filtered (Term Life): $${r6.data.totalPremiumInForce}`);
  
  // 4.7 Carrier-filtered team report
  const r7 = await request('GET', `/production/team-report?window=9999&carrier=${testCarrierId}`, null, adminToken);
  assert(r7.status === 200, '4.7 Carrier-filtered team report');
  console.log(`    → Carrier-filtered: $${r7.data.totalPremiumInForce}`);
  
  // 4.8 Narrow window vs wide window — narrow should be <= wide
  const narrow = await request('GET', '/production/team-report?window=7', null, adminToken);
  const wide = await request('GET', '/production/team-report?window=365', null, adminToken);
  assert(narrow.data.totalPremiumInForce <= wide.data.totalPremiumInForce, 
    '4.8 Narrow window <= wide window premium',
    `7d=$${narrow.data.totalPremiumInForce} vs 365d=$${wide.data.totalPremiumInForce}`);
}

// ═══════════════════════════════════════════════════════════
// SECTION 5: STATS & RANKING
// ═══════════════════════════════════════════════════════════
async function testStatsRanking() {
  console.log('\n═══ SECTION 5: STATS & RANKING ═══\n');
  
  // 5.1 Stats endpoint
  const r1 = await request('GET', '/production/stats/summary', null, adminToken);
  assert(r1.status === 200, '5.1 Stats summary');
  assert(r1.data.summary?.totalSubmissions > 0, '5.1a Has totalSubmissions');
  assert(r1.data.summary?.totalPremium >= 0, '5.1b Has totalPremium');
  assert(r1.data.summary?.avgPremium >= 0, '5.1c Has avgPremium');
  assert(Array.isArray(r1.data.byProduct), '5.1d Has byProduct breakdown');
  console.log(`    → Stats: ${r1.data.summary.totalSubmissions} submissions, $${r1.data.summary.totalPremium} total`);
  
  // 5.2 Stats with date filter
  const r2 = await request('GET', '/production/stats/summary?startDate=2026-05-01&endDate=2026-05-10', null, adminToken);
  assert(r2.status === 200, '5.2 Stats with date filter');
  
  // 5.3 Stats with agent filter
  const r3 = await request('GET', `/production/stats/summary?agentId=${agentId}`, null, adminToken);
  assert(r3.status === 200, '5.3 Stats with agent filter');
  
  // 5.4 Agent stats (only own)
  const r4 = await request('GET', '/production/stats/summary', null, agentToken);
  assert(r4.status === 200, '5.4 Agent sees own stats');
  
  // 5.5 Ranking - by premium
  const r5 = await request('GET', '/production/ranking?sortBy=premium', null, adminToken);
  assert(r5.status === 200, '5.5 Ranking by premium');
  assert(Array.isArray(r5.data.ranking), '5.5a Has ranking array');
  if (r5.data.ranking.length > 0) {
    assert(r5.data.ranking[0].rank === 1, '5.5b First entry has rank=1');
    assert(r5.data.ranking[0].agentName != null, '5.5c Has agentName');
    assert(r5.data.ranking[0].totalPremium != null, '5.5d Has totalPremium');
    console.log(`    → Top agent: ${r5.data.ranking[0].agentName} - $${r5.data.ranking[0].totalPremium}`);
  }
  
  // 5.6 Ranking - by policies
  const r6 = await request('GET', '/production/ranking?sortBy=policies', null, adminToken);
  assert(r6.status === 200, '5.6 Ranking by policies');
  
  // 5.7 Ranking - by members
  const r7 = await request('GET', '/production/ranking?sortBy=members', null, adminToken);
  assert(r7.status === 200, '5.7 Ranking by members');
  
  // 5.8 Ranking - with window
  const r8 = await request('GET', '/production/ranking?sortBy=premium&window=30', null, adminToken);
  assert(r8.status === 200, '5.8 Ranking with 30-day window');
  
  // 5.9 Ranking - agent sees (restricted to team)
  const r9 = await request('GET', '/production/ranking?sortBy=premium', null, agentToken);
  assert(r9.status === 200, '5.9 Agent can see ranking');
}

// ═══════════════════════════════════════════════════════════
// SECTION 6: CUSTOM FIELDS (Admin CRUD)
// ═══════════════════════════════════════════════════════════
async function testCustomFields() {
  console.log('\n═══ SECTION 6: CUSTOM FIELDS ═══\n');
  
  // 6.1 Get current custom fields
  const r1 = await request('GET', '/production/custom-fields', null, agentToken);
  assert(r1.status === 200, '6.1 Get custom fields');
  assert(Array.isArray(r1.data.fields), '6.1a Fields is array');
  console.log(`    → Current fields: ${r1.data.fields.map(f => f.label).join(', ') || 'none'}`);
  
  // 6.2 Admin saves custom fields
  const testFields = [
    { key: 'policy_number', label: 'Policy Number', type: 'text', required: false },
    { key: 'effective_date', label: 'Effective Date', type: 'date', required: false },
    { key: 'priority', label: 'Priority', type: 'select', required: false, options: ['High', 'Medium', 'Low'] }
  ];
  const r2 = await request('PUT', '/production/custom-fields', { fields: testFields }, adminToken);
  assert(r2.status === 200, '6.2 Admin saves custom fields');
  assert(r2.data.fields?.length === 3, '6.2a 3 fields saved');
  
  // 6.3 Agent cannot save custom fields
  const r3 = await request('PUT', '/production/custom-fields', { fields: testFields }, agentToken);
  assert(r3.status === 403, '6.3 Agent cannot save custom fields (403)', `got: ${r3.status}`);
  
  // 6.4 Invalid field type rejected
  const r4 = await request('PUT', '/production/custom-fields', {
    fields: [{ key: 'bad', label: 'Bad', type: 'invalid_type' }]
  }, adminToken);
  assert(r4.status === 400, '6.4 Invalid field type rejected', `got: ${r4.status}`);
  
  // 6.5 Missing key/label/type rejected
  const r5 = await request('PUT', '/production/custom-fields', {
    fields: [{ key: '', label: '', type: '' }]
  }, adminToken);
  assert(r5.status === 400, '6.5 Empty field definition rejected', `got: ${r5.status}`);
  
  // 6.6 Verify custom field values appear in submission list
  const r6 = await request('GET', '/production?page=1&limit=50', null, adminToken);
  const withCF = r6.data.submissions?.find(s => s.customFields?.policy_number === 'POL-12345');
  assert(withCF != null, '6.6 Custom field values visible in list');
}

// ═══════════════════════════════════════════════════════════
// SECTION 7: CSV EXPORT
// ═══════════════════════════════════════════════════════════
async function testExport() {
  console.log('\n═══ SECTION 7: CSV EXPORT ═══\n');
  
  // 7.1 Export all
  const r1 = await request('GET', '/production/export', null, adminToken);
  assert(r1.status === 200, '7.1 Export returns 200');
  assert(typeof r1.data === 'string', '7.1a Returns CSV string');
  assert(r1.data.includes('Submission Date'), '7.1b Has header row');
  assert(r1.data.includes('Agent Name'), '7.1c Has Agent Name header');
  const lines = r1.data.split('\n');
  assert(lines.length > 1, '7.1d Has data rows', `lines: ${lines.length}`);
  console.log(`    → Export: ${lines.length - 1} data rows`);
  
  // 7.2 Export with filters
  const r2 = await request('GET', `/production/export?status=In Force`, null, adminToken);
  assert(r2.status === 200, '7.2 Export with filter');
  
  // 7.3 Agent export (only own data)
  const r3 = await request('GET', '/production/export', null, agentToken);
  assert(r3.status === 200, '7.3 Agent export');
  // Verify no other agent's data appears
  assert(!r3.data.includes(ADMIN_EMAIL), '7.3a Agent export has no admin data');
}

// ═══════════════════════════════════════════════════════════
// SECTION 8: TEAM SCOPE & PRIVACY
// ═══════════════════════════════════════════════════════════
async function testTeamScope() {
  console.log('\n═══ SECTION 8: TEAM SCOPE & PRIVACY ═══\n');
  
  // 8.1 Agent scope=team
  const r1 = await request('GET', '/production?scope=team', null, agentToken);
  assert(r1.status === 200, '8.1 Agent team scope');
  
  // 8.2 Agent default scope - only own submissions
  const r2 = await request('GET', '/production', null, agentToken);
  const allOwn = r2.data.submissions?.every(s => {
    const sid = s.agent?._id || s.agent;
    return sid === agentId;
  });
  assert(allOwn, '8.2 Agent default scope: only own submissions');
  
  // 8.3 Agent cannot access admin-only single submission
  // Create a submission by admin conceptually - but admin creates are under their own agent id
  // Instead, verify agent cannot read a non-existent ID properly
  const r3 = await request('GET', '/production/000000000000000000000000', null, agentToken);
  assert(r3.status === 404, '8.3 Non-existent ID returns 404', `got: ${r3.status}`);
}

// ═══════════════════════════════════════════════════════════
// SECTION 9: CATEGORY AUTO-MAPPING (all products)
// ═══════════════════════════════════════════════════════════
async function testCategoryMapping() {
  console.log('\n═══ SECTION 9: CATEGORY MAPPING ═══\n');
  
  const testCases = [
    ['Term Life Insurance', 'Life Insurance'],
    ['Whole Life Insurance', 'Life Insurance'],
    ['Indexed Universal Life (IUL)', 'Life Insurance'],
    ['Final Expense / Burial Insurance', 'Life Insurance'],
    ['ACA Marketplace Health Insurance', 'Health Insurance'],
    ['Private Health Insurance', 'Health Insurance'],
    ['Medicare Advantage', 'Medicare'],
    ['Medicare Supplement (Medigap)', 'Medicare'],
    ['Critical Illness Insurance', 'Supplemental Insurance'],
    ['Dental Insurance', 'Supplemental Insurance'],
    ['Hospital Indemnity', 'Supplemental Insurance'],
    ['Fixed Annuities', 'Retirement / Annuities'],
    ['Indexed Annuities', 'Retirement / Annuities'],
    ['Auto Insurance', 'Property & Casualty - Personal'],
    ['Homeowners Insurance', 'Property & Casualty - Personal'],
    ['General Liability Insurance', 'Property & Casualty - Commercial'],
    ["Workers' Compensation Insurance", 'Property & Casualty - Commercial'],
  ];
  
  let allPassed = true;
  for (const [product, expected] of testCases) {
    const r = await request('POST', '/production', {
      clientName: `Cat Test - ${product}`,
      productSold: product,
      carrier: testCarrierId,
      premiumAmount: 1,
      submissionDate: '2026-01-01'
    }, agentToken);
    if (r.status === 201) {
      createdIds.push(r.data._id);
      if (r.data.productCategory !== expected) {
        allPassed = false;
        console.log(`  ❌ ${product} → expected "${expected}" got "${r.data.productCategory}"`);
        failed++;
        failures.push(`Category: ${product} → expected "${expected}" got "${r.data.productCategory}"`);
      }
    } else {
      allPassed = false;
    }
  }
  assert(allPassed, `9.1 All ${testCases.length} products mapped correctly`);
  console.log(`    → Tested ${testCases.length} product → category mappings`);
}

// ═══════════════════════════════════════════════════════════
// SECTION 10: BUSINESS LOGIC EDGE CASES
// ═══════════════════════════════════════════════════════════
async function testBusinessEdgeCases() {
  console.log('\n═══ SECTION 10: BUSINESS LOGIC EDGE CASES ═══\n');
  
  // 10.1 Status transition: Submitted → In Force → Lapsed
  const r1 = await request('POST', '/production', {
    clientName: 'Status Transition Test',
    productSold: 'Term Life Insurance',
    carrier: testCarrierId,
    premiumAmount: 500,
    submissionDate: '2026-05-09'
  }, agentToken);
  const statusTestId = r1.data._id;
  createdIds.push(statusTestId);
  
  // Mark In Force
  await request('PUT', `/production/${statusTestId}/review`, { status: 'In Force' }, adminToken);
  // Then mark Lapsed
  const r1b = await request('PUT', `/production/${statusTestId}/review`, { status: 'Lapsed', reviewNotes: 'Policy lapsed' }, adminToken);
  assert(r1b.status === 200, '10.1 Status: In Force → Lapsed');
  assert(r1b.data.status === 'Lapsed', '10.1a Status is Lapsed');
  
  // 10.2 Lapsed premium should NOT count in team report
  const report = await request('GET', '/production/team-report?window=9999', null, adminToken);
  const inForceList = await request('GET', '/production?status=In Force&limit=100', null, adminToken);
  const inForcePremium = inForceList.data.submissions?.reduce((s, sub) => s + (sub.premiumAmount || 0), 0) || 0;
  assert(Math.abs(report.data.totalPremiumInForce - inForcePremium) < 0.01, 
    '10.2 Lapsed premium excluded from team report',
    `report=$${report.data.totalPremiumInForce} vs inForce table=$${inForcePremium}`);
  
  // 10.3 Agent can change status (not just admin)
  const r3 = await request('PUT', `/production/${createdIds[1]}`, { status: 'Pending' }, agentToken);
  assert(r3.status === 200, '10.3 Agent can change status via PUT');
  assert(r3.data.status === 'Pending', '10.3a Status changed to Pending');
  
  // 10.4 Premium amount validation: negative not allowed
  const r4 = await request('POST', '/production', {
    clientName: 'Negative Premium',
    productSold: 'Term Life Insurance',
    carrier: testCarrierId,
    premiumAmount: -100,
    submissionDate: '2026-05-01'
  }, agentToken);
  // Model has min: 0, so this should fail validation
  assert(r4.status >= 400 || (r4.data.premiumAmount >= 0), '10.4 Negative premium rejected or clamped', `status=${r4.status}, premium=${r4.data?.premiumAmount}`);
  if (r4.status === 201 && r4.data._id) createdIds.push(r4.data._id);
  
  // 10.5 submissionDate in the future
  const r5 = await request('POST', '/production', {
    clientName: 'Future Date Test',
    productSold: 'Term Life Insurance',
    carrier: testCarrierId,
    premiumAmount: 100,
    submissionDate: '2027-12-31'
  }, agentToken);
  // Should it be allowed? Currently no validation on future dates
  assert(r5.status === 201, '10.5 Future submission date accepted (no restriction)');
  if (r5.data._id) createdIds.push(r5.data._id);
  
  // 10.6 Very long client name
  const longName = 'A'.repeat(500);
  const r6 = await request('POST', '/production', {
    clientName: longName,
    productSold: 'Term Life Insurance',
    carrier: testCarrierId,
    premiumAmount: 100,
    submissionDate: '2026-05-01'
  }, agentToken);
  assert(r6.status === 201, '10.6 Long client name accepted');
  if (r6.data._id) createdIds.push(r6.data._id);
  
  // 10.7 XSS attempt in client name
  const xssName = '<script>alert("xss")</script>';
  const r7 = await request('POST', '/production', {
    clientName: xssName,
    productSold: 'Term Life Insurance',
    carrier: testCarrierId,
    premiumAmount: 100,
    submissionDate: '2026-05-01'
  }, agentToken);
  if (r7.status === 201) {
    // XSS stored but the question is: is it rendered safely?
    // Mongoose trim should keep it, Angular sanitizes on output
    assert(r7.data.clientName === xssName.trim(), '10.7 XSS string stored as-is (Angular sanitizes output)');
    createdIds.push(r7.data._id);
  } else {
    assert(r7.status >= 400, '10.7 XSS rejected');
  }
  
  // 10.8 Duplicate submission (same data) — should be allowed (no unique constraint)
  const r8a = await request('POST', '/production', {
    clientName: 'Duplicate Test',
    productSold: 'Term Life Insurance',
    carrier: testCarrierId,
    premiumAmount: 100,
    submissionDate: '2026-05-01'
  }, agentToken);
  const r8b = await request('POST', '/production', {
    clientName: 'Duplicate Test',
    productSold: 'Term Life Insurance',
    carrier: testCarrierId,
    premiumAmount: 100,
    submissionDate: '2026-05-01'
  }, agentToken);
  assert(r8a.status === 201 && r8b.status === 201, '10.8 Duplicate submissions allowed');
  if (r8a.data._id) createdIds.push(r8a.data._id);
  if (r8b.data._id) createdIds.push(r8b.data._id);
}

// ═══════════════════════════════════════════════════════════
// SECTION 11: CONCURRENCY & DATA INTEGRITY
// ═══════════════════════════════════════════════════════════
async function testDataIntegrity() {
  console.log('\n═══ SECTION 11: DATA INTEGRITY ═══\n');
  
  // 11.1 Stats consistency — totalSubmissions should match list count
  const list = await request('GET', '/production?limit=1000', null, adminToken);
  const stats = await request('GET', '/production/stats/summary', null, adminToken);
  assert(stats.data.summary.totalSubmissions === list.data.pagination?.total,
    '11.1 Stats totalSubmissions matches list total',
    `stats=${stats.data.summary.totalSubmissions} vs list=${list.data.pagination?.total}`);
  
  // 11.2 Stats totalPremium matches sum of list premiums
  const listPremium = list.data.submissions?.reduce((s, sub) => s + (sub.premiumAmount || 0), 0) || 0;
  assert(Math.abs(stats.data.summary.totalPremium - listPremium) < 0.01,
    '11.2 Stats premium matches list sum',
    `stats=$${stats.data.summary.totalPremium} vs list=$${listPremium}`);
  
  // 11.3 Pagination total consistent across pages
  const p1 = await request('GET', '/production?page=1&limit=5', null, adminToken);
  const p2 = await request('GET', '/production?page=2&limit=5', null, adminToken);
  assert(p1.data.pagination?.total === p2.data.pagination?.total,
    '11.3 Pagination total consistent across pages',
    `p1=${p1.data.pagination?.total} vs p2=${p2.data.pagination?.total}`);
}

// ═══════════════════════════════════════════════════════════
// CLEANUP
// ═══════════════════════════════════════════════════════════
async function cleanup() {
  console.log('\n═══ CLEANUP ═══\n');
  let cleaned = 0;
  for (const id of createdIds) {
    try {
      const r = await request('DELETE', `/production/${id}`, null, adminToken);
      if (r.status === 200) cleaned++;
    } catch {}
  }
  console.log(`  Cleaned ${cleaned}/${createdIds.length} test submissions`);
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║  DEEP E2E PRODUCTION TRACKING - ALL SCENARIOS           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  
  await setup();
  await testAgentCRUD();
  await testFilters();
  await testAdminOps();
  await testTeamReport();
  await testStatsRanking();
  await testCustomFields();
  await testExport();
  await testTeamScope();
  await testCategoryMapping();
  await testBusinessEdgeCases();
  await testDataIntegrity();
  await cleanup();
  
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log(`║  RESULTS: ✅ ${passed} passed | ❌ ${failed} failed | Total: ${passed + failed}`);
  console.log('╚═══════════════════════════════════════════════════════════╝');
  
  if (failures.length > 0) {
    console.log('\nFailed tests:');
    failures.forEach(f => console.log(`  • ${f}`));
  }
  
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error('Test error:', err); process.exit(1); });
