// Jest setup file
require('dotenv').config({ path: '.env.test' });

// Set test timeout
jest.setTimeout(10000);

// Global test setup
beforeAll(async () => {
  console.log('Starting tests...');
});

afterAll(async () => {
  console.log('Tests completed');
});
