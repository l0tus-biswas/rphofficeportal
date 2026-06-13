/**
 * Unit Tests: utils/helpers.js
 * Tests all exported helper functions
 */

describe('Utils: helpers.js', () => {
  let helpers;

  beforeEach(() => {
    jest.resetModules();
    helpers = require('../../utils/helpers');
  });

  describe('generatePassword', () => {
    it('should generate a password of default length 10', () => {
      const password = helpers.generatePassword();
      expect(password).toHaveLength(10);
    });

    it('should generate a password of specified length', () => {
      const password = helpers.generatePassword(16);
      expect(password).toHaveLength(16);
    });

    it('should generate different passwords each time', () => {
      const p1 = helpers.generatePassword();
      const p2 = helpers.generatePassword();
      expect(p1).not.toBe(p2);
    });

    it('should only contain valid charset characters', () => {
      const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
      const password = helpers.generatePassword(100);
      for (const ch of password) {
        expect(charset).toContain(ch);
      }
    });

    it('should handle length 0', () => {
      const password = helpers.generatePassword(0);
      expect(password).toBe('');
    });

    it('should handle length 1', () => {
      const password = helpers.generatePassword(1);
      expect(password).toHaveLength(1);
    });
  });

  describe('generateToken', () => {
    it('should generate a valid JWT token', () => {
      const jwt = require('jsonwebtoken');
      const user = { _id: '507f1f77bcf86cd799439011' };
      const token = helpers.generateToken(user, 'test-secret', '1h');
      const decoded = jwt.verify(token, 'test-secret');
      expect(decoded.id).toBe('507f1f77bcf86cd799439011');
    });

    it('should respect the expiresIn parameter', () => {
      const jwt = require('jsonwebtoken');
      const user = { _id: 'user123' };
      const token = helpers.generateToken(user, 'test-secret', '2h');
      const decoded = jwt.decode(token);
      expect(decoded.exp - decoded.iat).toBe(7200); // 2 hours in seconds
    });
  });

  describe('sendResponse', () => {
    it('should send success response for status < 400', () => {
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      helpers.sendResponse(res, 200, { data: 'test' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: 'test' });
    });

    it('should send failure response for status >= 400', () => {
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      helpers.sendResponse(res, 404, { message: 'Not found' });
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Not found' });
    });

    it('should handle 400 boundary correctly', () => {
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      helpers.sendResponse(res, 400, { message: 'Bad request' });
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });
  });

  describe('errorResponse', () => {
    beforeEach(() => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('should return 400 for ValidationError', () => {
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const error = new Error('Validation failed');
      error.name = 'ValidationError';
      helpers.errorResponse(res, error);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 for CastError', () => {
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const error = new Error('Cast failed');
      error.name = 'CastError';
      helpers.errorResponse(res, error);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 409 for duplicate key error (code 11000)', () => {
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const error = new Error('Duplicate key');
      error.code = 11000;
      error.keyPattern = { email: 1 };
      helpers.errorResponse(res, error);
      expect(res.status).toHaveBeenCalledWith(409);
    });

    it('should return 401 for JsonWebTokenError', () => {
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const error = new Error('jwt malformed');
      error.name = 'JsonWebTokenError';
      helpers.errorResponse(res, error);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 401 for TokenExpiredError', () => {
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const error = new Error('jwt expired');
      error.name = 'TokenExpiredError';
      helpers.errorResponse(res, error);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should default to 500 for unknown errors', () => {
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      helpers.errorResponse(res, new Error('Something broke'));
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('should use explicit statusCode when provided', () => {
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      helpers.errorResponse(res, new Error('Custom'), 422);
      expect(res.status).toHaveBeenCalledWith(422);
    });

    it('should show error message in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      jest.resetModules();
      const h = require('../../utils/helpers');
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      h.errorResponse(res, new Error('Debug info'), 500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Debug info' }));
      process.env.NODE_ENV = originalEnv;
    });

    it('should hide error details in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      jest.resetModules();
      const h = require('../../utils/helpers');
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      h.errorResponse(res, new Error('Secret internal error'), 500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'An error occurred' }));
      process.env.NODE_ENV = originalEnv;
    });

    it('should show friendly message for duplicate key in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      jest.resetModules();
      const h = require('../../utils/helpers');
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const error = new Error('dup');
      error.code = 11000;
      error.keyPattern = { email: 1 };
      h.errorResponse(res, error);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ 
        message: 'A record with that email already exists' 
      }));
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('paginate', () => {
    it('should apply default pagination (page 1, limit 10)', () => {
      const query = { skip: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis() };
      helpers.paginate(query);
      expect(query.skip).toHaveBeenCalledWith(0);
      expect(query.limit).toHaveBeenCalledWith(10);
    });

    it('should calculate correct skip for page 2', () => {
      const query = { skip: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis() };
      helpers.paginate(query, 2, 10);
      expect(query.skip).toHaveBeenCalledWith(10);
    });

    it('should calculate correct skip for page 3, limit 5', () => {
      const query = { skip: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis() };
      helpers.paginate(query, 3, 5);
      expect(query.skip).toHaveBeenCalledWith(10);
      expect(query.limit).toHaveBeenCalledWith(5);
    });
  });

  describe('getDownlineIds', () => {
    it('should return empty array when user has no children', async () => {
      jest.doMock('../../models/User', () => ({
        findById: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ children: [] }) }) })
      }));
      jest.resetModules();
      const h = require('../../utils/helpers');
      const result = await h.getDownlineIds('user1');
      expect(result).toEqual([]);
    });

    it('should return all descendant IDs recursively', async () => {
      const mockUsers = {
        'root': { children: ['child1', 'child2'] },
        'child1': { children: ['grandchild1'] },
        'child2': { children: [] },
        'grandchild1': { children: [] }
      };
      jest.doMock('../../models/User', () => ({
        findById: jest.fn((id) => ({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(mockUsers[id] || null)
          })
        }))
      }));
      jest.resetModules();
      const h = require('../../utils/helpers');
      const result = await h.getDownlineIds('root');
      expect(result).toEqual(['child1', 'child2', 'grandchild1']);
    });

    it('should handle null user gracefully', async () => {
      jest.doMock('../../models/User', () => ({
        findById: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) })
      }));
      jest.resetModules();
      const h = require('../../utils/helpers');
      const result = await h.getDownlineIds('nonexistent');
      expect(result).toEqual([]);
    });
  });

  describe('safePath', () => {
    it('should resolve a valid relative path', () => {
      const result = helpers.safePath('uploads/document-hub/file.pdf');
      expect(result).not.toBeNull();
      expect(result).toContain('uploads');
    });

    it('should block path traversal with ../', () => {
      const result = helpers.safePath('../../etc/passwd');
      expect(result).toBeNull();
    });

    it('should block path traversal with backslashes', () => {
      const result = helpers.safePath('..\\..\\etc\\passwd');
      expect(result).toBeNull();
    });

    it('should allow deeply nested valid paths', () => {
      const result = helpers.safePath('uploads/onboarding/user123/doc.pdf');
      expect(result).not.toBeNull();
    });

    it('should block sneaky path traversal', () => {
      const result = helpers.safePath('uploads/../../../secret');
      expect(result).toBeNull();
    });
  });
});
