/**
 * Integration Test Helper
 * Sets up the Express app with mocked MongoDB for testing routes
 */
const jwt = require('jsonwebtoken');

// Generate auth tokens for testing
function generateTestToken(userId, role = 'agent') {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

function generateAdminToken(userId = 'admin-test-id') {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

// Mock user data factory
function createMockUser(overrides = {}) {
  return {
    _id: 'test-user-id',
    name: 'Test User',
    email: 'test@example.com',
    phone: '1234567890',
    role: 'agent',
    isActive: true,
    deletedAt: null,
    level: 'associate',
    referralCode: 'AGTTEST1',
    onboardingStatus: 'not-started',
    subscriptionStatus: 'none',
    paymentAccessEnabled: false,
    oneTimePaymentCompleted: false,
    billingExempt: false,
    children: [],
    lastLogin: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    save: jest.fn().mockResolvedValue(this),
    comparePassword: jest.fn().mockResolvedValue(true),
    getResetPasswordToken: jest.fn().mockReturnValue('reset-token-abc'),
    generateReferralCode: jest.fn().mockReturnValue('AGTNEW01'),
    ...overrides
  };
}

function createMockAdmin(overrides = {}) {
  return createMockUser({
    _id: 'admin-test-id',
    name: 'Admin User',
    email: 'admin@example.com',
    role: 'admin',
    ...overrides
  });
}

module.exports = {
  generateTestToken,
  generateAdminToken,
  createMockUser,
  createMockAdmin
};
