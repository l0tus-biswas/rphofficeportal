import { test, expect, APIRequestContext } from '@playwright/test';
import { API, as } from './helpers/api';

const { USERS } = require('./helpers/users');
const C = `${API}/carriers`;
const PDF = Buffer.from('%PDF-1.4\n%%EOF\n');
const uniq = (p: string) => `${p} ${Date.now()}${Math.floor(Math.random() * 1e5)}`;
const ids: Record<string, string> = {};

async function userId(request: APIRequestContext, key: keyof typeof USERS) {
  if (ids[key]) return ids[key];
  const list = await (await request.get(`${API}/admin/users`, await as(request, 'admin'))).json();
  return (ids[key] = (Array.isArray(list) ? list : list.users).find((u: any) => u.email === USERS[key].email)._id);
}

async function newCarrier(request: APIRequestContext, over: Record<string, any> = {}) {
  const res = await request.post(C, { ...(await as(request, 'admin')), data: { name: uniq('E2E Carrier'), category: ['Life Insurance'], ...over } });
  expect(res.status(), 'create carrier').toBe(201);
  return res.json();
}

const unreadCount = async (request: APIRequestContext, who: 'agent' | 'other') => {
  const res = await request.get(`${API}/notifications`, await as(request, who));
  const body = await res.json();
  const list = Array.isArray(body) ? body : body.notifications || [];
  return list.filter((n: any) => /appoint/i.test(n.type || n.title || '')).length;
};

