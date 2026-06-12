/**
 * Coupon Management / Free Access Users — Issue #13 Regression Tests
 *
 * Validates:
 * 1. Admin can mark user as billing exempt (Free Access)
 * 2. Billing exempt requires a reason
 * 3. Exempt users get paymentAccessEnabled = true
 * 4. Exempt users' payment status shows subscriptionStatus = 'exempt'
 * 5. Exempt users cannot create payment intents (no charge needed)
 * 6. Admin can remove billing exempt
 * 7. Coupon CRUD works correctly
 * 8. Agent cannot set billing exempt on themselves
 */

const request = require('supertest');

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:5000';

const ADMIN_EMAIL = 'contracting@rhpoffice.com';
const ADMIN_PASS = 'admin123';
const AGENT_EMAIL = 'norgehernandez6047@gmail.com';
const AGENT_PASS = '123456';

let adminToken, agentToken, agentId;

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
  // Ensure we restore the agent's billing status
  await request(BASE_URL)
    .put(`/api/admin/users/${agentId}/billing-exempt`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ exempt: false, reason: '' });
});

// ============================================================================
// 1. BILLING EXEMPT - Set / Clear
// ============================================================================
describe('Billing Exempt: Admin can grant Free Access', () => {
  test('Admin can mark user as billing exempt with reason', async () => {
    const res = await request(BASE_URL)
      .put(`/api/admin/users/${agentId}/billing-exempt`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ exempt: true, reason: 'Test user - E2E testing' });
    expect(res.status).toBe(200);
    expect(res.body.user.billingExempt).toBe(true);
    expect(res.body.user.billingExemptReason).toBe('Test user - E2E testing');
    expect(res.body.user.paymentAccessEnabled).toBe(true);
  });

  test('Billing exempt requires a reason', async () => {
    const res = await request(BASE_URL)
      .put(`/api/admin/users/${agentId}/billing-exempt`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ exempt: true });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('reason');
  });

  test('Billing exempt requires exempt field to be boolean', async () => {
    const res = await request(BASE_URL)
      .put(`/api/admin/users/${agentId}/billing-exempt`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ exempt: 'yes', reason: 'test' });
    expect(res.status).toBe(400);
  });
});

// ============================================================================
// 2. EXEMPT USER PAYMENT STATUS
// ============================================================================
describe('Exempt user payment status', () => {
  test('Exempt user gets subscriptionStatus=exempt in payment status', async () => {
    // First ensure user is exempt
    await request(BASE_URL)
      .put(`/api/admin/users/${agentId}/billing-exempt`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ exempt: true, reason: 'Testing exempt status' });

    const res = await request(BASE_URL)
      .get('/api/payments/status')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.billingExempt).toBe(true);
    expect(res.body.subscriptionStatus).toBe('exempt');
    expect(res.body.paymentAccessEnabled).toBe(true);
    expect(res.body.oneTimePaymentCompleted).toBe(true);
  });

  test('Exempt user cannot create payment intent (returns 400)', async () => {
    const res = await request(BASE_URL)
      .post('/api/payments/one-time-intent')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('billing exempt');
  });
});

// ============================================================================
// 3. REMOVE BILLING EXEMPT
// ============================================================================
describe('Remove billing exempt', () => {
  test('Admin can remove billing exempt status', async () => {
    const res = await request(BASE_URL)
      .put(`/api/admin/users/${agentId}/billing-exempt`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ exempt: false, reason: '' });
    expect(res.status).toBe(200);
    expect(res.body.user.billingExempt).toBe(false);
    expect(res.body.user.billingExemptReason).toBeNull();
  });

  test('After removing exempt, payment status no longer shows exempt', async () => {
    const res = await request(BASE_URL)
      .get('/api/payments/status')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.billingExempt).toBeFalsy();
    expect(res.body.subscriptionStatus).not.toBe('exempt');
  });
});

// ============================================================================
// 4. ACCESS CONTROL
// ============================================================================
describe('Access control for billing exempt', () => {
  test('Agent cannot set billing exempt on themselves', async () => {
    const res = await request(BASE_URL)
      .put(`/api/admin/users/${agentId}/billing-exempt`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ exempt: true, reason: 'Self-exempt attempt' });
    expect(res.status).toBe(403);
  });

  test('Unauthenticated cannot set billing exempt', async () => {
    const res = await request(BASE_URL)
      .put(`/api/admin/users/${agentId}/billing-exempt`)
      .send({ exempt: true, reason: 'Anon attempt' });
    expect(res.status).toBe(401);
  });
});

// ============================================================================
// 5. COUPON SYSTEM
// ============================================================================
describe('Coupon management', () => {
  let couponId;

  test('Admin can create a coupon', async () => {
    const code = 'TEST' + Math.floor(Math.random() * 99999);
    const res = await request(BASE_URL)
      .post('/api/admin/coupons')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: code,
        description: 'Test coupon for E2E testing',
        discountType: 'percentage',
        discountValue: 100,
        validFrom: new Date().toISOString(),
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        applicableRoles: ['agent']
      });
    expect(res.status).toBe(201);
    expect(res.body.coupon || res.body).toBeDefined();
    couponId = (res.body.coupon || res.body)._id;
  });

  test('Admin can list coupons', async () => {
    const res = await request(BASE_URL)
      .get('/api/admin/coupons')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.coupons || res.body)).toBe(true);
  });

  test('Agent cannot create coupons', async () => {
    const res = await request(BASE_URL)
      .post('/api/admin/coupons')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        code: 'AGENTCOUPON',
        description: 'Should fail',
        discountType: 'percentage',
        discountValue: 50,
        validFrom: new Date().toISOString(),
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      });
    expect(res.status).toBe(403);
  });

  test('Admin can delete coupon', async () => {
    if (!couponId) return;
    const res = await request(BASE_URL)
      .delete(`/api/admin/coupons/${couponId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});

// ============================================================================
// 6. USER LIST SHOWS BILLING EXEMPT STATUS
// ============================================================================
describe('User list shows exempt status', () => {
  test('Admin user list includes billingExempt field', async () => {
    // First set exempt to test visibility
    await request(BASE_URL)
      .put(`/api/admin/users/${agentId}/billing-exempt`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ exempt: true, reason: 'Visibility test' });

    const res = await request(BASE_URL)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const users = res.body.users || res.body;
    const agent = users.find(u => u._id === agentId || u.email === AGENT_EMAIL);
    if (agent) {
      expect(agent.billingExempt).toBe(true);
      expect(agent.billingExemptReason).toBe('Visibility test');
    }

    // Clean up
    await request(BASE_URL)
      .put(`/api/admin/users/${agentId}/billing-exempt`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ exempt: false, reason: '' });
  });
});
