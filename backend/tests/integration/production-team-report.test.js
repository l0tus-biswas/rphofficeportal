/**
 * Integration Tests: Team Report (GET /api/production/team-report)
 *
 * The Production page shows ALL In Force production (every product category,
 * unlike the Promotion Tracker which only counts Life + Supplemental).
 * "Team" = the agent's own production + the whole downline, so an agent with
 * no downline still has a team of one and must see their own premium.
 */
const request = require('supertest');

const User = require('../../models/User');
const SystemConfig = require('../../models/SystemConfig');
const ProductionSubmission = require('../../models/ProductionSubmission');
const { generateTestToken, generateAdminToken, createMockUser, createMockAdmin } = require('../helpers/test-utils');

/**
 * Wire User.findById for BOTH call shapes used on this route:
 *  - auth middleware:        await User.findById(id).select(...)          -> user doc
 *  - getDownlineIds (BFS):   await User.findById(id).select(...).lean()   -> { children, role, ... }
 * `tree` maps id -> array of child ids. `authDocs` maps id -> auth user doc.
 */
function mockUsers(tree, authDocs) {
  User.findById.mockImplementation((id) => ({
    select: jest.fn().mockImplementation(() => {
      const doc = authDocs[id] || createMockUser({ _id: id });
      const result = Promise.resolve(doc);
      result.lean = () => Promise.resolve({
        _id: id, role: doc.role, isActive: true, deletedAt: null, children: tree[id] || []
      });
      return result;
    })
  }));
}

function mockSubmissions(rows) {
  ProductionSubmission.find.mockReturnValue({ select: jest.fn().mockResolvedValue(rows) });
}

describe('Integration: Team Report (/api/production/team-report)', () => {
  let app, agentToken, adminToken;

  beforeAll(() => {
    const { app: expressApp } = require('../../server');
    app = expressApp;
    agentToken = generateTestToken('agent-id');
    adminToken = generateAdminToken('admin-id');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    SystemConfig.findOne.mockImplementation(() => ({
      lean: jest.fn().mockResolvedValue({ value: 'true' })
    }));
    User.countDocuments.mockResolvedValue(0);
    mockSubmissions([]);
  });

  const agentQuery = () => ProductionSubmission.find.mock.calls[0][0];
  const agentIdsOf = (q) => (q.agent ? q.agent.$in.map(String) : null);

  it('requires authentication', async () => {
    const res = await request(app).get('/api/production/team-report');
    expect(res.status).toBe(401);
  });

  it('agent with NO downline sees their own premium (team of one), not zeros', async () => {
    mockUsers({ 'agent-id': [] }, { 'agent-id': createMockUser({ _id: 'agent-id' }) });
    mockSubmissions([{ premiumAmount: 758, agent: 'agent-id' }]);
    User.countDocuments.mockResolvedValueOnce(0).mockResolvedValueOnce(1); // recruits, active agents

    const res = await request(app)
      .get('/api/production/team-report')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.totalPremiumInForce).toBe(758);
    expect(res.body.activeAgents).toBe(1);
    expect(agentIdsOf(agentQuery())).toEqual(['agent-id']);
  });

  it('agent with a downline sees own + downline premium, scoped to exactly that tree', async () => {
    mockUsers(
      { 'agent-id': ['child-1'], 'child-1': ['child-2'], 'child-2': [] },
      { 'agent-id': createMockUser({ _id: 'agent-id' }) }
    );
    mockSubmissions([
      { premiumAmount: 758, agent: 'agent-id' },
      { premiumAmount: 1000, agent: 'child-1' },
      { premiumAmount: 250, agent: 'child-2' }
    ]);

    const res = await request(app)
      .get('/api/production/team-report')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.totalPremiumInForce).toBe(2008);
    expect(agentIdsOf(agentQuery()).sort()).toEqual(['agent-id', 'child-1', 'child-2']);
  });

  it('counts only In Force, non-deleted policies and applies NO product-category restriction (all production)', async () => {
    mockUsers({ 'agent-id': [] }, { 'agent-id': createMockUser({ _id: 'agent-id' }) });

    await request(app)
      .get('/api/production/team-report')
      .set('Authorization', `Bearer ${agentToken}`);

    const q = agentQuery();
    expect(q.status).toBe('In Force');
    expect(q.deletedAt).toBeNull();
    // The Promotion Tracker restricts to Life + Supplemental; this page must not.
    expect(q).not.toHaveProperty('productCategory');
  });

  it('scopes recruits and active-agent counts to the same agent set', async () => {
    mockUsers({ 'agent-id': ['child-1'], 'child-1': [] }, { 'agent-id': createMockUser({ _id: 'agent-id' }) });

    await request(app)
      .get('/api/production/team-report')
      .set('Authorization', `Bearer ${agentToken}`);

    const calls = User.countDocuments.mock.calls.map(c => c[0]);
    const recruits = calls.find(q => q.referredBy);
    const active = calls.find(q => q._id);
    expect(recruits.referredBy.$in.map(String).sort()).toEqual(['agent-id', 'child-1']);
    expect(active._id.$in.map(String).sort()).toEqual(['agent-id', 'child-1']);
  });

  it('admin with no filter is not restricted to an agent set (all production)', async () => {
    mockUsers({}, { 'admin-id': createMockAdmin({ _id: 'admin-id' }) });
    mockSubmissions([{ premiumAmount: 5000, agent: 'a' }, { premiumAmount: 100, agent: 'b' }]);

    const res = await request(app)
      .get('/api/production/team-report')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.totalPremiumInForce).toBe(5100);
    expect(agentIdsOf(agentQuery())).toBeNull();
  });

  it('admin filtering by agentId reports that agent + their downline', async () => {
    mockUsers({ 'agent-x': ['child-y'], 'child-y': [] }, { 'admin-id': createMockAdmin({ _id: 'admin-id' }) });

    await request(app)
      .get('/api/production/team-report?agentId=agent-x')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(agentIdsOf(agentQuery()).sort()).toEqual(['agent-x', 'child-y']);
  });
});