test.describe('F14 carrier management', () => {
  test('F14-H1 admin creates, edits and deactivates; agents only see active carriers', async ({ request }) => {
    const carrier = await newCarrier(request);
    const agent = await as(request, 'agent');
    const seen = await (await request.get(C, agent)).json();
    expect(seen.map((c: any) => c._id)).toContain(carrier._id);

    const edited = await request.put(`${C}/${carrier._id}`, { ...(await as(request, 'admin')), data: { contractingInstructions: 'Call first' } });
    expect(edited.status()).toBe(200);

    expect((await request.delete(`${C}/${carrier._id}`, await as(request, 'admin'))).status()).toBe(200);
    const after = await (await request.get(C, agent)).json();
    expect(after.map((c: any) => c._id), 'deactivated carrier hidden from agents').not.toContain(carrier._id);
    const adminList = await (await request.get(C, await as(request, 'admin'))).json();
    expect(adminList.map((c: any) => c._id), 'admin still sees it').toContain(carrier._id);
  });

  test('F14-I1 agents cannot create, edit, delete or manage appointments', async ({ request }) => {
    const carrier = await newCarrier(request);
    const agent = await as(request, 'agent');
    expect((await request.post(C, { ...agent, data: { name: uniq('x'), category: ['Life Insurance'] } })).status()).toBe(403);
    expect((await request.put(`${C}/${carrier._id}`, { ...agent, data: { name: 'hijack' } })).status()).toBe(403);
    expect((await request.delete(`${C}/${carrier._id}`, agent)).status()).toBe(403);
    expect((await request.put(`${C}/admin/agent/${await userId(request, 'agent')}/carrier/${carrier._id}/status`, { ...agent, data: { status: 'Appointed' } })).status()).toBe(403);
  });

  test('F14-I2 agents cannot read an inactive carrier directly by id', async ({ request }) => {
    const carrier = await newCarrier(request);
    await request.delete(`${C}/${carrier._id}`, await as(request, 'admin'));
    const res = await request.get(`${C}/${carrier._id}`, await as(request, 'agent'));
    expect(res.status(), 'the list hides it, so the detail endpoint must too').toBe(404);
  });

  test('F14-N1 create validation answers 4xx, never 5xx', async ({ request }) => {
    const admin = await as(request, 'admin');
    const dup = uniq('Dup Carrier');
    await newCarrier(request, { name: dup });
    const cases: Array<[string, any]> = [
      ['no name', { category: ['Life Insurance'] }],
      ['no category', { name: uniq('x') }],
      ['empty category', { name: uniq('x'), category: [] }],
      ['invalid category value', { name: uniq('x'), category: ['Crypto'] }],
      ['javascript: contracting link', { name: uniq('x'), category: ['Life Insurance'], contractingLink: 'javascript:alert(1)' }],
      ['not a url', { name: uniq('x'), category: ['Life Insurance'], contractingLink: 'not a url' }],
      ['duplicate name, other case', { name: dup.toUpperCase(), category: ['Life Insurance'] }],
      ['name is an object', { name: { $ne: 1 }, category: ['Life Insurance'] }],
      ['name is an array', { name: ['a', 'b'], category: ['Life Insurance'] }],
      ['regex metacharacters in name', { name: '(((.*+?^$[', category: ['Life Insurance'] }]
    ];
    for (const [label, data] of cases) {
      const res = await request.post(C, { ...admin, data });
      const ok = label === 'regex metacharacters in name' ? [201] : [400];
      expect(ok, `${label} -> ${res.status()}`).toContain(res.status());
    }
  });

  test('F14-N2 hostile query strings never cause a 5xx', async ({ request }) => {
    for (const q of ['category[$ne]=x', 'category=%00', 'activeOnly[$gt]=1', 'category[]=Life&category[]=Health']) {
      const res = await request.get(`${C}?${q}`, await as(request, 'agent'));
      expect(res.status(), q).toBeLessThan(500);
    }
  });

  test('F14-E1 a deactivated carrier\'s name can be reused (the database index allows it)', async ({ request }) => {
    const name = uniq('Reusable');
    const first = await newCarrier(request, { name });
    await request.delete(`${C}/${first._id}`, await as(request, 'admin'));
    const again = await request.post(C, { ...(await as(request, 'admin')), data: { name, category: ['Life Insurance'] } });
    expect(again.status(), 'name of a deleted carrier must be reusable').toBe(201);
  });

  test('F14-E2 contract request: idempotent, own records only, inactive carrier refused', async ({ request }) => {
    const carrier = await newCarrier(request);
    const agent = await as(request, 'agent');
    const first = await request.post(`${C}/${carrier._id}/request`, agent);
    expect(first.status()).toBe(201);
    const again = await request.post(`${C}/${carrier._id}/request`, agent);
    expect(again.status()).toBe(200);
    const mine = await (await request.get(`${C}/my-statuses`, agent)).json();
    const rows = (Array.isArray(mine) ? mine : mine.statuses).filter((s: any) => (s.carrier?._id || s.carrier) === carrier._id);
    expect(rows).toHaveLength(1);
    const theirs = await (await request.get(`${C}/my-statuses`, await as(request, 'other'))).json();
    expect(JSON.stringify(theirs)).not.toContain(carrier._id);

    const gone = await newCarrier(request);
    await request.delete(`${C}/${gone._id}`, await as(request, 'admin'));
    expect((await request.post(`${C}/${gone._id}/request`, agent)).status()).toBe(404);
  });

  test('F14-A1 appointment flow: request, appoint, unappoint with rules and a single notification each', async ({ request }) => {
    const carrier = await newCarrier(request);
    const agent = await as(request, 'agent');
    const admin = await as(request, 'admin');
    const status = (await (await request.post(`${C}/${carrier._id}/request`, agent)).json()).status;

    expect((await request.put(`${C}/admin/status/${status._id}/unappoint`, { ...admin, data: {} })).status(), 'cannot unappoint a pending request').toBe(400);

    const before = await unreadCount(request, 'agent');
    expect((await request.put(`${C}/admin/status/${status._id}/appoint`, { ...admin, data: {} })).status()).toBe(200);
    const afterFirst = await unreadCount(request, 'agent');
    expect(afterFirst).toBe(before + 1);

    const second = await request.put(`${C}/admin/status/${status._id}/appoint`, { ...admin, data: {} });
    expect([200, 400, 409]).toContain(second.status());
    expect(await unreadCount(request, 'agent'), 'appointing twice must not notify twice').toBe(afterFirst);

    expect((await request.put(`${C}/admin/status/${status._id}/unappoint`, { ...admin, data: {} })).status()).toBe(200);
    const mine = await (await request.get(`${C}/my-statuses`, agent)).json();
    const row = (Array.isArray(mine) ? mine : mine.statuses).find((s: any) => s._id === status._id);
    expect(row.status).toBe('Unappointed');
  });

  test('F14-A2 admin status upsert: validation and unknown ids', async ({ request }) => {
    const carrier = await newCarrier(request);
    const admin = await as(request, 'admin');
    const agentId = await userId(request, 'other');
    const put = (a: string, c: string, status: any) => request.put(`${C}/admin/agent/${a}/carrier/${c}/status`, { ...admin, data: { status } });
    expect((await put(agentId, carrier._id, 'Hacked')).status()).toBe(400);
    expect((await put(agentId, carrier._id, undefined)).status()).toBe(400);
    expect((await put('0'.repeat(24), carrier._id, 'Appointed')).status()).toBe(404);
    expect((await put(agentId, '0'.repeat(24), 'Appointed')).status()).toBe(404);
    expect((await put(agentId, carrier._id, 'Appointed')).status()).toBe(200);
  });

  test('F14-A3 status notes: empty rejected, agents denied', async ({ request }) => {
    const carrier = await newCarrier(request);
    const status = (await (await request.post(`${C}/${carrier._id}/request`, await as(request, 'agent'))).json()).status;
    const url = `${C}/admin/status/${status._id}/notes`;
    expect((await request.post(url, { ...(await as(request, 'admin')), data: { text: '  ' } })).status()).toBe(400);
    expect((await request.post(url, { ...(await as(request, 'agent')), data: { text: 'x' } })).status()).toBe(403);
    expect((await request.post(url, { ...(await as(request, 'admin')), data: { text: 'Waiting on E&O' } })).status()).toBe(200);
  });

  test('F14-D1 documents: upload rules, agent download, unicode file names, delete', async ({ request }) => {
    const carrier = await newCarrier(request);
    const admin = await as(request, 'admin');
    const up = (file: any, name = 'Rate sheet') => request.post(`${C}/${carrier._id}/documents`, { ...admin, multipart: { file, name } });

    expect((await up({ name: 'x.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') })).status()).toBe(400);
    expect((await up({ name: 'big.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(4 * 1024 * 1024, 1) })).status(), '4 MB > 3 MB limit').toBe(400);
    expect((await up({ name: 'empty.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(0) })).status()).toBe(400);
    expect((await up({ name: 'a.pdf', mimeType: 'application/pdf', buffer: PDF }, '   ')).status(), 'name required').toBe(400);

    const ok = await up({ name: 'Guía “2026” 😀.pdf', mimeType: 'application/pdf', buffer: PDF });
    expect(ok.status()).toBe(201);
    const doc = (await ok.json()).documents.slice(-1)[0];
    expect(doc.originalFileName, 'non-ASCII names must be stored as sent, not garbled').toBe('Guía “2026” 😀.pdf');
    const dl = await request.get(`${C}/${carrier._id}/documents/${doc._id}/download`, await as(request, 'agent'));
    expect(dl.status(), 'a unicode file name must still download').toBe(200);
    expect(Buffer.compare(await dl.body(), PDF)).toBe(0);

    expect((await request.delete(`${C}/${carrier._id}/documents/${doc._id}`, await as(request, 'agent'))).status()).toBe(403);
    expect((await request.delete(`${C}/${carrier._id}/documents/${doc._id}`, admin)).status()).toBe(200);
    expect((await request.get(`${C}/${carrier._id}/documents/${doc._id}/download`, await as(request, 'agent'))).status()).toBe(404);
  });
});
