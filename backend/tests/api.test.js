process.env.NODE_ENV = 'test';

const request = require('supertest');
const { app } = require('../server');
const mongoose = require('mongoose');
const User = require('../models/User');

const TEST_DB_URI = process.env.MONGODB_URI_TEST;

function assertSafeTestDatabase() {
  const dbName = mongoose.connection?.db?.databaseName || '';
  if (!dbName || !/test/i.test(dbName)) {
    throw new Error(`Refusing to run destructive test cleanup against non-test database: ${dbName || 'unknown'}`);
  }
}

describe('Auth API Tests', () => {
  let adminToken;
  let agentToken;
  let testUser;

  beforeAll(async () => {
    if (!TEST_DB_URI) {
      throw new Error('MONGODB_URI_TEST must be set before running backend tests');
    }

    await mongoose.connect(TEST_DB_URI);
    assertSafeTestDatabase();
  });

  afterAll(async () => {
    // Clean up and close connection
    assertSafeTestDatabase();
    await User.deleteMany({});
    await mongoose.connection.close();
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      // First create a test user
      testUser = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
        phone: '1234567890',
        role: 'agent'
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.token).toBeDefined();
      agentToken = response.body.token;
    });

    it('should reject invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return current user with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${agentToken}`);

      expect(response.status).toBe(200);
      expect(response.body.user.email).toBe('test@example.com');
    });

    it('should reject request without token', async () => {
      const response = await request(app)
        .get('/api/auth/me');

      expect(response.status).toBe(401);
    });
  });
});

describe('Public API Tests', () => {
  let referralCode;

  beforeAll(async () => {
    const agent = await User.create({
      name: 'Test Agent',
      email: 'agent@example.com',
      password: 'password123',
      phone: '1234567890',
      role: 'agent'
    });
    referralCode = agent.referralCode;
  });

  describe('POST /api/public/apply', () => {
    it('should create new recruit with valid data', async () => {
      const response = await request(app)
        .post(`/api/public/apply?ref=${referralCode}`)
        .send({
          name: 'New Recruit',
          email: 'recruit@example.com',
          phone: '9876543210',
          address: '123 Main St',
          city: 'New York',
          state: 'NY',
          zipCode: '10001'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.user).toBeDefined();
    });

    it('should reject duplicate email', async () => {
      const response = await request(app)
        .post(`/api/public/apply?ref=${referralCode}`)
        .send({
          name: 'Duplicate User',
          email: 'recruit@example.com',
          phone: '1111111111'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject invalid referral code', async () => {
      const response = await request(app)
        .post('/api/public/apply?ref=INVALID')
        .send({
          name: 'Test User',
          email: 'test2@example.com',
          phone: '2222222222'
        });

      expect(response.status).toBe(400);
    });
  });
});

describe('Agent API Tests', () => {
  let agentToken;
  let agentId;

  beforeAll(async () => {
    const agent = await User.create({
      name: 'Test Agent 2',
      email: 'agent2@example.com',
      password: 'password123',
      phone: '5555555555',
      role: 'agent'
    });
    agentId = agent._id;

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'agent2@example.com',
        password: 'password123'
      });
    agentToken = loginResponse.body.token;
  });

  describe('GET /api/agent/profile', () => {
    it('should return agent profile', async () => {
      const response = await request(app)
        .get('/api/agent/profile')
        .set('Authorization', `Bearer ${agentToken}`);

      expect(response.status).toBe(200);
      expect(response.body.user.role).toBe('agent');
    });
  });

  describe('GET /api/agent/stats', () => {
    it('should return agent statistics', async () => {
      const response = await request(app)
        .get('/api/agent/stats')
        .set('Authorization', `Bearer ${agentToken}`);

      expect(response.status).toBe(200);
      expect(response.body.stats).toBeDefined();
      expect(response.body.stats.directRecruits).toBeDefined();
    });
  });
});

describe('Rate Limiting Tests', () => {
  it('should rate limit login attempts', async () => {
    const requests = [];
    
    // Make 6 login attempts (limit is 5)
    for (let i = 0; i < 6; i++) {
      requests.push(
        request(app)
          .post('/api/auth/login')
          .send({
            email: 'test@example.com',
            password: 'wrong'
          })
      );
    }

    const responses = await Promise.all(requests);
    const lastResponse = responses[responses.length - 1];
    
    expect(lastResponse.status).toBe(429); // Too Many Requests
  });
});
