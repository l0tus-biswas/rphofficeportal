/**
 * Integration Tests: Payment, Carrier, Commission Routes
 * Tests /api/payments/*, /api/carriers/*, /api/commission-statements/*
 */
const request = require('supertest');

const User = require('../../models/User');
const SystemConfig = require('../../models/SystemConfig');
const { generateTestToken, generateAdminToken, createMockUser, createMockAdmin } = require('../helpers/test-utils');

describe('Integration: Payment Routes (/api/payments)', () => {
  let app, agentToken;

  beforeAll(() => {
    const { app: expressApp } = require('../../server');
    app = expressApp;
    agentToken = generateTestToken('agent-id');
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

  it('should require authentication for payment routes', async () => {
    const res = await request(app).get('/api/payments/status');
    expect(res.status).toBe(401);
  });
});

describe('Integration: Carrier Routes (/api/carriers)', () => {
  let app, agentToken, adminToken;

  beforeAll(() => {
    const { app: expressApp } = require('../../server');
    app = expressApp;
    agentToken = generateTestToken('agent-id');
    adminToken = generateAdminToken();
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

  it('should require authentication', async () => {
    const res = await request(app).get('/api/carriers');
    expect(res.status).toBe(401);
  });

  it('should allow authenticated access to carriers list', async () => {
    const Carrier = require('../../models/Carrier');
    Carrier.find = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([])
      })
    });
    const res = await request(app)
      .get('/api/carriers')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).not.toBe(401);
  });
});

describe('Integration: Commission Statement Routes (/api/commission-statements)', () => {
  let app, adminToken;

  beforeAll(() => {
    const { app: expressApp } = require('../../server');
    app = expressApp;
    adminToken = generateAdminToken();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    User.findById.mockImplementation(() => ({
      select: jest.fn().mockResolvedValue(createMockAdmin())
    }));
    SystemConfig.findOne.mockImplementation(() => ({
      lean: jest.fn().mockResolvedValue({ value: 'true' })
    }));
  });

  it('should require authentication', async () => {
    const res = await request(app).get('/api/commission-statements');
    expect(res.status).toBe(401);
  });
});
