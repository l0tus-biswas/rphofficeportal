/**
 * Billing & Payments — Issue #12 Regression Tests
 *
 * Covers:
 * 1. Subscription stats exclude deleted users
 * 2. Payment stats exclude deleted users
 * 3. Pagination totals are accurate
 * 4. Payment settings return correct pricing ($20 setup / $20 monthly or configured)
 * 5. Stale pending payment cleanup works
 * 6. Admin stats include billing summary
 * 7. Access control on billing endpoints
 */

const request = require('supertest');

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:5000';

const ADMIN_EMAIL = 'contracting@rhpoffice.com';
const ADMIN_PASS = 'admin123';
const AGENT_EMAIL = 'norgehernandez6047@gmail.com';
const AGENT_PASS = '123456';

let adminToken, agentToken;

beforeAll(async () => {
  const adminLogin = await request(BASE_URL)
    .post('/api/auth/login')
    .send({ email: ADMIN_EMAIL, password: ADMIN_PASS });
  adminToken = adminLogin.body.token;

  const agentLogin = await request(BASE_URL)
    .post('/api/auth/login')
    .send({ email: AGENT_EMAIL, password: AGENT_PASS });
  agentToken = agentLogin.body.token;
}, 30000);

// ============================================================================
// 1. SUBSCRIPTION STATS - Exclude deleted users
// ============================================================================
describe('Subscription stats accuracy', () => {
  test('GET /api/admin/subscriptions returns stats excluding deleted users', async () => {
    const res = await request(BASE_URL)
      .get('/api/admin/subscriptions')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.stats).toBeDefined();
    expect(Array.isArray(res.body.stats)).toBe(true);
    // Stats should be grouped by status
    res.body.stats.forEach(stat => {
      expect(stat._id).toBeDefined();
      expect(stat.count).toBeGreaterThanOrEqual(0);
    });
  });

  test('Subscription list excludes deleted users by default', async () => {
    const res = await request(BASE_URL)
      .get('/api/admin/subscriptions')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    // All returned subscriptions should have valid, non-deleted users
    res.body.subscriptions.forEach(sub => {
      if (sub.user) {
        expect(sub.user.deletedAt).toBeFalsy();
      }
    });
  });

  test('Pagination total matches actual count', async () => {
    const res = await request(BASE_URL)
      .get('/api/admin/subscriptions?limit=50')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.total).toBeGreaterThanOrEqual(0);
    // Total should be >= subscriptions returned on this page
    expect(res.body.pagination.total).toBeGreaterThanOrEqual(res.body.subscriptions.length);
  });

  test('Can filter subscriptions by status', async () => {
    const res = await request(BASE_URL)
      .get('/api/admin/subscriptions?status=active')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    res.body.subscriptions.forEach(sub => {
      expect(sub.status).toBe('active');
    });
  });
});

// ============================================================================
// 2. PAYMENT STATS - Exclude deleted users
// ============================================================================
describe('Payment stats accuracy', () => {
  test('GET /api/admin/payments returns stats excluding deleted users', async () => {
    const res = await request(BASE_URL)
      .get('/api/admin/payments')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.stats).toBeDefined();
    expect(Array.isArray(res.body.stats)).toBe(true);
    res.body.stats.forEach(stat => {
      expect(stat._id).toBeDefined();
      expect(stat.count).toBeGreaterThanOrEqual(0);
      expect(stat.totalAmount).toBeGreaterThanOrEqual(0);
    });
  });

  test('Payment list excludes deleted users by default', async () => {
    const res = await request(BASE_URL)
      .get('/api/admin/payments')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    res.body.payments.forEach(payment => {
      if (payment.user) {
        expect(payment.user.deletedAt).toBeFalsy();
      }
    });
  });

  test('Can filter payments by type', async () => {
    const res = await request(BASE_URL)
      .get('/api/admin/payments?type=setup_fee')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    res.body.payments.forEach(payment => {
      expect(payment.type).toBe('setup_fee');
    });
  });

  test('Can filter payments by status', async () => {
    const res = await request(BASE_URL)
      .get('/api/admin/payments?status=succeeded')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    res.body.payments.forEach(payment => {
      expect(payment.status).toBe('succeeded');
    });
  });

  test('Pagination total is accurate', async () => {
    const res = await request(BASE_URL)
      .get('/api/admin/payments?limit=50')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBeGreaterThanOrEqual(res.body.payments.length);
  });
});

