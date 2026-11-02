/**
 * Integration Tests: /uploads static access control
 * A valid token is not enough: the account must be active, and non-admins only reach shared
 * folders plus their own signed APA. Everything else is admin-only.
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');

const User = require('../../models/User');
const APAApplication = require('../../models/APAApplication');
const SystemConfig = require('../../models/SystemConfig');

describe('Integration: /uploads access control', () => {
  let app;
  const tokenFor = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const asUser = (doc) => {
    User.findById.mockImplementation(() => {
      const p = Promise.resolve(doc);
      p.select = jest.fn().mockResolvedValue(doc);
      return p;
    });
  };
  const agent = { _id: 'agent-1', role: 'agent', isActive: true, deletedAt: null, email: 'a@example.com' };
  const get = (path, id = 'agent-1') => request(app).get(path).set('Authorization', `Bearer ${tokenFor(id)}`);

  beforeAll(() => {
    app = require('../../server').app;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    SystemConfig.findOne.mockImplementation(() => ({ lean: jest.fn().mockResolvedValue({ value: 'true' }) }));
  });

  it.each([
    ['commission statements', '/uploads/commission-statements/1-a.pdf'],
    ['onboarding documents', '/uploads/onboarding-docs/1-a.pdf'],
    ['document requests', '/uploads/document-requests/1-a.pdf'],
    ['percent-encoded folder name', '/uploads/%63ommission-statements/1-a.pdf'],
    ['upper-case folder name', '/uploads/Commission-Statements/1-a.pdf'],
    ['dot segments', '/uploads/training-pdfs/../commission-statements/1-a.pdf'],
    ['directory root', '/uploads/']
  ])('denies an agent access to %s', async (_label, urlPath) => {
    asUser(agent);
    const res = await get(urlPath);
    expect([403, 404]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });

  it('lets an agent through to shared folders (reaching the file lookup, not a 403)', async () => {
    asUser(agent);
    const res = await get('/uploads/training-pdfs/none.pdf');
    expect(res.status).toBe(404);
  });

  it('rejects a deactivated or deleted account even with a valid token', async () => {
    asUser({ ...agent, isActive: false });
    expect((await get('/uploads/training-pdfs/none.pdf')).status).toBe(401);
    asUser({ ...agent, deletedAt: new Date() });
    expect((await get('/uploads/training-pdfs/none.pdf')).status).toBe(401);
  });

  it('rejects a token for a user that no longer exists', async () => {
    asUser(null);
    expect((await get('/uploads/training-pdfs/none.pdf')).status).toBe(401);
  });

  it('lets an agent read their own signed APA but not someone else\'s', async () => {
    const id = 'a'.repeat(24);
    asUser(agent);
    const lookup = (owner) => APAApplication.findById.mockImplementation(() => ({
      select: jest.fn().mockResolvedValue({ userId: owner, personalInfo: { email: 'other@example.com' } })
    }));

    lookup('agent-1');
    expect((await get(`/uploads/apa-signed/${id}_signed_apa.pdf`)).status).not.toBe(403);

    lookup('someone-else');
    expect((await get(`/uploads/apa-signed/${id}_signed_apa.pdf`)).status).toBe(403);
  });

  it('lets an admin through to any folder', async () => {
    asUser({ ...agent, _id: 'admin-1', role: 'admin' });
    const res = await get('/uploads/commission-statements/none.pdf', 'admin-1');
    expect(res.status).toBe(404);
  });
});
