/**
 * Integration Tests: GET /api/payments/status exposes pendingBillingResumeAt
 * / billingResumeAttempts so the frontend can show the "Pay Now" banner
 * after Free Access is removed and a billing resume is scheduled/retrying.
 */
const request = require('supertest');

const User = require('../../models/User');
const Subscription = require('../../models/Subscription');
const { generateTestToken, createMockUser } = require('../helpers/test-utils');

function asQuery(value) {
  const q = {
    select: jest.fn(() => q),
    sort: jest.fn(() => q),
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
    catch: (reject) => Promise.resolve(value).catch(reject)
  };
  return q;
}

describe('Integration: GET /api/payments/status billing-resume fields', () => {
  let app, agentToken;

  beforeAll(() => {
    const { app: expressApp } = require('../../server');
    app = expressApp;
    agentToken = generateTestToken('test-user-id');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    Subscription.findOne.mockReturnValue(asQuery(null));
  });

  it('returns pendingBillingResumeAt and billingResumeAttempts when a resume is scheduled', async () => {
    const resumeDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    User.findById.mockReturnValue(asQuery(createMockUser({
      _id: 'test-user-id', role: 'agent', isActive: true,
      pendingBillingResumeAt: resumeDate, billingResumeAttempts: 1
    })));

    const res = await request(app)
      .get('/api/payments/status')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(new Date(res.body.pendingBillingResumeAt).getTime()).toBe(resumeDate.getTime());
    expect(res.body.billingResumeAttempts).toBe(1);
  });

  it('returns null/0 when no resume is scheduled', async () => {
    User.findById.mockReturnValue(asQuery(createMockUser({
      _id: 'test-user-id', role: 'agent', isActive: true,
      pendingBillingResumeAt: null, billingResumeAttempts: 0
    })));

    const res = await request(app)
      .get('/api/payments/status')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.pendingBillingResumeAt).toBeNull();
    expect(res.body.billingResumeAttempts).toBe(0);
  });

  it('billing-exempt users never show a pending resume', async () => {
    User.findById.mockReturnValue(asQuery(createMockUser({
      _id: 'test-user-id', role: 'agent', isActive: true,
      billingExempt: true, pendingBillingResumeAt: new Date()
    })));

    const res = await request(app)
      .get('/api/payments/status')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.billingExempt).toBe(true);
    expect(res.body.pendingBillingResumeAt).toBeUndefined();
  });
});
