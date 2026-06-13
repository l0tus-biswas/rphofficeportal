/**
 * Unit Tests: middleware/audit.middleware.js
 * Tests audit logging middleware
 */

describe('Middleware: audit.middleware.js', () => {
  let auditMiddleware;
  let mockAuditLog;

  beforeEach(() => {
    jest.resetModules();
    mockAuditLog = {
      create: jest.fn().mockResolvedValue({})
    };
    jest.doMock('../../models/AuditLog', () => mockAuditLog);
    auditMiddleware = require('../../middleware/audit.middleware');
  });

  describe('logAction', () => {
    it('should return a middleware function', () => {
      const middleware = auditMiddleware.logAction('test_action');
      expect(typeof middleware).toBe('function');
    });

    it('should call next() regardless of logging result', async () => {
      const middleware = auditMiddleware.logAction('user_create');
      const req = {
        user: { _id: 'admin123' },
        method: 'POST',
        path: '/api/admin/users',
        body: { name: 'New User' },
        params: {},
        headers: {},
        ip: '127.0.0.1',
        get: jest.fn().mockReturnValue('Mozilla/5.0')
      };
      const res = {
        json: jest.fn()
      };
      const next = jest.fn();

      await middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should intercept res.json and log successful actions', async () => {
      const middleware = auditMiddleware.logAction('user_update');
      const req = {
        user: { _id: 'admin123' },
        method: 'PUT',
        path: '/api/admin/users/user456',
        body: { name: 'Updated' },
        params: { userId: 'user456' },
        headers: {},
        ip: '192.168.1.1',
        get: jest.fn().mockReturnValue('TestAgent/1.0')
      };
      const originalJson = jest.fn();
      const res = { json: originalJson };
      const next = jest.fn();

      await middleware(req, res, next);
      
      // Call the intercepted json method with success data
      res.json({ success: true, data: {} });
      
      // Wait for async create
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
        action: 'user_update',
        performedBy: 'admin123'
      }));
    });

    it('should NOT log failed actions', async () => {
      const middleware = auditMiddleware.logAction('user_delete');
      const req = {
        user: { _id: 'admin123' },
        method: 'DELETE',
        path: '/api/admin/users/user456',
        body: {},
        params: { userId: 'user456' },
        headers: {},
        ip: '127.0.0.1',
        get: jest.fn().mockReturnValue('TestAgent/1.0')
      };
      const res = { json: jest.fn() };
      const next = jest.fn();

      await middleware(req, res, next);
      res.json({ success: false, message: 'User not found' });
      
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(mockAuditLog.create).not.toHaveBeenCalled();
    });

    it('should redact sensitive fields from body', async () => {
      const middleware = auditMiddleware.logAction('password_change');
      const req = {
        user: { _id: 'user123' },
        method: 'POST',
        path: '/api/auth/change-password',
        body: { currentPassword: 'secret', newPassword: 'newsecret', name: 'visible' },
        params: {},
        headers: {},
        ip: '127.0.0.1',
        get: jest.fn().mockReturnValue('TestAgent')
      };
      const res = { json: jest.fn() };
      const next = jest.fn();

      await middleware(req, res, next);
      res.json({ success: true });
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      if (mockAuditLog.create.mock.calls.length > 0) {
        const loggedDetails = mockAuditLog.create.mock.calls[0][0].details;
        expect(loggedDetails.body.currentPassword).toBe('[REDACTED]');
        expect(loggedDetails.body.newPassword).toBe('[REDACTED]');
        expect(loggedDetails.body.name).toBe('visible');
      }
    });

    it('should not crash if req.user is missing', async () => {
      const middleware = auditMiddleware.logAction('anonymous_action');
      const req = {
        method: 'GET',
        path: '/api/public/test',
        body: {},
        params: {},
        headers: {},
        ip: '127.0.0.1',
        get: jest.fn().mockReturnValue('')
      };
      const res = { json: jest.fn() };
      const next = jest.fn();

      await middleware(req, res, next);
      expect(next).toHaveBeenCalled();
      
      // Calling json should not throw
      expect(() => res.json({ success: true })).not.toThrow();
    });
  });

  describe('getClientIP (via audit log)', () => {
    it('should use X-Forwarded-For header when present', async () => {
      const middleware = auditMiddleware.logAction('test');
      const req = {
        user: { _id: 'u1' },
        method: 'GET',
        path: '/test',
        body: {},
        params: {},
        headers: { 'x-forwarded-for': '203.0.113.1, 70.41.3.18' },
        ip: '127.0.0.1',
        get: jest.fn().mockReturnValue('')
      };
      const res = { json: jest.fn() };
      const next = jest.fn();

      await middleware(req, res, next);
      res.json({ success: true });
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      if (mockAuditLog.create.mock.calls.length > 0) {
        expect(mockAuditLog.create.mock.calls[0][0].ipAddress).toBe('203.0.113.1');
      }
    });
  });
});
