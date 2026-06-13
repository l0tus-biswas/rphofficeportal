/**
 * Integration Tests: Document Hub, Onboarding, Production, Promotion Routes
 */
const request = require('supertest');

const User = require('../../models/User');
const SystemConfig = require('../../models/SystemConfig');
const { generateTestToken, generateAdminToken, createMockUser, createMockAdmin } = require('../helpers/test-utils');

describe('Integration: Document Hub Routes (/api/document-hub)', () => {
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

  it('should require authentication for document hub', async () => {
    const res = await request(app).get('/api/document-hub/files');
    expect(res.status).toBe(401);
  });

  it('should allow authenticated access', async () => {
    const DocumentHubFile = require('../../models/DocumentHubFile');
    DocumentHubFile.find = jest.fn().mockReturnValue({
      populate: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([])
        })
      })
    });
    const res = await request(app)
      .get('/api/document-hub/files')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).not.toBe(401);
  });
});

describe('Integration: Onboarding Routes (/api/onboarding)', () => {
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

  it('should require authentication', async () => {
    const res = await request(app).get('/api/onboarding/status');
    expect(res.status).toBe(401);
  });
});

describe('Integration: Onboarding Hub Routes (/api/onboarding-hub)', () => {
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
    const res = await request(app).get('/api/onboarding-hub/doc-types');
    expect(res.status).toBe(401);
  });
});

describe('Integration: Production Routes (/api/production)', () => {
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

  it('should require authentication', async () => {
    const res = await request(app).get('/api/production');
    expect(res.status).toBe(401);
  });
});

describe('Integration: Promotion Routes (/api/promotion)', () => {
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
    const res = await request(app).get('/api/promotion/levels');
    expect(res.status).toBe(401);
  });
});
