import { test, expect, APIRequestContext } from '@playwright/test';
import { API, as } from './helpers/api';

const { USERS } = require('./helpers/users');
const A = `${API}/admin`;

async function rawDb(fn: (db: any, oid: any) => Promise<any>) {
  const mongoose = require('../backend/node_modules/mongoose');
  const conn = await mongoose.createConnection(process.env.E2E_MONGO || 'mongodb://localhost:27018/rph_e2e_c').asPromise();
  try { return await fn(conn, mongoose.Types.ObjectId); } finally { await conn.close(); }
}
async function uid(request: APIRequestContext, key: keyof typeof USERS) {
  const list = await (await request.get(`${A}/users?search=${encodeURIComponent(USERS[key].email)}`, await as(request, 'admin'))).json();
  return list.users[0]._id as string;
}
const addPayment = (userId: string, over: Record<string, any> = {}) => rawDb(async (db, oid) => {
  const _id = new oid();
  await db.collection('payments').insertOne({ _id, user: new oid(userId), type: 'subscription', amount: 2000, currency: 'usd', status: 'succeeded', receiptUrl: 'https://example.com/r', deletedAt: null, createdAt: new Date(), updatedAt: new Date(), ...over });
  return String(_id);
});
const dropPayments = (ids: string[]) => rawDb(async (db, oid) => db.collection('payments').deleteMany({ _id: { $in: ids.map((i) => new oid(i)) } }));

test.describe('F40 billing and payments', () => {
  test('F40-A1 agents are denied every admin billing endpoint', async ({ request }) => {
    const h = await as(request, 'agent');
    const id = await uid(request, 'agent');
    for (const [m, p] of [['GET', '/payments'], ['GET', '/subscriptions'], ['GET', '/payment-settings'], ['PUT', '/payment-settings'], ['POST', `/payments/${id}/enable-access`], ['POST', `/payments/${id}/disable-access`], ['POST', `/subscriptions/${id}/cancel`], ['PUT', `/users/${id}/billing-exempt`], ['POST', '/payments/cleanup-stale'], ['GET', '/billing-resumes'], ['DELETE', `/users/${id}/billing-resume`]] as const) {
      expect((await request.fetch(`${A}${p}`, { method: m, ...h, data: m === 'GET' ? undefined : {} })).status(), `${m} ${p}`).toBe(403);
    }
  });

  test('F40-R1 receipts and payment history are isolated per user', async ({ request }) => {
    const agentId = await uid(request, 'agent');
    const otherId = await uid(request, 'other');
    const mine = await addPayment(agentId);
    const theirs = await addPayment(otherId);
    try {
      const agent = await as(request, 'agent');
      expect((await request.get(`${API}/user/payments/${mine}/receipt`, agent)).status()).toBe(200);
      expect((await request.get(`${API}/user/payments/${theirs}/receipt`, agent)).status()).toBe(403);
      expect((await request.get(`${API}/user/payments/${theirs}/receipt`, await as(request, 'admin'))).status()).toBe(200);
      expect((await request.get(`${API}/user/payments/zzz/receipt`, agent)).status()).toBe(400);
      const hist = await (await request.get(`${API}/user/payments`, agent)).json();
      const ids = hist.payments.map((p: any) => p._id);
      expect(ids).toContain(mine);
      expect(ids).not.toContain(theirs);
      for (const q of ['?page=-1', '?page=abc', '?limit=-3', '?limit=0']) {
        expect((await request.get(`${API}/user/payments${q}`, agent)).status(), q).toBe(200);
      }
    } finally { await dropPayments([mine, theirs]); }
  });

  test('F40-P1 admin payments: userId filter keeps a correct total; hostile filters are 4xx', async ({ request }) => {
    const h = await as(request, 'admin');
    const agentId = await uid(request, 'agent');
    const ids = [await addPayment(agentId), await addPayment(agentId, { status: 'failed' })];
    try {
      const body = await (await request.get(`${A}/payments?userId=${agentId}`, h)).json();
      expect(body.payments.length).toBeGreaterThanOrEqual(2);
      expect(body.pagination.total).toBe(body.payments.length);
      for (const q of ['?search=(', '?search=%5B', '?search[$ne]=x', '?type[$ne]=x', '?status[$ne]=x', '?userId[$ne]=x', '?page=-1', '?limit=-1']) {
        expect((await request.get(`${A}/payments${q}`, h)).status(), q).toBeLessThan(500);
      }
      expect((await request.get(`${A}/payments?userId=zzz`, h)).status()).toBe(400);
      expect((await request.get(`${A}/subscriptions?status[$ne]=x&page=-2`, h)).status()).toBeLessThan(500);
    } finally { await dropPayments(ids); }
  });

  test('F40-S1 payment settings validate prices and ids', async ({ request }) => {
    const h = await as(request, 'admin');
    const before = await (await request.get(`${A}/payment-settings`, h)).json();
    for (const bad of [{ monthlyPrice: 12.5 }, { oneTimePrice: -1 }, { monthlyPrice: '20' }, { oneTimePrice: 1.5 }, { monthlyPriceId: { $ne: 1 } }]) {
      expect((await request.put(`${A}/payment-settings`, { ...h, data: bad })).status(), JSON.stringify(bad)).toBe(400);
    }
    const after = await (await request.get(`${A}/payment-settings`, h)).json();
    expect(after.monthlyPrice).toBe(before.monthlyPrice);
  });

  test('F40-X1 access toggles are idempotent and reject malformed ids; billing-exempt validates input', async ({ request }) => {
    const h = await as(request, 'admin');
    const id = await uid(request, 'other');
    for (const act of ['enable-access', 'enable-access', 'disable-access', 'disable-access']) {
      expect((await request.post(`${A}/payments/${id}/${act}`, h)).status(), act).toBe(200);
    }
    await request.post(`${A}/payments/${id}/enable-access`, h);
    for (const act of ['enable-access', 'disable-access']) {
      expect((await request.post(`${A}/payments/zzz/${act}`, h)).status()).toBe(400);
      expect((await request.post(`${A}/payments/${'c'.repeat(24)}/${act}`, h)).status()).toBe(404);
    }
    expect((await request.put(`${A}/users/${id}/billing-exempt`, { ...h, data: { exempt: 'true' } })).status()).toBe(400);
    expect((await request.put(`${A}/users/${id}/billing-exempt`, { ...h, data: { exempt: true } })).status(), 'reason required').toBe(400);
    expect((await request.put(`${A}/users/${id}/billing-exempt`, { ...h, data: { exempt: true, reason: { a: 1 } } })).status()).toBe(400);
    expect((await request.post(`${A}/subscriptions/${id}/cancel`, h)).status(), 'no subscription').toBe(404);
    expect((await request.post(`${A}/subscriptions/zzz/cancel`, h)).status()).toBe(400);
    expect((await request.delete(`${A}/users/${id}/billing-resume`, h)).status(), 'nothing scheduled').toBe(400);
  });

  test('F40-W1 webhook refuses missing or invalid signatures', async ({ request }) => {
    expect((await request.post(`${API}/payments/webhook`, { data: '{}', headers: { 'content-type': 'application/json' } })).status()).toBe(400);
    const bad = await request.post(`${API}/payments/webhook`, { data: '{"type":"invoice.paid"}', headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=bad' } });
    expect(bad.status()).toBeLessThan(500);
    expect(bad.status()).toBeGreaterThanOrEqual(400);
  });
});
