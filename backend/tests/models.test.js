const User = require('../models/User');
const crypto = require('crypto');

describe('User Model Tests', () => {
  describe('Password Hashing', () => {
    it('should hash password before saving', async () => {
      const user = new User({
        name: 'Test User',
        email: 'test@example.com',
        password: 'plainPassword',
        phone: '1234567890',
        role: 'recruit'
      });

      await user.save();
      
      expect(user.password).not.toBe('plainPassword');
      expect(user.password.length).toBeGreaterThan(20);
    });

    it('should compare password correctly', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test2@example.com',
        password: 'correctPassword',
        phone: '1234567890',
        role: 'recruit'
      });

      const isMatch = await user.comparePassword('correctPassword');
      const isNotMatch = await user.comparePassword('wrongPassword');

      expect(isMatch).toBe(true);
      expect(isNotMatch).toBe(false);
    });
  });

  describe('Referral Code Generation', () => {
    it('should generate referral code for agent', async () => {
      const agent = new User({
        name: 'Test Agent',
        email: 'agent@example.com',
        password: 'password',
        phone: '1234567890',
        role: 'agent'
      });

      await agent.save();

      expect(agent.referralCode).toBeDefined();
      expect(agent.referralCode).toMatch(/^AGT/);
    });

    it('should not generate referral code for recruit', async () => {
      const recruit = new User({
        name: 'Test Recruit',
        email: 'recruit@example.com',
        password: 'password',
        phone: '1234567890',
        role: 'recruit'
      });

      await recruit.save();

      expect(recruit.referralCode).toBeUndefined();
    });
  });

  describe('Reset Password Token', () => {
    it('should generate reset token', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'reset@example.com',
        password: 'password',
        phone: '1234567890',
        role: 'recruit'
      });

      const resetToken = user.getResetPasswordToken();

      expect(resetToken).toBeDefined();
      expect(user.resetPasswordToken).toBeDefined();
      expect(user.resetPasswordExpire).toBeDefined();
      expect(user.resetPasswordExpire.getTime()).toBeGreaterThan(Date.now());
    });
  });
});

describe('Validation Tests', () => {
  it('should require email', async () => {
    const user = new User({
      name: 'Test',
      password: 'password',
      phone: '1234567890'
    });

    await expect(user.save()).rejects.toThrow();
  });

  it('should validate email format', async () => {
    const user = new User({
      name: 'Test',
      email: 'invalid-email',
      password: 'password',
      phone: '1234567890'
    });

    await expect(user.save()).rejects.toThrow();
  });

  it('should enforce unique email', async () => {
    await User.create({
      name: 'User 1',
      email: 'unique@example.com',
      password: 'password',
      phone: '1234567890',
      role: 'recruit'
    });

    const duplicate = new User({
      name: 'User 2',
      email: 'unique@example.com',
      password: 'password',
      phone: '9876543210',
      role: 'recruit'
    });

    await expect(duplicate.save()).rejects.toThrow();
  });
});
