/**
 * Unit Tests: GET /api/admin/stats (backend/routes/admin.routes.js)
 * Invokes the route handler directly (no DB, no HTTP) with mocked models.
 */
jest.mock('../../models/User', () => require('../helpers/mock-model')('User'));
jest.mock('../../models/Onboarding', () => require('../helpers/mock-model')('Onboarding'));
jest.mock('../../models/AuditLog', () => require('../helpers/mock-model')('AuditLog'));
jest.mock('../../models/Payment', () => require('../helpers/mock-model')('Payment'));
jest.mock('../../models/Subscription', () => require('../helpers/mock-model')('Subscription'));
jest.mock('../../models/APAApplication', () => require('../helpers/mock-model')('APAApplication'));
jest.mock('../../models/Notification', () => require('../helpers/mock-model')('Notification'));
jest.mock('../../models/LicensingProgress', () => require('../helpers/mock-model')('LicensingProgress'));
jest.mock('../../models/ProductionSubmission', () => require('../helpers/mock-model')('ProductionSubmission'));
jest.mock('../../models/ACAClientRecord', () => require('../helpers/mock-model')('ACAClientRecord'));
jest.mock('../../models/AgentCarrierStatus', () => require('../helpers/mock-model')('AgentCarrierStatus'));
jest.mock('../../models/ExamFXProgress', () => require('../helpers/mock-model')('ExamFXProgress'));
jest.mock('../../models/PrintfulOrder', () => require('../helpers/mock-model')('PrintfulOrder'));
jest.mock('../../models/DocumentRequest', () => require('../helpers/mock-model')('DocumentRequest'));
jest.mock('../../models/DocumentHubFile', () => require('../helpers/mock-model')('DocumentHubFile'));
jest.mock('../../models/SystemConfig', () => require('../helpers/mock-model')('SystemConfig'));
jest.mock('../../middleware/auth.middleware', () => ({
  protect: (req, res, next) => next(),
  authorize: () => (req, res, next) => next()
}));
jest.mock('../../middleware/audit.middleware', () => ({ logAction: () => (req, res, next) => next() }));
jest.mock('../../middleware/validation.middleware', () => ({ validateRequest: () => (req, res, next) => next(), schemas: {} }));
jest.mock('../../utils/neuzmail', () => ({ sendWelcomeEmail: jest.fn() }));
jest.mock('../../utils/stripe', () => ({}));

const User = require('../../models/User');
const LicensingProgress = require('../../models/LicensingProgress');
const APAApplication = require('../../models/APAApplication');
const ProductionSubmission = require('../../models/ProductionSubmission');
const ACAClientRecord = require('../../models/ACAClientRecord');
const Notification = require('../../models/Notification');
const Subscription = require('../../models/Subscription');
const Payment = require('../../models/Payment');
const router = require('../../routes/admin.routes');

const layer = router.stack.find(l => l.route && l.route.path === '/stats' && l.route.methods.get);
const handler = layer.route.stack[layer.route.stack.length - 1].handle;

const chain = (value) => {
  const c = {};
  ['select', 'sort', 'limit', 'populate', 'lean'].forEach(m => { c[m] = jest.fn().mockReturnValue(c); });
  c.then = (res, rej) => Promise.resolve(value).then(res, rej);
  return c;
};

async function run() {
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  await handler({ user: { _id: 'admin1' } }, res);
  return res;
}

const now = new Date();
const agents = [
  { _id: 'a1', isActive: true, createdAt: now, metadata: {} },   // licensed via APA only
  { _id: 'a2', isActive: false, createdAt: now, metadata: {} }   // inactive
];

beforeEach(() => {
  jest.resetAllMocks();
  User.countDocuments.mockReturnValue(chain(1));
  User.find.mockImplementation((q) => chain(q && q.createdAt ? [] : agents));
  LicensingProgress.find.mockReturnValue(chain([]));
  APAApplication.find.mockReturnValue(chain([{ userId: 'a1', licensingStatus: { currentlyLicensed: true } }]));
  APAApplication.countDocuments.mockReturnValue(chain(0));
  ProductionSubmission.countDocuments.mockReturnValue(chain(0));
  ProductionSubmission.aggregate.mockReturnValue(chain([]));
  ProductionSubmission.find.mockReturnValue(chain([]));
  ACAClientRecord.aggregate.mockReturnValue(chain([]));
  Notification.find.mockReturnValue(chain([]));
  Subscription.aggregate.mockReturnValue(chain([]));
  Payment.aggregate.mockReturnValue(chain([]));
});

describe('GET /api/admin/stats', () => {
  it('counts agents only: admins are excluded from totalUsers/activeUsers', async () => {
    const res = await run();
    expect(res.statusCode).toBe(200);
    const s = res.body.stats;
    expect(s.totalAdmins).toBe(1);
    expect(s.totalUsers).toBe(2);
    expect(s.totalAgents).toBe(2);
    expect(s.activeUsers).toBe(1);
    expect(s.inactiveUsers).toBe(1);
    expect(User.find).toHaveBeenCalledWith({ role: 'agent', deletedAt: null });
    expect(User.countDocuments).toHaveBeenCalledWith({ role: 'admin', deletedAt: null });
  });

  it('counts an agent licensed only via APA as licensed', async () => {
    const s = (await run()).body.stats;
    expect(s.licensedAgents).toBe(1);
    expect(s.unlicensedAgents).toBe(0);
    // lookup is scoped to active agents only
    expect(APAApplication.find.mock.calls[0][0].$or[0]).toEqual({ user: { $in: ['a1'] } });
  });

  it('scopes production queries to non-deleted production of existing agents', async () => {
    await run();
    const expected = { deletedAt: null, agent: { $in: ['a1', 'a2'] } };
    expect(ProductionSubmission.countDocuments.mock.calls.length).toBeGreaterThanOrEqual(3);
    ProductionSubmission.countDocuments.mock.calls.forEach(([q]) => expect(q).toMatchObject(expected));
    ProductionSubmission.aggregate.mock.calls.forEach(([pipe]) => expect(pipe[0].$match).toMatchObject(expected));
    ProductionSubmission.find.mock.calls.forEach(([q]) => expect(q).toMatchObject(expected));
  });
});
