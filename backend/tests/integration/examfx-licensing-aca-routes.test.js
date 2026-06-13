/**
 * Integration Tests: ExamFX, Licensing, ACA, QuickBooks Routes
 */
const request = require('supertest');

const User = require('../../models/User');
const SystemConfig = require('../../models/SystemConfig');
const { generateTestToken, generateAdminToken, createMockUser, createMockAdmin } = require('../helpers/test-utils');

describe('Integration: ExamFX Routes (/api/examfx)', () => {
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

  it('should require authentication for examfx routes', async () => {
    const res = await request(app).get('/api/examfx/progress');
    expect(res.status).toBe(401);
  });
});

describe('Integration: Licensing Routes (/api/licensing)', () => {
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

  it('should require authentication for licensing routes', async () => {
    const res = await request(app).get('/api/licensing/progress');
    expect(res.status).toBe(401);
  });
});

describe('Integration: ACA Routes (/api/aca)', () => {
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

  it('should require authentication for ACA routes', async () => {
    const res = await request(app).get('/api/admin/aca-clients/batches');
    expect(res.status).toBe(401);
  });
});

describe('Integration: QuickBooks Routes (/api/quickbooks)', () => {
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

  it('should require authentication for quickbooks routes', async () => {
    const res = await request(app).get('/api/quickbooks/status');
    expect(res.status).toBe(401);
  });
});
