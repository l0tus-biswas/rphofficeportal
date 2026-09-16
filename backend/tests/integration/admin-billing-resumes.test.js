/**
 * Integration Tests: Admin visibility into scheduled billing resumes.
 *
 * Covers GET /api/admin/billing-resumes and
 *        DELETE /api/admin/users/:userId/billing-resume
 * Models are mocked globally via setup-integration.js.
 */
const request = require('supertest');

const User = require('../../models/User');
const { generateAdminToken, createMockAdmin, createMockUser } = require('../helpers/test-utils');

function asQuery(value) {
  const q = {
    select: jest.fn(() => q),
    sort: jest.fn(() => q),
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
    catch: (reject) => Promise.resolve(value).catch(reject)
  };
  return q;
}

const ADMIN_ID = 'admin-test-id';
const AGENT_ID = 'agent-test-id';

describe('Integration: Admin billing-resume visibility', () => {
  let app, adminToken;

  beforeAll(() => {
    const { app: expressApp } = require('../../server');
    app = expressApp;
    adminToken = generateAdminToken(ADMIN_ID);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function mockUsers(agentOverrides = {}) {
    const agent = createMockUser({ _id: AGENT_ID, role: 'agent', ...agentOverrides });
    const admin = createMockAdmin({ _id: ADMIN_ID });
    User.findById.mockImplementation((id) => asQuery(id === AGENT_ID ? agent : admin));
    return agent;
  }

  describe('GET /api/admin/billing-resumes', () => {
    it('requires admin auth', async () => {
      const res = await request(app).get('/api/admin/billing-resumes');
      expect(res.status).toBe(401);
    });

    it('lists users with a scheduled billing resume', async () => {
      mockUsers();
      const pendingAgent = { _id: AGENT_ID, name: 'Test Agent', pendingBillingResumeAt: new Date() };
      User.find.mockReturnValue(asQuery([pendingAgent]));

      const res = await request(app)
        .get('/api/admin/billing-resumes')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.billingResumes).toEqual([{ ...pendingAgent, pendingBillingResumeAt: pendingAgent.pendingBillingResumeAt.toISOString() }]);
    });
  });

  describe('DELETE /api/admin/users/:userId/billing-resume', () => {
    it('cancels a scheduled resume without touching billingExempt', async () => {
      const agent = mockUsers({ pendingBillingResumeAt: new Date(), billingResumeAttempts: 2, billingExempt: false });

      const res = await request(app)
        .delete(`/api/admin/users/${AGENT_ID}/billing-resume`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(agent.pendingBillingResumeAt).toBeNull();
      expect(agent.billingResumeAttempts).toBe(0);
      expect(agent.billingExempt).toBe(false);
      expect(agent.save).toHaveBeenCalled();
    });

    it('returns 400 when there is nothing scheduled to cancel', async () => {
      mockUsers({ pendingBillingResumeAt: null });

      const res = await request(app)
        .delete(`/api/admin/users/${AGENT_ID}/billing-resume`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
    });
  });
});
