// Jest setup file
require('dotenv').config({ path: '.env.test' });

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-minimum-16-chars';
process.env.JWT_EXPIRE = '1h';
process.env.MONGODB_URI = 'mongodb://localhost:27017/rhpoffice-test';
process.env.ENCRYPTION_KEY = 'a'.repeat(64); // 32 bytes hex
process.env.APP_URL = 'http://localhost:4200';
process.env.SMTP_HOST = 'localhost';
process.env.SMTP_PORT = '587';
process.env.SMTP_USER = 'test@test.com';
process.env.SMTP_PASSWORD = 'testpass';
process.env.SMTP_FROM_NAME = 'Test App';
process.env.SMTP_FROM_EMAIL = 'test@test.com';
process.env.NEUZMAIL_API_TOKEN = 'test-neuzmail-token';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key_for_testing';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';

// Set test timeout
jest.setTimeout(30000);

// Global test setup
beforeAll(async () => {
  // Silence noisy logs in test
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(async () => {
  jest.restoreAllMocks();
});
