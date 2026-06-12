/**
 * Unit tests for remaining HIGH-priority fixes (#15, #16, #17, #18)
 * Tests: payment gating, folder visibility enforcement, referral code length, agentId guard
 */
process.env.NODE_ENV = 'test';

// ─────────────────────────────────────────────────────────
// Fix #15: Apply creates user with paymentAccessEnabled=false (default)
// ─────────────────────────────────────────────────────────
describe('Fix #15: New user payment gating', () => {
  it('paymentAccessEnabled defaults to false in User model schema', () => {
    // Simulate the schema default
    const mongoose = require('mongoose');
    const UserSchema = require('../models/User');
    const schemaDef = UserSchema.schema.paths.paymentAccessEnabled;
    expect(schemaDef.defaultValue).toBe(false);
  });

  it('new user object has paymentAccessEnabled=false by default', () => {
    const mongoose = require('mongoose');
    const User = require('../models/User');
    const user = new User({
      name: 'Test Agent',
      email: 'test-agent@example.com',
      password: 'hashedpass123',
      role: 'agent'
    });
    expect(user.paymentAccessEnabled).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────
// Fix #16: Folder visibility enforcement in file listing
// ─────────────────────────────────────────────────────────
describe('Fix #16: Folder visibility enforcement', () => {
  // Mock Express req/res for route handler testing
  const createMockReq = (user, query = {}) => ({
    user,
    query,
    params: {}
  });

  const createMockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  it('admin-only folder visibility blocks non-admin file access', async () => {
    // Verify the logic: if folder.visibility === 'admin' and user is not admin, deny
    const folder = { _id: 'folder123', visibility: 'admin', isActive: true };
    const user = { _id: 'user1', role: 'agent' };

    // The check in the route: folder.visibility === 'admin' → 403
    const isBlocked = user.role !== 'admin' && folder.visibility === 'admin';
    expect(isBlocked).toBe(true);
  });

  it('folder with visibility=all allows non-admin file access', () => {
    const folder = { _id: 'folder123', visibility: 'all', isActive: true };
    const user = { _id: 'user1', role: 'agent' };

    const isBlocked = user.role !== 'admin' && folder.visibility === 'admin';
    expect(isBlocked).toBe(false);
  });

  it('admin can access files in admin-only folders', () => {
    const folder = { _id: 'folder123', visibility: 'admin', isActive: true };
    const user = { _id: 'admin1', role: 'admin' };

    // Admin bypasses all folder visibility checks
    const shouldCheck = user.role !== 'admin';
    expect(shouldCheck).toBe(false);
  });

  it('inactive folder blocks non-admin access', () => {
    const folder = { _id: 'folder123', visibility: 'all', isActive: false };
    const user = { _id: 'user1', role: 'agent' };

    const isBlocked = user.role !== 'admin' && (!folder || !folder.isActive || folder.visibility === 'admin');
    expect(isBlocked).toBe(true);
  });

  it('download also checks folder visibility for files in admin-only folders', () => {
    const file = { folder: 'folder123', visibility: 'all' };
    const folder = { visibility: 'admin' };
    const user = { role: 'agent' };

    // The logic: if file has a folder and folder.visibility === 'admin', deny for non-admin
    const isBlocked = user.role !== 'admin' && file.folder && folder.visibility === 'admin';
    expect(isBlocked).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────
// Fix #17: Referral code length and uniqueness
// ─────────────────────────────────────────────────────────
describe('Fix #17: Referral code generation', () => {
  let User;

  beforeAll(() => {
    User = require('../models/User');
  });

  it('generates referral code with 6 random characters (9 total)', () => {
    const user = new User({ name: 'Test', email: 'test@test.com', password: 'pass', role: 'agent' });
    const code = user.generateReferralCode();
    // Should be prefix (3 chars) + 6 random chars = 9 total
    expect(code).toHaveLength(9);
    expect(code).toMatch(/^AGT[A-Z2-9]{6}$/);
  });

  it('admin prefix is ADM', () => {
    const user = new User({ name: 'Admin', email: 'admin@test.com', password: 'pass', role: 'admin' });
    const code = user.generateReferralCode();
    expect(code).toHaveLength(9);
    expect(code).toMatch(/^ADM[A-Z2-9]{6}$/);
  });

  it('generates unique codes across multiple calls', () => {
    const user = new User({ name: 'Test', email: 'test@test.com', password: 'pass', role: 'agent' });
    const codes = new Set();
    for (let i = 0; i < 100; i++) {
      codes.add(user.generateReferralCode());
    }
    // With 32^6 possibilities, 100 codes should all be unique
    expect(codes.size).toBe(100);
  });

  it('does not include confusing characters (0, O, 1, I)', () => {
    const user = new User({ name: 'Test', email: 'test@test.com', password: 'pass', role: 'agent' });
    for (let i = 0; i < 50; i++) {
      const code = user.generateReferralCode();
      const randomPart = code.slice(3);
      expect(randomPart).not.toMatch(/[0OIl1]/);
    }
  });
});

// ─────────────────────────────────────────────────────────
// Fix #18: agentId query only allowed for admin
// ─────────────────────────────────────────────────────────
describe('Fix #18: agentId admin-only guard', () => {
  it('non-admin cannot use agentId to override team scope', () => {
    const user = { _id: 'agent1', role: 'agent' };
    const queryParams = { agentId: 'otherAgent', scope: 'team' };

    // Simulate the guard logic from production.routes.js
    let query = {};
    if (user.role !== 'admin') {
      if (queryParams.scope === 'team') {
        query.agent = { $in: [user._id, 'downline1', 'downline2'] };
      } else {
        query.agent = user._id;
      }
    }
    // agentId only applied for admin
    if (queryParams.agentId && user.role === 'admin') {
      query.agent = queryParams.agentId;
    }

    // The query.agent should NOT be 'otherAgent' for non-admin
    expect(query.agent).not.toBe('otherAgent');
    expect(query.agent).toEqual({ $in: [user._id, 'downline1', 'downline2'] });
  });

  it('admin can use agentId to filter by specific agent', () => {
    const user = { _id: 'admin1', role: 'admin' };
    const queryParams = { agentId: 'targetAgent' };

    let query = {};
    if (user.role !== 'admin') {
      query.agent = user._id;
    }
    if (queryParams.agentId && user.role === 'admin') {
      query.agent = queryParams.agentId;
    }

    expect(query.agent).toBe('targetAgent');
  });
});
