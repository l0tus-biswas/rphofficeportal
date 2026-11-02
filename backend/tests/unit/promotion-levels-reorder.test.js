/**
 * Unit Tests: PUT /api/promotion/admin/levels/reorder input validation.
 * Models and auth middleware are mocked; no DB is used.
 */
jest.mock('../../models/PromotionLevel', () => require('../helpers/mock-model')('PromotionLevel'));
jest.mock('../../models/ProductionSubmission', () => require('../helpers/mock-model')('ProductionSubmission'));
jest.mock('../../models/IncomePaid', () => require('../helpers/mock-model')('IncomePaid'));
jest.mock('../../models/User', () => require('../helpers/mock-model')('User'));
jest.mock('../../models/Notification', () => require('../helpers/mock-model')('Notification'));
jest.mock('../../models/LicensingProgress', () => require('../helpers/mock-model')('LicensingProgress'));
jest.mock('../../models/APAApplication', () => require('../helpers/mock-model')('APAApplication'));
jest.mock('../../middleware/auth.middleware', () => ({
  protect: (req, res, next) => { req.user = { _id: 'admin-id', role: 'admin' }; next(); },
  authorize: () => (req, res, next) => next()
}));

const express = require('express');
const request = require('supertest');
const PromotionLevel = require('../../models/PromotionLevel');
const router = require('../../routes/promotion.routes');

const ID1 = '64b000000000000000000001';
const ID2 = '64b000000000000000000002';

const app = express();
app.use(express.json());
app.use('/api/promotion', router);

const put = (body) => request(app).put('/api/promotion/admin/levels/reorder').send(body);

describe('PUT /api/promotion/admin/levels/reorder validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    PromotionLevel.countDocuments.mockResolvedValue(2);
    PromotionLevel.bulkWrite.mockResolvedValue({});
  });

  it.each([
    ['missing order', {}],
    ['non-array order', { order: 'x' }],
    ['empty order', { order: [] }],
    ['null entry', { order: [null] }],
    ['non-string id', { order: [{ id: 123, rank: 1 }] }],
    ['malformed id', { order: [{ id: 'not-an-id', rank: 1 }] }],
    ['missing id', { order: [{ rank: 1 }] }],
    ['non-integer rank', { order: [{ id: ID1, rank: 1.5 }] }],
    ['string rank', { order: [{ id: ID1, rank: '1' }] }],
    ['zero rank', { order: [{ id: ID1, rank: 0 }] }],
    ['negative rank', { order: [{ id: ID1, rank: -2 }] }],
    ['duplicate rank', { order: [{ id: ID1, rank: 1 }, { id: ID2, rank: 1 }] }],
    ['duplicate id', { order: [{ id: ID1, rank: 1 }, { id: ID1, rank: 2 }] }]
  ])('returns 400 for %s', async (_n, body) => {
    const res = await put(body);
    expect(res.status).toBe(400);
    expect(res.body.message).toBeTruthy();
    expect(PromotionLevel.bulkWrite).not.toHaveBeenCalled();
  });

  it('returns 400 when a level id does not exist', async () => {
    PromotionLevel.countDocuments.mockResolvedValue(1);
    const res = await put({ order: [{ id: ID1, rank: 1 }, { id: ID2, rank: 2 }] });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/do not exist/);
    expect(PromotionLevel.bulkWrite).not.toHaveBeenCalled();
  });

  it('accepts valid input and runs the two-pass update', async () => {
    const res = await put({ order: [{ id: ID1, rank: 2 }, { id: ID2, rank: 1 }] });
    expect(res.status).toBe(200);
    expect(PromotionLevel.bulkWrite).toHaveBeenCalledTimes(2);
  });
});
