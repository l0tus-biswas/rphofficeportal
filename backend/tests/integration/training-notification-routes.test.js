/**
 * Integration Tests: Training, Notification, Broadcast Routes
 * Tests /api/training/*, /api/notifications/*, /api/broadcasts/*
 */
const request = require('supertest');

const User = require('../../models/User');
const SystemConfig = require('../../models/SystemConfig');
const Notification = require('../../models/Notification');
const Broadcast = require('../../models/Broadcast');
const { generateTestToken, generateAdminToken, createMockUser, createMockAdmin } = require('../helpers/test-utils');

describe('Integration: Training Routes (/api/training)', () => {
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

  it('should require authentication for training routes', async () => {
    const res = await request(app).get('/api/training');
    expect(res.status).toBe(401);
  });

  it('should allow authenticated users to access training', async () => {
    const res = await request(app)
      .get('/api/training')
      .set('Authorization', `Bearer ${agentToken}`);
    // Should pass auth (may be 200 or 404 depending on route structure)
    expect(res.status).not.toBe(401);
  });
});

describe('Integration: Notification Routes (/api/notifications)', () => {
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
    const res = await request(app).get('/api/notifications');
    expect(res.status).toBe(401);
  });

  it('should allow authenticated access', async () => {
    Notification.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue([])
      })
    });
    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).not.toBe(401);
  });
});

describe('Integration: Broadcast Routes (/api/broadcasts)', () => {
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

  it('should allow admin to access broadcasts', async () => {
    Broadcast.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([])
      })
    });
    const res = await request(app)
      .get('/api/broadcasts')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).not.toBe(401);
  });
});
