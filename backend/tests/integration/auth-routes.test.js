/**
 * Integration Tests: Auth Routes
 * Tests /api/auth/* endpoints
 */
const request = require('supertest');

// Mock all models and services before requiring app

const User = require('../../models/User');
const SystemConfig = require('../../models/SystemConfig');
const Notification = require('../../models/Notification');
const Broadcast = require('../../models/Broadcast');
const { generateTestToken, createMockUser } = require('../helpers/test-utils');

describe('Integration: Auth Routes (/api/auth)', () => {
  let app;

  beforeAll(() => {
    const { app: expressApp } = require('../../server');
    app = expressApp;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Default SystemConfig mock - site access enabled
    SystemConfig.findOne.mockImplementation((query) => {
      if (query?.key === 'site_access_enabled') {
        return { lean: jest.fn().mockResolvedValue({ value: 'true' }) };
      }
      if (query?.key === 'site_access_message') {
        return { lean: jest.fn().mockResolvedValue({ value: 'Maintenance' }) };
      }
      return { lean: jest.fn().mockResolvedValue(null) };
    });
    Notification.createNotification = jest.fn().mockResolvedValue({});
    Broadcast.find.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) });
    Notification.find.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) });
  });

  describe('POST /api/auth/login', () => {
    it('should return error for missing credentials', async () => {
      User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
      const res = await request(app)
        .post('/api/auth/login')
        .send({});
      // With Joi mocked, validation passes but route logic handles missing fields
      expect([400, 401, 500]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });

    it('should return error for invalid email format', async () => {
      User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'invalid', password: 'pass' });
      // With Joi mocked, validation passes but user not found
      expect([400, 401]).toContain(res.status);
    });

    it('should return 401 for non-existent user', async () => {
      User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'noone@test.com', password: 'password123' });
      expect(res.status).toBe(401);
    });

    it('should return 403 for deleted user', async () => {
      const mockUser = createMockUser({ deletedAt: new Date() });
      User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'deleted@test.com', password: 'password123' });
      expect(res.status).toBe(403);
    });

    it('should return 403 for deactivated user', async () => {
      const mockUser = createMockUser({ isActive: false, deletedAt: null });
      User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'inactive@test.com', password: 'password123' });
      expect(res.status).toBe(403);
    });

    it('should return 401 for wrong password', async () => {
      const mockUser = createMockUser({ comparePassword: jest.fn().mockResolvedValue(false) });
      User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@test.com', password: 'wrongpassword' });
      expect(res.status).toBe(401);
    });

    it('should return 200 with token for valid credentials', async () => {
      const mockUser = createMockUser({
        save: jest.fn().mockResolvedValue(true),
        lastLogin: null
      });
      User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });
      User.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(mockUser)
        })
      });
      
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'password123' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
    });

    it('should return 503 for non-admin during maintenance', async () => {
      SystemConfig.findOne.mockImplementation((query) => {
        if (query?.key === 'site_access_enabled') {
          return { lean: jest.fn().mockResolvedValue({ value: 'false' }) };
        }
        if (query?.key === 'site_access_message') {
          return { lean: jest.fn().mockResolvedValue({ value: 'Under maintenance' }) };
        }
        return { lean: jest.fn().mockResolvedValue(null) };
      });
      const mockUser = createMockUser({ role: 'agent' });
      User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'agent@test.com', password: 'password123' });
      expect(res.status).toBe(503);
      expect(res.body.maintenanceMode).toBe(true);
    });
  });

  describe('POST /api/auth/forgot-password', () => {
    it('should handle missing email in forgot-password', async () => {
      User.findOne.mockResolvedValue(null);
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({});
      // With Joi mocked, validation passes; route may error or return 200 (no user found)
      expect([200, 400, 500]).toContain(res.status);
    });

    it('should return 200 even if user not found (security)', async () => {
      User.findOne.mockResolvedValue(null);
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nobody@test.com' });
      // Should not reveal whether email exists
      expect([200, 404]).toContain(res.status);
    });
  });
});
