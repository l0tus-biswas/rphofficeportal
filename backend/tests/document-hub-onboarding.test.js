/**
 * Document Hub / Onboarding Docs - Issue #11 Regression Tests
 *
 * Validates:
 * 1. Document Hub is focused on document storage/sharing (library)
 * 2. Request Document functionality is admin-only in Document Hub
 * 3. Agents can't access requests section in Document Hub
 * 4. Onboarding Docs shows pending + completed requests for agents
 * 5. Admin can still create/review requests via Document Hub
 * 6. Agent can submit responses via Onboarding Hub API
 */

const request = require('supertest');

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:5000';

const ADMIN_EMAIL = 'contracting@rhpoffice.com';
const ADMIN_PASS = 'admin123';
const AGENT_EMAIL = 'norgehernandez6047@gmail.com';
const AGENT_PASS = '123456';

let adminToken, agentToken, agentId;
let testFolderId;
let testRequestId;

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
  // Clean up test request
  if (testRequestId) {
    await request(BASE_URL)
      .delete(`/api/document-hub/requests/${testRequestId}`)
      .set('Authorization', `Bearer ${adminToken}`);
  }
  // Clean up test folder
  if (testFolderId) {
    await request(BASE_URL)
      .delete(`/api/document-hub/folders/${testFolderId}`)
      .set('Authorization', `Bearer ${adminToken}`);
  }
});

// ============================================================================
// 1. DOCUMENT HUB LIBRARY - Both roles can access
// ============================================================================
describe('Document Hub: Library access', () => {
  test('Admin can list folders', async () => {
    const res = await request(BASE_URL)
      .get('/api/document-hub/folders')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('Agent can list folders (library access)', async () => {
    const res = await request(BASE_URL)
      .get('/api/document-hub/folders')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('Admin can create folder', async () => {
    const res = await request(BASE_URL)
      .post('/api/document-hub/folders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test DocHub Folder ' + Date.now(), description: 'Test folder' });
    expect(res.status).toBe(201);
    testFolderId = res.body._id;
  });

  test('Agent cannot create folder (library is read-only for agents)', async () => {
    const res = await request(BASE_URL)
      .post('/api/document-hub/folders')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ name: 'Agent Folder Attempt', description: 'Should fail' });
    expect(res.status).toBe(403);
  });
});

// ============================================================================
// 2. DOCUMENT REQUESTS - Admin-only creation/review
// ============================================================================
describe('Document Requests: Admin creates, agents respond', () => {
  test('Admin can create document request', async () => {
    const res = await request(BASE_URL)
      .post('/api/document-hub/requests')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Test Request - Upload W-9 ' + Date.now(),
        description: 'Please upload your W-9 form',
        requestedFrom: [agentId],
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      });
    expect(res.status).toBe(201);
    expect(res.body.title).toContain('Test Request');
    expect(res.body.responses).toBeDefined();
    expect(res.body.responses.length).toBe(1);
    expect(res.body.responses[0].status).toBe('pending');
    testRequestId = res.body._id;
  });

  test('Agent cannot create document request', async () => {
    const res = await request(BASE_URL)
      .post('/api/document-hub/requests')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        title: 'Agent Request Attempt',
        description: 'Should fail',
        requestedFrom: [agentId]
      });
    expect(res.status).toBe(403);
  });

  test('Agent can see their pending requests via GET', async () => {
    const res = await request(BASE_URL)
      .get('/api/document-hub/requests')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(200);
    const requests = res.body.requests || res.body;
    expect(Array.isArray(requests)).toBe(true);
    // Agent should see the request created for them
    const myRequest = requests.find((r) => r._id === testRequestId);
    expect(myRequest).toBeDefined();
  });

  test('Admin sees all requests with full agent responses', async () => {
    const res = await request(BASE_URL)
      .get('/api/document-hub/requests')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const requests = res.body.requests || res.body;
    const myRequest = requests.find((r) => r._id === testRequestId);
    expect(myRequest).toBeDefined();
    expect(myRequest.responses.length).toBe(1);
    expect(myRequest.responses[0].status).toBe('pending');
  });
});