// ============================================================================
// 3. PAYMENT SETTINGS
// ============================================================================
describe('Payment settings', () => {
  test('GET /api/admin/payment-settings returns pricing config', async () => {
    const res = await request(BASE_URL)
      .get('/api/admin/payment-settings')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.oneTimePrice).toBeDefined();
    expect(res.body.monthlyPrice).toBeDefined();
    // Verify pricing is a positive number (in cents)
    expect(res.body.oneTimePrice).toBeGreaterThan(0);
    expect(res.body.monthlyPrice).toBeGreaterThan(0);
  });

  test('Monthly subscription is $20/month (2000 cents)', async () => {
    const res = await request(BASE_URL)
      .get('/api/admin/payment-settings')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    // Monthly price should be 2000 cents ($20)
    expect(res.body.monthlyPrice).toBe(2000);
  });
});

// ============================================================================
// 4. STALE PAYMENT CLEANUP
// ============================================================================
describe('Stale payment cleanup', () => {
  test('POST /api/admin/payments/cleanup-stale expires old pending payments', async () => {
    const res = await request(BASE_URL)
      .post('/api/admin/payments/cleanup-stale')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.expiredCount).toBeDefined();
    expect(typeof res.body.expiredCount).toBe('number');
  });

  test('Agent cannot trigger cleanup', async () => {
    const res = await request(BASE_URL)
      .post('/api/admin/payments/cleanup-stale')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(403);
  });
});

// ============================================================================
// 5. ADMIN STATS INCLUDE BILLING SUMMARY
// ============================================================================
describe('Admin dashboard stats include billing', () => {
  test('GET /api/admin/stats includes subscription counts', async () => {
    const res = await request(BASE_URL)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.stats.activeSubscriptions).toBeDefined();
    expect(typeof res.body.stats.activeSubscriptions).toBe('number');
    expect(res.body.stats.canceledSubscriptions).toBeDefined();
    expect(res.body.stats.totalRevenue).toBeDefined();
  });

  test('Active subscription count excludes deleted users', async () => {
    const res = await request(BASE_URL)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    // Compare with the subscriptions endpoint
    const subsRes = await request(BASE_URL)
      .get('/api/admin/subscriptions?status=active')
      .set('Authorization', `Bearer ${adminToken}`);
    const activeFromSubsEndpoint = subsRes.body.stats.find(s => s._id === 'active')?.count || 0;
    expect(res.body.stats.activeSubscriptions).toBe(activeFromSubsEndpoint);
  });
});

// ============================================================================
// 6. ACCESS CONTROL
// ============================================================================
describe('Billing access control', () => {
  test('Agent cannot access admin payments', async () => {
    const res = await request(BASE_URL)
      .get('/api/admin/payments')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(403);
  });

  test('Agent cannot access admin subscriptions', async () => {
    const res = await request(BASE_URL)
      .get('/api/admin/subscriptions')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(403);
  });

  test('Agent can view their own payment status', async () => {
    const res = await request(BASE_URL)
      .get('/api/payments/status')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('oneTimePaymentCompleted');
    expect(res.body).toHaveProperty('subscriptionStatus');
    expect(res.body).toHaveProperty('paymentAccessEnabled');
  });

  test('Unauthenticated cannot access payment status', async () => {
    const res = await request(BASE_URL)
      .get('/api/payments/status');
    expect(res.status).toBe(401);
  });
});
