/**
 * Unit Tests: utils/neuzmail.js
 * Tests Neuzmail transactional email functions
 */

describe('Utils: neuzmail.js', () => {
  let neuzmail;
  let mockAxios;

  beforeEach(() => {
    jest.resetModules();
    mockAxios = {
      post: jest.fn().mockResolvedValue({
        status: 200,
        data: { id: 'msg_123', status: 'sent', messageId: '<abc@mail>' }
      })
    };
    jest.doMock('axios', () => mockAxios);
    process.env.NEUZMAIL_API_TOKEN = 'test-token';
    process.env.NEUZMAIL_API_URL = 'https://neuzmail.in';
    process.env.NEUZMAIL_TPL_WELCOME_PASSWORD = 'tpl-welcome-pwd';
    process.env.NEUZMAIL_TPL_WELCOME_SET_PASSWORD = 'tpl-welcome-setpwd';
    process.env.NEUZMAIL_TPL_PASSWORD_RESET = 'tpl-reset';
    process.env.NEUZMAIL_TPL_APA_CONFIRM = 'tpl-apa';
    process.env.NEUZMAIL_TPL_PAYMENT_LINK = 'tpl-payment';
    process.env.NEUZMAIL_TPL_ACCOUNT_ACTIVATED = 'tpl-activated';
    process.env.NEUZMAIL_TPL_NOTIFICATION = 'tpl-notif';
    neuzmail = require('../../utils/neuzmail');
  });

  describe('sendWelcomeEmail', () => {
    it('should send welcome email with password', async () => {
      await neuzmail.sendWelcomeEmail(
        { name: 'John', email: 'john@test.com', referralCode: 'AGT123' },
        'TempPass123',
        { name: 'Upline' }
      );
      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://neuzmail.in/api/v1/messages',
        expect.objectContaining({
          templateId: 'tpl-welcome-pwd',
          to: 'john@test.com',
          data: expect.objectContaining({
            USER_NAME: 'John',
            TEMP_PASSWORD: 'TempPass123'
          })
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('should handle missing referral agent', async () => {
      await neuzmail.sendWelcomeEmail(
        { name: 'Jane', email: 'jane@test.com', referralCode: '' },
        'Pass123'
      );
      expect(mockAxios.post).toHaveBeenCalled();
    });
  });

  describe('sendWelcomeSetPasswordEmail', () => {
    it('should send set-password welcome email', async () => {
      await neuzmail.sendWelcomeSetPasswordEmail(
        { name: 'Bob', email: 'bob@test.com' },
        'reset-token-123'
      );
      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://neuzmail.in/api/v1/messages',
        expect.objectContaining({
          templateId: 'tpl-welcome-setpwd',
          to: 'bob@test.com',
          data: expect.objectContaining({
            SET_PASSWORD_URL: expect.stringContaining('reset-token-123')
          })
        }),
        expect.any(Object)
      );
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('should send password reset email with correct URL', async () => {
      await neuzmail.sendPasswordResetEmail(
        { name: 'Alice', email: 'alice@test.com' },
        'reset-token-456'
      );
      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://neuzmail.in/api/v1/messages',
        expect.objectContaining({
          templateId: 'tpl-reset',
          to: 'alice@test.com',
          data: expect.objectContaining({
            RESET_URL: expect.stringContaining('reset-token-456')
          })
        }),
        expect.any(Object)
      );
    });
  });

  describe('sendApplicationConfirmationEmail', () => {
    it('should send APA application confirmation', async () => {
      const application = {
        _id: 'app123',
        personalInfo: {
          legalFirstName: 'John',
          legalLastName: 'Doe',
          email: 'john.doe@test.com'
        }
      };
      await neuzmail.sendApplicationConfirmationEmail(application);
      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://neuzmail.in/api/v1/messages',
        expect.objectContaining({
          templateId: 'tpl-apa',
          to: 'john.doe@test.com'
        }),
        expect.any(Object)
      );
    });
  });

  describe('verifyEmail', () => {
    it('should verify an email address', async () => {
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: {
          valid: true,
          email: 'test@example.com',
          domain: 'example.com',
          score: 4,
          maxScore: 4,
          isDisposable: false,
          hasMx: true,
          hasARecord: true,
          reason: 'Deliverable'
        }
      });

      const result = await neuzmail.verifyEmail('test@example.com');
      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://neuzmail.in/api/v1/verify',
        { email: 'test@example.com' },
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token'
          })
        })
      );
      expect(result.valid).toBe(true);
      expect(result.reason).toBe('Deliverable');
    });

    it('should throw when API token is missing for verify', async () => {
      delete process.env.NEUZMAIL_API_TOKEN;
      jest.resetModules();
      jest.doMock('axios', () => mockAxios);
      const nm = require('../../utils/neuzmail');
      await expect(nm.verifyEmail('test@example.com')).rejects.toThrow('NEUZMAIL_API_TOKEN is not configured');
    });
  });

  describe('error handling', () => {
    it('should throw when API token is missing', async () => {
      delete process.env.NEUZMAIL_API_TOKEN;
      jest.resetModules();
      jest.doMock('axios', () => mockAxios);
      const nm = require('../../utils/neuzmail');
      await expect(nm.sendWelcomeEmail(
        { name: 'X', email: 'x@test.com', referralCode: '' },
        'pass'
      )).rejects.toThrow();
    });

    it('should throw when API returns error status', async () => {
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: { status: 'error', message: 'Invalid template' }
      });
      await expect(neuzmail.sendPasswordResetEmail(
        { name: 'X', email: 'x@test.com' },
        'token'
      )).rejects.toThrow();
    });

    it('should throw on network error', async () => {
      mockAxios.post.mockRejectedValue(new Error('Network error'));
      await expect(neuzmail.sendPasswordResetEmail(
        { name: 'X', email: 'x@test.com' },
        'token'
      )).rejects.toThrow('Email could not be sent via Neuzmail');
    });

    it('should handle 202 suppressed response', async () => {
      mockAxios.post.mockResolvedValue({
        status: 202,
        data: { id: 'msg_456', status: 'suppressed' }
      });
      const result = await neuzmail.sendWelcomeEmail(
        { name: 'X', email: 'suppressed@test.com', referralCode: '' },
        'pass'
      );
      expect(result.status).toBe('suppressed');
    });
  });
});