/**
 * Integration Tests: Income Paid Routes (/api/production/income-paid)
 *
 * Covers the agent-submit / admin-approve workflow that feeds the Producer
 * and Builder promotion tracks' income requirements.
 */
const request = require('supertest');

const User = require('../../models/User');
const SystemConfig = require('../../models/SystemConfig');
const IncomePaid = require('../../models/IncomePaid');
const Notification = require('../../models/Notification');
const { generateTestToken, generateAdminToken, createMockUser, createMockAdmin } = require('../helpers/test-utils');

describe('Integration: Income Paid Routes (/api/production/income-paid)', () => {
  let app, agentToken, adminToken;

  beforeAll(() => {
    const { app: expressApp } = require('../../server');
    app = expressApp;
    agentToken = generateTestToken('agent-id');
    adminToken = generateAdminToken('admin-id');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    SystemConfig.findOne.mockImplementation(() => ({
      lean: jest.fn().mockResolvedValue({ value: 'true' })
    }));
    // Default auth identity: agent. Individual tests override for admin-only checks.
    User.findById.mockImplementation(() => ({
      select: jest.fn().mockResolvedValue(createMockUser({ _id: 'agent-id', name: 'Test Agent' }))
    }));
  });

  // ---- Auth / validation ----

  it('requires authentication to submit an entry', async () => {
    const res = await request(app)
      .post('/api/production/income-paid')
      .send({ amount: 5000, datePaidByCarrier: '2026-01-01' });
    expect(res.status).toBe(401);
  });

  // Payload validation (negative amount / missing datePaidByCarrier) is covered at
  // the unit level in tests/unit/validation-middleware.test.js — this repo's
  // integration harness mocks Joi globally (see setup-integration.js) to work
  // around a VM sandbox issue, so `validateRequest` always passes here and
  // can't be exercised through a live route in this test tier.

  // ---- Happy path: submit ----

  it('creates a pending entry owned by the submitting agent and notifies admins', async () => {
    IncomePaid.create.mockResolvedValue({
      _id: 'entry-1', agent: 'agent-id', amount: 5000, datePaidByCarrier: new Date('2026-01-01'), status: 'pending'
    });
    User.find.mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([{ _id: 'admin-id' }]) })
    });

    const res = await request(app)
      .post('/api/production/income-paid')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ amount: 5000, datePaidByCarrier: '2026-01-01', notes: 'January carrier statement' });

    expect(res.status).toBe(201);
    expect(IncomePaid.create).toHaveBeenCalledWith(
      expect.objectContaining({ agent: 'agent-id', amount: 5000, status: 'pending' })
    );
    expect(Notification.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'admin-id', type: 'income_paid_pending' })
    );
  });

  it('stores the exact date paid by carrier as submitted (no month-rounding)', async () => {
    // A policy can pay out multiple times in the same month (e.g. an upfront
    // payment, then a trailing commission a few weeks later), so the specific
    // day matters for admins matching entries to carrier statements.
    IncomePaid.create.mockResolvedValue({ _id: 'entry-1', status: 'pending' });
    User.find.mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) })
    });

    await request(app)
      .post('/api/production/income-paid')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ amount: 5000, datePaidByCarrier: '2026-01-17' });

    const createArg = IncomePaid.create.mock.calls[0][0];
    expect(createArg.datePaidByCarrier).toBe('2026-01-17');
  });

  // ---- mine ----

  it("returns only the caller's own entries via /mine", async () => {
    IncomePaid.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([{ _id: 'e1', agent: 'agent-id' }]) })
    });

    const res = await request(app)
      .get('/api/production/income-paid/mine')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(IncomePaid.find).toHaveBeenCalledWith({ agent: 'agent-id' });
    expect(res.body.entries).toHaveLength(1);
  });

  // ---- admin list ----

  it('blocks non-admins from the admin listing endpoint', async () => {
    const res = await request(app)
      .get('/api/production/income-paid')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(403);
  });

  it('allows admins to list entries filtered by status', async () => {
    User.findById.mockImplementation(() => ({
      select: jest.fn().mockResolvedValue(createMockAdmin({ _id: 'admin-id' }))
    }));
    const leanMock = jest.fn().mockResolvedValue([{ _id: 'e1', status: 'pending' }]);
    IncomePaid.find.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({ lean: leanMock })
        })
      })
    });

    const res = await request(app)
      .get('/api/production/income-paid?status=pending')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(IncomePaid.find).toHaveBeenCalledWith({ status: 'pending' });
    expect(res.body.entries).toHaveLength(1);
  });

  // ---- approve ----

  it('blocks non-admins from approving', async () => {
    const res = await request(app)
      .put('/api/production/income-paid/entry-1/approve')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 approving an entry that does not exist', async () => {
    User.findById.mockImplementation(() => ({
      select: jest.fn().mockResolvedValue(createMockAdmin({ _id: 'admin-id' }))
    }));
    IncomePaid.findById.mockResolvedValue(null);

    const res = await request(app)
      .put('/api/production/income-paid/missing-id/approve')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it('approving sets status=approved, records the reviewer, and notifies the agent', async () => {
    User.findById.mockImplementation(() => ({
      select: jest.fn().mockResolvedValue(createMockAdmin({ _id: 'admin-id' }))
    }));
    const entry = {
      _id: 'entry-1', agent: 'agent-id', amount: 5000, status: 'pending',
      save: jest.fn().mockResolvedValue(true)
    };
    IncomePaid.findById.mockResolvedValue(entry);

    const res = await request(app)
      .put('/api/production/income-paid/entry-1/approve')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(entry.status).toBe('approved');
    expect(entry.reviewedBy).toBe('admin-id');
    expect(entry.save).toHaveBeenCalled();
    expect(Notification.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'agent-id', type: 'income_paid_approved' })
    );
  });

  // ---- reject ----

  it('rejecting sets status=rejected and stores the review notes', async () => {
    User.findById.mockImplementation(() => ({
      select: jest.fn().mockResolvedValue(createMockAdmin({ _id: 'admin-id' }))
    }));
    const entry = {
      _id: 'entry-1', agent: 'agent-id', amount: 5000, status: 'pending',
      save: jest.fn().mockResolvedValue(true)
    };
    IncomePaid.findById.mockResolvedValue(entry);

    const res = await request(app)
      .put('/api/production/income-paid/entry-1/reject')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reviewNotes: 'Does not match carrier statement' });

    expect(res.status).toBe(200);
    expect(entry.status).toBe('rejected');
    expect(entry.reviewNotes).toBe('Does not match carrier statement');
  });

  // ---- delete ----

  it("lets the owner delete their own PENDING entry", async () => {
    const entry = { _id: 'entry-1', agent: { toString: () => 'agent-id' }, status: 'pending', deleteOne: jest.fn().mockResolvedValue(true) };
    IncomePaid.findById.mockResolvedValue(entry);

    const res = await request(app)
      .delete('/api/production/income-paid/entry-1')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(entry.deleteOne).toHaveBeenCalled();
  });

  it('blocks the owner from deleting their own APPROVED entry', async () => {
    const entry = { _id: 'entry-1', agent: { toString: () => 'agent-id' }, status: 'approved', deleteOne: jest.fn() };
    IncomePaid.findById.mockResolvedValue(entry);

    const res = await request(app)
      .delete('/api/production/income-paid/entry-1')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(403);
    expect(entry.deleteOne).not.toHaveBeenCalled();
  });

  it("blocks one agent from deleting another agent's entry", async () => {
    const entry = { _id: 'entry-1', agent: { toString: () => 'someone-else-id' }, status: 'pending', deleteOne: jest.fn() };
    IncomePaid.findById.mockResolvedValue(entry);

    const res = await request(app)
      .delete('/api/production/income-paid/entry-1')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(403);
    expect(entry.deleteOne).not.toHaveBeenCalled();
  });

  it('lets an admin delete any entry regardless of status', async () => {
    User.findById.mockImplementation(() => ({
      select: jest.fn().mockResolvedValue(createMockAdmin({ _id: 'admin-id' }))
    }));
    const entry = { _id: 'entry-1', agent: { toString: () => 'agent-id' }, status: 'approved', deleteOne: jest.fn().mockResolvedValue(true) };
    IncomePaid.findById.mockResolvedValue(entry);

    const res = await request(app)
      .delete('/api/production/income-paid/entry-1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(entry.deleteOne).toHaveBeenCalled();
  });
});
