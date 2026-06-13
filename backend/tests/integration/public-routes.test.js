/**
 * Integration Tests: Public Routes
 * Tests /api/public/* endpoints
 */
const request = require('supertest');

const SystemConfig = require('../../models/SystemConfig');
const User = require('../../models/User');

describe('Integration: Public Routes (/api/public)', () => {
  let app;

  beforeAll(() => {
    const { app: expressApp } = require('../../server');
    app = expressApp;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/public/branding', () => {
    it('should return branding configuration', async () => {
      SystemConfig.findOne.mockImplementation((query) => {
        if (query?.key === 'app_name') return Promise.resolve({ value: 'TestApp' });
        if (query?.key === 'app_logo') return Promise.resolve({ value: '/uploads/branding/logo.png' });
        return Promise.resolve(null);
      });

      const res = await request(app).get('/api/public/branding');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.appName).toBe('TestApp');
      expect(res.body.appLogo).toBe('/uploads/branding/logo.png');
    });

    it('should return defaults when no config exists', async () => {
      SystemConfig.findOne.mockResolvedValue(null);
      const res = await request(app).get('/api/public/branding');
      expect(res.status).toBe(200);
      expect(res.body.appName).toBe('Escape');
      expect(res.body.appLogo).toBeNull();
    });
  });

  describe('GET /api/public/timezone', () => {
    it('should return configured timezone', async () => {
      SystemConfig.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ value: 'America/Chicago' })
      });
      const res = await request(app).get('/api/public/timezone');
      expect(res.status).toBe(200);
      expect(res.body.timezone).toBe('America/Chicago');
    });

    it('should return default timezone when not configured', async () => {
      SystemConfig.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null)
      });
      const res = await request(app).get('/api/public/timezone');
      expect(res.status).toBe(200);
      expect(res.body.timezone).toBe('America/New_York');
    });
  });

  describe('GET /api/public/site-access', () => {
    it('should return site access enabled state', async () => {
      SystemConfig.findOne.mockImplementation((query) => ({
        lean: jest.fn().mockResolvedValue(
          query?.key === 'site_access_enabled' ? { value: 'true' } :
          query?.key === 'site_access_message' ? { value: 'All good' } : null
        )
      }));
      const res = await request(app).get('/api/public/site-access');
      expect(res.status).toBe(200);
      expect(res.body.siteAccessEnabled).toBe(true);
    });

    it('should return maintenance mode state', async () => {
      SystemConfig.findOne.mockImplementation((query) => ({
        lean: jest.fn().mockResolvedValue(
          query?.key === 'site_access_enabled' ? { value: 'false' } :
          query?.key === 'site_access_message' ? { value: 'Maintenance in progress' } : null
        )
      }));
      const res = await request(app).get('/api/public/site-access');
      expect(res.status).toBe(200);
      expect(res.body.siteAccessEnabled).toBe(false);
      expect(res.body.siteAccessMessage).toBe('Maintenance in progress');
    });
  });

  describe('GET /health', () => {
    it('should return OK status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('OK');
      expect(res.body.timestamp).toBeDefined();
    });
  });
});
