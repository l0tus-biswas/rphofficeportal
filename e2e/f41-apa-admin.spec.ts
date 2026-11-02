import { test, expect } from '@playwright/test';
import { API, as } from './helpers/api';

const A = `${API}/admin/apa-applications`;
const stamp = () => `${Date.now()}${Math.floor(Math.random() * 1e4)}`;

async function rawApps(fn: (col: any, oid: any) => Promise<any>) {
  const mongoose = require('../backend/node_modules/mongoose');
  const conn = await mongoose.createConnection(process.env.E2E_MONGO || 'mongodb://localhost:27018/rph_e2e_c').asPromise();
  try { return await fn(conn.collection('apaapplications'), mongoose.Types.ObjectId); } finally { await conn.close(); }
}
const insertApp = (over: Record<string, any>) => rawApps(async (col, oid) => {
  const _id = new oid();
  await col.insertOne({ _id, status: 'pending_signature', personalInfo: { legalFirstName: 'Qa', legalLastName: 'F41', email: `f41-${stamp()}@example.com` }, submittedAt: new Date(), deletedAt: null, ...over });
  return String(_id);
});
const removeApp = (id: string) => rawApps(async (col, oid) => col.deleteOne({ _id: new oid(id) }));

test.describe('F41 APA applications (admin)', () => {
  test('F41-A1 non-admins are denied', async ({ request }) => {
    expect((await request.get(A, await as(request, 'agent'))).status()).toBe(403);
    expect((await request.get(A)).status()).toBe(401);
  });

  test('F41-L1 list, filter and detail give 4xx (never 5xx) for hostile input', async ({ request }) => {
    const h = await as(request, 'admin');
    for (const q of ['?search=(', '?search=%5B', '?search[$ne]=x', '?status[$ne]=x', '?page=-1', '?page=abc&limit=abc', '?limit=-5', '?status=all']) {
      expect((await request.get(`${A}${q}`, h)).status(), q).toBeLessThan(500);
    }
    expect((await request.get(`${A}/zzz`, h)).status()).toBeLessThan(500);
    expect((await request.get(`${A}/${'a'.repeat(24)}`, h)).status()).toBe(404);
  });

  test('F41-D1 applications of deleted users are hidden from list, counts and stats', async ({ request }) => {
    const h = await as(request, 'admin');
    const email = `f41-del-${stamp()}@example.com`;
    const live = await insertApp({ status: 'pending_payment' });
    const deleted = await insertApp({ status: 'pending_payment', deletedAt: new Date(), personalInfo: { legalFirstName: 'Gone', legalLastName: 'F41', email } });
    try {
      const body = await (await request.get(`${A}?search=${encodeURIComponent(email)}`, h)).json();
      expect(body.applications.length).toBe(0);
      const all = await (await request.get(`${A}?limit=500`, h)).json();
      const ids = all.applications.map((a: any) => a._id);
      expect(ids).toContain(live);
      expect(ids).not.toContain(deleted);
      const stats = (await (await request.get(`${A}/stats/overview`, h)).json()).stats;
      expect(stats.pendingPayment).toBe(all.statusCounts.pending_payment);
    } finally { await removeApp(live); await removeApp(deleted); }
  });

  test('F41-S1 reject validates input and is refused a second time; notes must be a string', async ({ request }) => {
    const h = await as(request, 'admin');
    const id = await insertApp({ status: 'rejected', rejectionReason: 'x' });
    try {
      expect((await request.put(`${A}/${id}/reject`, { ...h, data: {} })).status()).toBe(400);
      expect((await request.put(`${A}/${id}/reject`, { ...h, data: { reason: { $ne: 1 } } })).status()).toBe(400);
      expect((await request.put(`${A}/${id}/reject`, { ...h, data: { reason: 'again' } })).status(), 'double reject').toBe(400);
      expect((await request.put(`${A}/${id}/notes`, { ...h, data: { adminNotes: { a: 1 } } })).status()).toBe(400);
      expect((await request.put(`${A}/${id}/notes`, { ...h, data: {} })).status(), 'missing notes').toBe(400);
      expect((await request.put(`${A}/${id}/approve`, { ...h, data: { adminNotes: ['x'] } })).status()).toBe(400);
      for (const act of ['approve', 'reject', 'notes']) {
        expect((await request.put(`${A}/${'b'.repeat(24)}/${act}`, { ...h, data: { reason: 'r', adminNotes: 'n' } })).status(), act).toBe(404);
      }
    } finally { await removeApp(id); }
  });

  test('F41-T1 template/auto-approve settings validate input', async ({ request }) => {
    const h = await as(request, 'admin');
    expect((await request.put(`${A}/settings/auto-approve`, { ...h, data: { enabled: 'yes' } })).status()).toBe(400);
    expect((await request.post(`${A}/settings/template/upload`, h)).status()).toBe(400);
  });
});

test.describe('F41 public apply form', () => {
  const P = `${API}/public`;
  test('F41-P1 apply / verify-referral / recruiters/search / registration-payment-intent validate input', async ({ request }) => {
    for (const data of [{}, { name: 'A', email: 'x', phone: '1' }, { name: 'Valid Name', email: { $ne: 1 }, phone: '5551234567' }]) {
      expect((await request.post(`${P}/apply`, { data })).status(), JSON.stringify(data)).toBe(400);
    }
    const ok = { name: 'Valid Name', email: `f41-${stamp()}@example.com`, phone: '5551234567' };
    expect((await request.post(`${P}/apply?ref[$ne]=x`, { data: ok })).status(), 'operator in ref').toBe(400);
    expect((await request.post(`${P}/apply?ref=NOPE123`, { data: ok })).status()).toBe(400);
    expect((await request.get(`${P}/apply?ref[$ne]=x`)).status(), 'operator in GET ref').toBe(404);
    expect((await request.get(`${P}/verify-referral/NOPE123`)).status()).toBe(404);
    for (const q of ['?q[]=ab', '?q[$ne]=x', '?q=a', '?q=(', '']) {
      expect((await request.get(`${P}/recruiters/search${q}`)).status(), q).toBeLessThan(500);
    }
    for (const data of [{}, { email: { $ne: 1 } }, { email: ['a@b.co'] }, { email: 'not-an-email' }]) {
      expect((await request.post(`${P}/registration-payment-intent`, { data })).status(), JSON.stringify(data)).toBe(400);
    }
  });
});
