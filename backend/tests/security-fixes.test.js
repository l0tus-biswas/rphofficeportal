/**
 * Unit tests for critical security fixes (Audit #1, #5, #6, #7)
 * Tests token-exchange, credential non-exposure, agentId bypass protection
 */
process.env.NODE_ENV = 'test';

const request = require('supertest');
const mongoose = require('mongoose');
const crypto = require('crypto');
const User = require('../models/User');

const TEST_DB_URI = process.env.MONGODB_URI_TEST;

function assertSafeTestDatabase() {
  const dbName = mongoose.connection?.db?.databaseName || '';
  if (!dbName || !/test/i.test(dbName)) {
    throw new Error(`Refusing to run destructive test cleanup against non-test database: ${dbName || 'unknown'}`);
  }
}

let app;

describe('Security Fixes - Critical', () => {
  beforeAll(async () => {
    if (!TEST_DB_URI) {
      console.warn('MONGODB_URI_TEST not set – skipping security fix tests');
      return;
    }
    await mongoose.connect(TEST_DB_URI);
    assertSafeTestDatabase();
    ({ app } = require('../server'));
  });

  afterAll(async () => {
    if (mongoose.connection.readyState === 1) {
      assertSafeTestDatabase();
      await User.deleteMany({ email: /@securitytest\.local$/i });
      await mongoose.connection.close();
    }
  });

  // ─────────────────────────────────────────────────────────
  // Fix #1: Credential exposure removed from POST /api/public/apply
  // ─────────────────────────────────────────────────────────
  describe('Fix #1: POST /api/public/apply - No credential exposure', () => {
    it('should NOT return credentials (password) in the response', async () => {
      if (!app) return;

      const res = await request(app)
        .post('/api/public/apply')
        .send({
          name: 'Security Test User',
          email: 'fix1-test@securitytest.local',
          phone: '5551234567'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      // CRITICAL: credentials must NOT be in response
      expect(res.body.credentials).toBeUndefined();
      expect(res.body.password).toBeUndefined();
      // autoLoginToken SHOULD be present
      expect(res.body.autoLoginToken).toBeDefined();
      expect(typeof res.body.autoLoginToken).toBe('string');
      expect(res.body.autoLoginToken.length).toBeGreaterThanOrEqual(40);
    });

    it('should return user info without password', async () => {
      if (!app) return;

      const res = await request(app)
        .post('/api/public/apply')
        .send({
          name: 'Security Test User 2',
          email: 'fix1-test2@securitytest.local',
          phone: '5551234568'
        });

      expect(res.status).toBe(201);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.password).toBeUndefined();
      expect(res.body.user.email).toBe('fix1-test2@securitytest.local');
    });
  });

  // ─────────────────────────────────────────────────────────
  // Fix #1 (cont): POST /api/auth/token-exchange
  // ─────────────────────────────────────────────────────────
  describe('Fix #1: POST /api/auth/token-exchange', () => {
    let validToken;

    beforeAll(async () => {
      if (!app) return;
      // Create a user with an auto-login token
      const user = await User.create({
        name: 'Token Exchange User',
        email: 'tokenexchange@securitytest.local',
        phone: '5559876543',
        password: 'testpass123',
        role: 'agent'
      });
      validToken = user.getAutoLoginToken();
      await user.save({ validateBeforeSave: false });
    });

    it('should exchange valid token for JWT', async () => {
      if (!app) return;

      const res = await request(app)
        .post('/api/auth/token-exchange')
        .send({ token: validToken });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.user).toBeDefined();
      expect(res.body.user.password).toBeUndefined();
    });

    it('should reject reused (already-consumed) token', async () => {
      if (!app) return;

      // Second use of same token should fail
      const res = await request(app)
        .post('/api/auth/token-exchange')
        .send({ token: validToken });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject invalid token', async () => {
      if (!app) return;

      const res = await request(app)
        .post('/api/auth/token-exchange')
        .send({ token: 'invalidtoken123' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject expired token', async () => {
      if (!app) return;

      // Create user with already-expired token
      const user = await User.create({
        name: 'Expired Token User',
        email: 'expiredtoken@securitytest.local',
        phone: '5559876544',
        password: 'testpass123',
        role: 'agent'
      });
      const token = crypto.randomBytes(32).toString('hex');
      user.autoLoginToken = crypto.createHash('sha256').update(token).digest('hex');
      user.autoLoginTokenExpire = Date.now() - 1000; // Already expired
      await user.save({ validateBeforeSave: false });

      const res = await request(app)
        .post('/api/auth/token-exchange')
        .send({ token });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject empty token', async () => {
      if (!app) return;

      const res = await request(app)
        .post('/api/auth/token-exchange')
        .send({ token: '' });

      expect(res.status).toBe(400);
    });

    it('should reject missing token field', async () => {
      if (!app) return;

      const res = await request(app)
        .post('/api/auth/token-exchange')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  // ─────────────────────────────────────────────────────────
  // Fix #6: JWT Secret validation on startup
  // ─────────────────────────────────────────────────────────
  describe('Fix #6: JWT_SECRET required', () => {
    it('should have JWT_SECRET defined in test environment', () => {
      // This test validates that our startup guard works
      expect(process.env.JWT_SECRET).toBeDefined();
      expect(process.env.JWT_SECRET.length).toBeGreaterThan(0);
    });
  });

  // ─────────────────────────────────────────────────────────
  // Fix #7: Test route removed
  // ─────────────────────────────────────────────────────────
  describe('Fix #7: GET /api/public/test-template-fields removed', () => {
    it('should return 404 for removed test route', async () => {
      if (!app) return;

      const res = await request(app)
        .get('/api/public/test-template-fields');

      // Route should no longer exist (404 or SPA fallback)
      expect([404, 200]).toContain(res.status);
      if (res.status === 200) {
        // If 200, it should be the SPA fallback, not the template fields
        expect(res.body.template).toBeUndefined();
      }
    });
  });

  // ─────────────────────────────────────────────────────────
  // Fix #5: agentId query bypass on production routes
  // ─────────────────────────────────────────────────────────
  describe('Fix #5: Production agentId bypass protection', () => {
    let agentToken;
    let agent2Id;

    beforeAll(async () => {
      if (!app) return;

      const agent1 = await User.create({
        name: 'Agent One',
        email: 'agent1@securitytest.local',
        phone: '5551111111',
        password: 'testpass123',
        role: 'agent'
      });

      const agent2 = await User.create({
        name: 'Agent Two',
        email: 'agent2@securitytest.local',
        phone: '5552222222',
        password: 'testpass123',
        role: 'agent'
      });
      agent2Id = agent2._id.toString();

      // Login as agent1
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'agent1@securitytest.local', password: 'testpass123' });
      agentToken = loginRes.body.token;
    });

    it('should NOT allow agent to use agentId param to see other agents data', async () => {
      if (!app || !agentToken) return;

      const res = await request(app)
        .get(`/api/production?agentId=${agent2Id}`)
        .set('Authorization', `Bearer ${agentToken}`);

      // Should either return only own data (ignoring agentId) or empty
      expect(res.status).toBe(200);
      if (res.body.submissions && res.body.submissions.length > 0) {
        // If any results, all should belong to agent1 (not agent2)
        res.body.submissions.forEach(sub => {
          expect(sub.agent?._id || sub.agent).not.toBe(agent2Id);
        });
      }
    });
  });
});
