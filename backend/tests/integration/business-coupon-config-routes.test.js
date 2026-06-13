/**
 * Integration Tests: Business Cards, Coupon, Config Routes
 */
const request = require('supertest');

const User = require('../../models/User');
const SystemConfig = require('../../models/SystemConfig');
const { generateTestToken, generateAdminToken, createMockUser, createMockAdmin } = require('../helpers/test-utils');

describe('Integration: Business Cards Routes (/api/business-cards)', () => {
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

  it('should require authentication for business cards', async () => {
    const res = await request(app).get('/api/business-cards/orders');
    expect(res.status).toBe(401);
  });
});

describe('Integration: Coupon Routes (/api/admin/coupons)', () => {
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

  it('should require authentication for coupon management', async () => {
    const res = await request(app).get('/api/admin/coupons');
    expect(res.status).toBe(401);
  });

  it('should allow admin access to coupons', async () => {
    const Coupon = require('../../models/Coupon');
    Coupon.find = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([])
      })
    });
    const res = await request(app)
      .get('/api/admin/coupons')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).not.toBe(401);
  });
});

describe('Integration: Config Routes (/api/admin/config)', () => {
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

  it('should require authentication for config routes', async () => {
    const res = await request(app).get('/api/admin/config');
    expect(res.status).toBe(401);
  });
});