// ============================================================================
// 3. AGENT RESPONDS TO REQUEST (via Onboarding Hub workflow)
// ============================================================================
describe('Agent responds to request (Onboarding Hub flow)', () => {
  test('Agent can submit a response to a request', async () => {
    // Create a minimal test file (simulate file upload)
    const res = await request(BASE_URL)
      .post(`/api/document-hub/requests/${testRequestId}/respond`)
      .set('Authorization', `Bearer ${agentToken}`)
      .attach('file', Buffer.from('test file content'), 'test-w9.pdf')
      .field('notes', 'Here is my W-9 form');
    expect(res.status).toBe(200);
  });

  test('After submission, agent response status is submitted', async () => {
    const res = await request(BASE_URL)
      .get('/api/document-hub/requests')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(200);
    const requests = res.body.requests || res.body;
    const myRequest = requests.find((r) => r._id === testRequestId);
    expect(myRequest).toBeDefined();
    const myResponse = myRequest.responses.find((r) => {
      const aid = typeof r.agent === 'object' ? r.agent._id : r.agent;
      return aid === agentId;
    });
    expect(myResponse).toBeDefined();
    expect(myResponse.status).toBe('submitted');
  });
});

// ============================================================================
// 4. ADMIN REVIEWS RESPONSE
// ============================================================================
describe('Admin reviews agent response', () => {
  test('Admin can approve agent response', async () => {
    const res = await request(BASE_URL)
      .put(`/api/document-hub/requests/${testRequestId}/review/${agentId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'approved', reviewNotes: 'Looks good!' });
    expect(res.status).toBe(200);
  });

  test('After approval, agent response shows approved status', async () => {
    const res = await request(BASE_URL)
      .get('/api/document-hub/requests')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(200);
    const requests = res.body.requests || res.body;
    const myRequest = requests.find((r) => r._id === testRequestId);
    expect(myRequest).toBeDefined();
    const myResponse = myRequest.responses.find((r) => {
      const aid = typeof r.agent === 'object' ? r.agent._id : r.agent;
      return aid === agentId;
    });
    expect(myResponse.status).toBe('approved');
    expect(myResponse.reviewNotes).toBe('Looks good!');
  });

  test('Agent cannot review responses', async () => {
    const res = await request(BASE_URL)
      .put(`/api/document-hub/requests/${testRequestId}/review/${agentId}`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ status: 'approved', reviewNotes: 'Self-approve attempt' });
    // Should be forbidden (admin only)
    expect(res.status).toBe(403);
  });
});

// ============================================================================
// 5. ADMIN CAN DELETE REQUESTS
// ============================================================================
describe('Request lifecycle management', () => {
  let tempRequestId;

  test('Admin can create and then delete a request', async () => {
    const createRes = await request(BASE_URL)
      .post('/api/document-hub/requests')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Temp Request ' + Date.now(),
        requestedFrom: [agentId]
      });
    expect(createRes.status).toBe(201);
    tempRequestId = createRes.body._id;

    const deleteRes = await request(BASE_URL)
      .delete(`/api/document-hub/requests/${tempRequestId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(deleteRes.status).toBe(200);
  });

  test('Agent cannot delete requests', async () => {
    // Use the main test request (already exists)
    const res = await request(BASE_URL)
      .delete(`/api/document-hub/requests/${testRequestId}`)
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(403);
  });
});

// ============================================================================
// 6. ONBOARDING HUB ENDPOINTS WORK INDEPENDENTLY
// ============================================================================
describe('Onboarding Hub: independent document workflow', () => {
  test('Agent can access onboarding doc types', async () => {
    const res = await request(BASE_URL)
      .get('/api/onboarding-hub/doc-types')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(200);
  });

  test('Agent can list their onboarding documents', async () => {
    const res = await request(BASE_URL)
      .get(`/api/onboarding-hub/documents/${agentId}`)
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(200);
  });
});
