/**
 * Integration Tests: User/Agent Routes
 * Tests /api/user/* and /api/agent/* endpoints
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');

const User = require('../../models/User');
const SystemConfig = require('../../models/SystemConfig');
const { generateTestToken, createMockUser } = require('../helpers/test-utils');

describe('Integration: User Routes (/api/user)', () => {
  let app, agentToken;

  beforeAll(() => {
    const { app: expressApp } = require('../../server');
    app = expressApp;
    agentToken = generateTestToken('test-user-id');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    User.findById.mockImplementation(() => ({
      select: jest.fn().mockResolvedValue(createMockUser())
    }));
    SystemConfig.findOne.mockImplementation(() => ({
      lean: jest.fn().mockResolvedValue({ value: 'true' })
    }));
  });

  describe('Authentication required', () => {
    it('should reject unauthenticated requests', async () => {
      const res = await request(app).get('/api/user/payments');
      expect(res.status).toBe(401);
    });

    it('should accept authenticated requests', async () => {
      User.findById.mockImplementation((id) => {
        if (typeof id === 'string' || (id && id.toString)) {
          return {
            select: jest.fn().mockReturnValue({
              populate: jest.fn().mockResolvedValue(createMockUser())
            })
          };
        }
        return { select: jest.fn().mockResolvedValue(createMockUser()) };
      });

      const res = await request(app)
        .get('/api/user/payments')
        .set('Authorization', `Bearer ${agentToken}`);
      // Should get through auth (200 or route-specific response)
      expect(res.status).not.toBe(401);
    });
  });
});

describe('Integration: Agent Routes (/api/agent)', () => {
  let app, agentToken;

  beforeAll(() => {
    const { app: expressApp } = require('../../server');
    app = expressApp;
    agentToken = generateTestToken('agent-user-id');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    User.findById.mockImplementation(() => ({
      select: jest.fn().mockResolvedValue(createMockUser({ _id: 'agent-user-id' }))
    }));
    SystemConfig.findOne.mockImplementation(() => ({
      lean: jest.fn().mockResolvedValue({ value: 'true' })
    }));
  });

  describe('Agent endpoints', () => {
    it('should require authentication', async () => {
      const res = await request(app).get('/api/agent/dashboard');
      expect(res.status).toBe(401);
    });
  });
});
