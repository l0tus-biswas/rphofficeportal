/**
 * Unit Tests: middleware/validation.middleware.js
 * Tests request validation middleware and schemas
 */

describe('Middleware: validation.middleware.js', () => {
  let validation;
  let mockRes, mockNext;

  beforeEach(() => {
    validation = require('../../middleware/validation.middleware');
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    mockNext = jest.fn();
  });

  describe('validateRequest', () => {
    it('should call next() for valid data', () => {
      const middleware = validation.validateRequest(validation.schemas.login);
      const req = { body: { email: 'test@test.com', password: 'password123' } };
      middleware(req, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid data', () => {
      const middleware = validation.validateRequest(validation.schemas.login);
      const req = { body: { email: 'not-an-email', password: '' } };
      middleware(req, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Validation error',
        errors: expect.any(Array)
      }));
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should report all validation errors (abortEarly: false)', () => {
      const middleware = validation.validateRequest(validation.schemas.login);
      const req = { body: {} };
      middleware(req, mockRes, mockNext);
      const response = mockRes.json.mock.calls[0][0];
      expect(response.errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('schemas.login', () => {
    it('should accept valid login data', () => {
      const { error } = validation.schemas.login.validate({
        email: 'user@example.com',
        password: 'mypassword'
      });
      expect(error).toBeUndefined();
    });

    it('should reject missing email', () => {
      const { error } = validation.schemas.login.validate({ password: 'pass' });
      expect(error).toBeDefined();
    });

    it('should reject invalid email format', () => {
      const { error } = validation.schemas.login.validate({
        email: 'notanemail',
        password: 'pass'
      });
      expect(error).toBeDefined();
    });

    it('should reject missing password', () => {
      const { error } = validation.schemas.login.validate({ email: 'a@b.com' });
      expect(error).toBeDefined();
    });
  });

  describe('schemas.applyForm', () => {
    it('should accept valid apply form', () => {
      const { error } = validation.schemas.applyForm.validate({
        name: 'John Doe',
        email: 'john@test.com',
        phone: '1234567890'
      });
      expect(error).toBeUndefined();
    });

    it('should reject name too short', () => {
      const { error } = validation.schemas.applyForm.validate({
        name: 'A',
        email: 'john@test.com',
        phone: '1234567890'
      });
      expect(error).toBeDefined();
    });

    it('should reject missing required fields', () => {
      const { error } = validation.schemas.applyForm.validate({});
      expect(error).toBeDefined();
    });

    it('should accept optional fields', () => {
      const { error } = validation.schemas.applyForm.validate({
        name: 'John Doe',
        email: 'john@test.com',
        phone: '1234567890',
        address: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zipCode: '12345'
      });
      expect(error).toBeUndefined();
    });
  });

  describe('schemas.updateProfile', () => {
    it('should accept valid profile update', () => {
      const { error } = validation.schemas.updateProfile.validate({
        name: 'Updated Name',
        phone: '9876543210'
      });
      expect(error).toBeUndefined();
    });

    it('should accept empty object (all fields optional)', () => {
      const { error } = validation.schemas.updateProfile.validate({});
      expect(error).toBeUndefined();
    });

    it('should reject name too short', () => {
      const { error } = validation.schemas.updateProfile.validate({ name: 'X' });
      expect(error).toBeDefined();
    });

    it('should accept timezone field', () => {
      const { error } = validation.schemas.updateProfile.validate({
        timezone: 'America/New_York'
      });
      expect(error).toBeUndefined();
    });

    it('should accept null/empty timezone', () => {
      const { error } = validation.schemas.updateProfile.validate({ timezone: '' });
      expect(error).toBeUndefined();
    });
  });

  describe('schemas.changePassword', () => {
    it('should accept valid password change', () => {
      const { error } = validation.schemas.changePassword.validate({
        currentPassword: 'oldpass',
        newPassword: 'newpass123'
      });
      expect(error).toBeUndefined();
    });

    it('should reject new password too short', () => {
      const { error } = validation.schemas.changePassword.validate({
        currentPassword: 'old',
        newPassword: '12345'
      });
      expect(error).toBeDefined();
    });
  });

  describe('schemas.forgotPassword', () => {
    it('should accept valid email', () => {
      const { error } = validation.schemas.forgotPassword.validate({ email: 'test@test.com' });
      expect(error).toBeUndefined();
    });

    it('should reject invalid email', () => {
      const { error } = validation.schemas.forgotPassword.validate({ email: 'notvalid' });
      expect(error).toBeDefined();
    });
  });

  describe('schemas.resetPassword', () => {
    it('should accept valid password', () => {
      const { error } = validation.schemas.resetPassword.validate({ password: 'newpassword' });
      expect(error).toBeUndefined();
    });

    it('should reject short password', () => {
      const { error } = validation.schemas.resetPassword.validate({ password: '12345' });
      expect(error).toBeDefined();
    });
  });

  describe('schemas.createUser', () => {
    it('should accept valid user creation', () => {
      const { error } = validation.schemas.createUser.validate({
        name: 'New User',
        email: 'new@test.com',
        phone: '1234567890',
        role: 'agent'
      });
      expect(error).toBeUndefined();
    });

    it('should reject invalid role', () => {
      const { error } = validation.schemas.createUser.validate({
        name: 'User',
        email: 'u@t.com',
        phone: '1234567890',
        role: 'superadmin'
      });
      expect(error).toBeDefined();
    });

    it('should accept optional password', () => {
      const { error } = validation.schemas.createUser.validate({
        name: 'User',
        email: 'u@t.com',
        phone: '1234567890',
        role: 'admin',
        password: 'secret123'
      });
      expect(error).toBeUndefined();
    });
  });

  describe('schemas.trainingMaterial', () => {
    it('should accept valid training material', () => {
      const { error } = validation.schemas.trainingMaterial.validate({
        title: 'Training Video',
        type: 'youtube',
        url: 'https://youtube.com/watch?v=123'
      });
      expect(error).toBeUndefined();
    });

    it('should reject invalid type', () => {
      const { error } = validation.schemas.trainingMaterial.validate({
        title: 'Training',
        type: 'invalid_type',
        url: 'https://example.com'
      });
      expect(error).toBeDefined();
    });

    it('should reject invalid URL', () => {
      const { error } = validation.schemas.trainingMaterial.validate({
        title: 'Training',
        type: 'link',
        url: 'not-a-url'
      });
      expect(error).toBeDefined();
    });
  });

  describe('schemas.incomePaid', () => {
    it('should accept a valid submission', () => {
      const { error } = validation.schemas.incomePaid.validate({
        amount: 5000,
        datePaidByCarrier: '2026-01-01',
        notes: 'January carrier statement'
      });
      expect(error).toBeUndefined();
    });

    it('should accept a submission with no notes (optional)', () => {
      const { error } = validation.schemas.incomePaid.validate({
        amount: 5000,
        datePaidByCarrier: '2026-01-01'
      });
      expect(error).toBeUndefined();
    });

    it('should reject a negative amount', () => {
      const { error } = validation.schemas.incomePaid.validate({
        amount: -100,
        datePaidByCarrier: '2026-01-01'
      });
      expect(error).toBeDefined();
    });

    it('should reject a missing amount', () => {
      const { error } = validation.schemas.incomePaid.validate({
        datePaidByCarrier: '2026-01-01'
      });
      expect(error).toBeDefined();
    });

    it('should reject a missing datePaidByCarrier', () => {
      const { error } = validation.schemas.incomePaid.validate({
        amount: 5000
      });
      expect(error).toBeDefined();
    });

    it('should reject an invalid datePaidByCarrier', () => {
      const { error } = validation.schemas.incomePaid.validate({
        amount: 5000,
        datePaidByCarrier: 'not-a-date'
      });
      expect(error).toBeDefined();
    });

    it('should accept an amount of exactly 0', () => {
      const { error } = validation.schemas.incomePaid.validate({
        amount: 0,
        datePaidByCarrier: '2026-01-01'
      });
      expect(error).toBeUndefined();
    });
  });
});
