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
        data: { status: 'success', data: { message_id: 'nz-msg-123' } }
      })
    };
    jest.doMock('axios', () => mockAxios);
    process.env.NEUZMAIL_API_TOKEN = 'test-token';
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
        expect.stringContaining('neuzmail'),
        expect.objectContaining({
          template_uid: 'tpl-welcome-pwd',
          to_email: 'john@test.com',
          merge_fields: expect.objectContaining({
            USER_NAME: 'John',
            TEMP_PASSWORD: 'TempPass123'
          })
        }),
        expect.any(Object)
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
        expect.any(String),
        expect.objectContaining({
          template_uid: 'tpl-welcome-setpwd',
          to_email: 'bob@test.com',
          merge_fields: expect.objectContaining({
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
        expect.any(String),
        expect.objectContaining({
          template_uid: 'tpl-reset',
          to_email: 'alice@test.com',
          merge_fields: expect.objectContaining({
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
        expect.any(String),
        expect.objectContaining({
          template_uid: 'tpl-apa',
          to_email: 'john.doe@test.com'
        }),
        expect.any(Object)
      );
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
  });
});
