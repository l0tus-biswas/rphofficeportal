/**
 * Integration Tests: Server Configuration & Error Handling
 * Tests server.js app configuration, middleware order, and error handling
 */
const request = require('supertest');

describe('Integration: Server Configuration', () => {
  let app;

  beforeAll(() => {
    const { app: expressApp } = require('../../server');
    app = expressApp;
  });

  describe('Security Headers', () => {
    it('should set Helmet security headers', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBeDefined();
    });

    it('should set CSP headers', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['content-security-policy']).toBeDefined();
    });
  });

  describe('CORS', () => {
    it('should allow requests from configured origin', async () => {
      const res = await request(app)
        .get('/health')
        .set('Origin', process.env.APP_URL || 'http://localhost:4200');
      expect(res.status).toBe(200);
    });

    it('should reject requests from unauthorized origin', async () => {
      const res = await request(app)
        .get('/api/auth/login')
        .set('Origin', 'http://evil-site.com')
        .send({ email: 'a@b.com', password: 'test' });
      // CORS error manifests differently in supertest vs browser
      // The middleware may still process the request but won't add CORS headers
      expect(res.headers['access-control-allow-origin']).not.toBe('http://evil-site.com');
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for unknown API routes gracefully', async () => {
      const res = await request(app).get('/api/nonexistent-route-xyz');
      // Should either be 404 or fall through to SPA handler
      expect([404, 503, 200]).toContain(res.status);
    });

    it('should handle JSON parse errors', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('not valid json{{{');
      expect(res.status).toBe(400);
    });
  });

  describe('Health Check', () => {
    it('should respond to /health with status OK', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('OK');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('Static File Serving', () => {
    it('should protect non-public upload paths', async () => {
      const res = await request(app).get('/uploads/commission-statements/secret.pdf');
      expect(res.status).toBe(401);
    });

    it('should allow access to public branding uploads', async () => {
      const res = await request(app).get('/uploads/branding/logo.png');
      // 404 is fine - we just need to verify it doesn't require auth
      expect(res.status).not.toBe(401);
    });

    it('should allow access to public broadcast images', async () => {
      const res = await request(app).get('/uploads/broadcast-images/img.jpg');
      expect(res.status).not.toBe(401);
    });
  });

  describe('Server Exports', () => {
    it('should export app, httpServer, io, connectDatabase, startServer', () => {
      const server = require('../../server');
      expect(server.app).toBeDefined();
      expect(server.httpServer).toBeDefined();
      expect(server.io).toBeDefined();
      expect(server.connectDatabase).toBeDefined();
      expect(server.startServer).toBeDefined();
    });
  });
});
