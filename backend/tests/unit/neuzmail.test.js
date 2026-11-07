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
          template_id: 'tpl-welcome-pwd',
          to: 'john@test.com',
          params: expect.objectContaining({
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
          template_id: 'tpl-welcome-setpwd',
          to: 'bob@test.com',
          params: expect.objectContaining({
            FIRST_NAME: 'Bob',
            UNSUBSCRIBE_URL: expect.any(String),
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
          template_id: 'tpl-reset',
          to: 'alice@test.com',
          params: expect.objectContaining({
            FIRST_NAME: 'Alice',
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
          template_id: 'tpl-apa',
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
          email: 'test@example.com',
          status: 'deliverable',
          reasons: [],
          suggestion: null,
          mode: 'basic',
          cached: false
        }
      });

      const result = await neuzmail.verifyEmail('test@example.com');
      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://neuzmail.in/api/v1/email-verifications',
        { email: 'test@example.com' },
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token'
          })
        })
      );
      expect(result.valid).toBe(true);
      expect(result.status).toBe('deliverable');
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
        status: 202,
        data: { id: 'm', ids: ['m'], status: 'queued', recipients: 1, results: [{ id: 'm', to: 'x@test.com', status: 'failed', error: 'provider rejected' }] }
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

    it('retries without "from" when the sender is not verified', async () => {
      const err = Object.assign(new Error('409'), { response: { status: 409, data: { error: { code: 'no_sender', message: 'x' } } } });
      mockAxios.post.mockRejectedValueOnce(err);
      const result = await neuzmail.sendPasswordResetEmail({ name: 'A B', email: 'a@test.com' }, 'tok');
      expect(result.success).toBe(true);
      expect(mockAxios.post).toHaveBeenCalledTimes(2);
      expect(mockAxios.post.mock.calls[1][1].from).toBeUndefined();
    });

    it('sends only the variables the template declares', async () => {
      await neuzmail.sendPasswordResetEmail({ name: 'A B', email: 'a@test.com' }, 'tok');
      const body = mockAxios.post.mock.calls[0][1];
      expect(Object.keys(body.params).sort()).toEqual(['APP_NAME', 'CURRENT_YEAR', 'FIRST_NAME', 'RESET_URL', 'UNSUBSCRIBE_URL']);
    });

    it('should handle blocked (suppressed) response', async () => {
      mockAxios.post.mockResolvedValue({
        status: 202,
        data: { id: 'msg_456', ids: ['msg_456'], status: 'queued', recipients: 1, results: [{ id: 'msg_456', to: 'suppressed@test.com', status: 'blocked', error: 'suppressed' }] }
      });
      const result = await neuzmail.sendWelcomeEmail(
        { name: 'X', email: 'suppressed@test.com', referralCode: '' },
        'pass'
      );
      expect(result.status).toBe('suppressed');
    });
  });
});