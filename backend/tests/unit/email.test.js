/**
 * Unit Tests: utils/email.js
 * Tests email utility functions
 */

describe('Utils: email.js', () => {
  let emailUtils;
  let mockTransporter;

  beforeEach(() => {
    jest.resetModules();
    mockTransporter = {
      sendMail: jest.fn().mockResolvedValue({ messageId: 'test-msg-id' })
    };
    jest.doMock('nodemailer', () => ({
      createTransport: jest.fn(() => mockTransporter)
    }));
    jest.doMock('../../models/SystemConfig', () => ({
      findOne: jest.fn().mockResolvedValue({ value: 'TestApp' })
    }));
    emailUtils = require('../../utils/email');
  });

  describe('sendEmail', () => {
    it('should send an email with correct options', async () => {
      const result = await emailUtils.sendEmail({
        email: 'user@test.com',
        subject: 'Test Subject',
        html: '<p>Hello</p>'
      });
      expect(result.success).toBe(true);
      expect(result.messageId).toBe('test-msg-id');
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@test.com',
          subject: 'Test Subject',
          html: '<p>Hello</p>'
        })
      );
    });

    it('should throw when email fails to send', async () => {
      mockTransporter.sendMail.mockRejectedValue(new Error('SMTP error'));
      await expect(emailUtils.sendEmail({
        email: 'user@test.com',
        subject: 'Test',
        html: '<p>Test</p>'
      })).rejects.toThrow('Email could not be sent');
    });

    it('should use message field as html fallback', async () => {
      await emailUtils.sendEmail({
        email: 'user@test.com',
        subject: 'Test',
        message: '<p>Fallback</p>'
      });
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: '<p>Fallback</p>'
        })
      );
    });
  });

  describe('sendWelcomeEmail', () => {
    it('should send welcome email with correct template data', async () => {
      const user = { name: 'John', email: 'john@test.com', referralCode: 'AGT123' };
      await emailUtils.sendWelcomeEmail(user, 'TempPass123', { name: 'Upline Agent' });
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'john@test.com',
          subject: expect.stringContaining('Welcome')
        })
      );
    });

    it('should handle user without referral', async () => {
      const user = { name: 'Jane', email: 'jane@test.com' };
      await emailUtils.sendWelcomeEmail(user, 'TempPass456', null);
      expect(mockTransporter.sendMail).toHaveBeenCalled();
    });
  });
});
