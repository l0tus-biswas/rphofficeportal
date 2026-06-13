/**
 * Unit Tests: middleware/auth.middleware.js
 * Tests authentication and authorization middleware
 */
const jwt = require('jsonwebtoken');

describe('Middleware: auth.middleware.js', () => {
  let authMiddleware;
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('../../models/User', () => ({
      findById: jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({
          _id: 'user123',
          role: 'agent',
          isActive: true,
          deletedAt: null
        })
      })
    }));
    jest.doMock('../../models/SystemConfig', () => ({
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ value: 'true' })
      })
    }));

    authMiddleware = require('../../middleware/auth.middleware');

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    mockNext = jest.fn();
  });

  describe('protect', () => {
    it('should reject request without authorization header', async () => {
      mockReq = { headers: {} };
      await authMiddleware.protect(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Not authorized to access this route'
      }));
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject request with invalid token format', async () => {
      mockReq = { headers: { authorization: 'InvalidFormat token123' } };
      await authMiddleware.protect(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    it('should reject request with expired token', async () => {
      const expiredToken = jwt.sign({ id: 'user123' }, process.env.JWT_SECRET, { expiresIn: '-1h' });
      mockReq = { headers: { authorization: `Bearer ${expiredToken}` } };
      await authMiddleware.protect(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    it('should accept valid token and set req.user', async () => {
      const token = jwt.sign({ id: 'user123' }, process.env.JWT_SECRET, { expiresIn: '1h' });
      mockReq = { headers: { authorization: `Bearer ${token}` } };
      await authMiddleware.protect(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user).toBeDefined();
      expect(mockReq.user._id).toBe('user123');
    });

    it('should reject when user is not found', async () => {
      jest.resetModules();
      jest.doMock('../../models/User', () => ({
        findById: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue(null)
        })
      }));
      jest.doMock('../../models/SystemConfig', () => ({
        findOne: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({ value: 'true' })
        })
      }));
      const auth = require('../../middleware/auth.middleware');
      const token = jwt.sign({ id: 'nonexistent' }, process.env.JWT_SECRET, { expiresIn: '1h' });
      mockReq = { headers: { authorization: `Bearer ${token}` } };
      await auth.protect(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'User not found'
      }));
    });

    it('should reject deleted user', async () => {
      jest.resetModules();
      jest.doMock('../../models/User', () => ({
        findById: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({
            _id: 'user123',
            role: 'agent',
            isActive: true,
            deletedAt: new Date()
          })
        })
      }));
      jest.doMock('../../models/SystemConfig', () => ({
        findOne: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({ value: 'true' })
        })
      }));
      const auth = require('../../middleware/auth.middleware');
      const token = jwt.sign({ id: 'user123' }, process.env.JWT_SECRET, { expiresIn: '1h' });
      mockReq = { headers: { authorization: `Bearer ${token}` } };
      await auth.protect(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Account has been deleted'
      }));
    });

    it('should reject deactivated user', async () => {
      jest.resetModules();
      jest.doMock('../../models/User', () => ({
        findById: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({
            _id: 'user123',
            role: 'agent',
            isActive: false,
            deletedAt: null
          })
        })
      }));
      jest.doMock('../../models/SystemConfig', () => ({
        findOne: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({ value: 'true' })
        })
      }));
      const auth = require('../../middleware/auth.middleware');
      const token = jwt.sign({ id: 'user123' }, process.env.JWT_SECRET, { expiresIn: '1h' });
      mockReq = { headers: { authorization: `Bearer ${token}` } };
      await auth.protect(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Account is deactivated'
      }));
    });

    it('should skip maintenance check for admin users', async () => {
      jest.resetModules();
      jest.doMock('../../models/User', () => ({
        findById: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({
            _id: 'admin1',
            role: 'admin',
            isActive: true,
            deletedAt: null
          })
        })
      }));
      jest.doMock('../../models/SystemConfig', () => ({
        findOne: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({ value: 'false' }) // maintenance mode ON
        })
      }));
      const auth = require('../../middleware/auth.middleware');
      const token = jwt.sign({ id: 'admin1' }, process.env.JWT_SECRET, { expiresIn: '1h' });
      mockReq = { headers: { authorization: `Bearer ${token}` } };
      await auth.protect(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should block non-admin during maintenance mode', async () => {
      jest.resetModules();
      jest.doMock('../../models/User', () => ({
        findById: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({
            _id: 'agent1',
            role: 'agent',
            isActive: true,
            deletedAt: null
          })
        })
      }));
      jest.doMock('../../models/SystemConfig', () => ({
        findOne: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({ value: 'false' })
        })
      }));
      const auth = require('../../middleware/auth.middleware');
      const token = jwt.sign({ id: 'agent1' }, process.env.JWT_SECRET, { expiresIn: '1h' });
      mockReq = { headers: { authorization: `Bearer ${token}` } };
      await auth.protect(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(503);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        maintenanceMode: true
      }));
    });
  });
});
