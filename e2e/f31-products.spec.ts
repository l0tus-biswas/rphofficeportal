import { test, expect } from '@playwright/test';
import { API, as } from './helpers/api';

const P = `${API}/admin/products`;
const uniq = (p: string) => `${p} ${Date.now()}${Math.floor(Math.random() * 1e5)}`;
const OID = '0'.repeat(24);

async function newProduct(request: any, over: Record<string, any> = {}) {
  const res = await request.post(P, { ...(await as(request, 'admin')), data: { name: uniq('E2E product'), category: 'Life Insurance', ...over } });
  expect(res.status(), 'create product').toBe(201);
  return (await res.json()).product;
}

test.describe('F31 product management', () => {
  test('F31-H1 admin creates/edits/deactivates; agents only see active products', async ({ request }) => {
    const p = await newProduct(request);
    const agent = await as(request, 'agent');
    expect((await (await request.get(P, agent)).json()).products.map((x: any) => x._id)).toContain(p._id);
    expect((await request.put(`${P}/${p._id}`, { ...(await as(request, 'admin')), data: { name: uniq('Renamed') } })).status()).toBe(200);
    expect((await request.delete(`${P}/${p._id}`, await as(request, 'admin'))).status()).toBe(200);
    expect((await (await request.get(P, agent)).json()).products.map((x: any) => x._id)).not.toContain(p._id);
    expect((await (await request.get(`${P}`, await as(request, 'admin'))).json()).products.map((x: any) => x._id)).toContain(p._id);
  });

  test('F31-I1 agents cannot write; anonymous cannot read', async ({ request }) => {
    const p = await newProduct(request);
    const agent = await as(request, 'agent');
    expect((await request.post(P, { ...agent, data: { name: uniq('x'), category: 'Life Insurance' } })).status()).toBe(403);
    expect((await request.put(`${P}/${p._id}`, { ...agent, data: { name: 'h' } })).status()).toBe(403);
    expect((await request.delete(`${P}/${p._id}`, agent)).status()).toBe(403);
    expect((await request.get(P)).status()).toBe(401);
  });

  test('F31-N1 validation answers 4xx, never 5xx', async ({ request }) => {
    const admin = await as(request, 'admin');
    const p = await newProduct(request);
    const post = (data: any) => request.post(P, { ...admin, data });
    const put = (data: any, id = p._id) => request.put(`${P}/${id}`, { ...admin, data });
    const cases: Array<[string, any]> = [
      ['no name', await post({ category: 'Life Insurance' })],
      ['whitespace name', await post({ name: '   ', category: 'Life Insurance' })],
      ['name object', await post({ name: { $ne: 1 }, category: 'Life Insurance' })],
      ['name array', await post({ name: ['a'], category: 'Life Insurance' })],
      ['name number', await post({ name: 123, category: 'Life Insurance' })],
      ['bad category', await post({ name: uniq('x'), category: 'Crypto' })],
      ['category object', await post({ name: uniq('x'), category: { $ne: 1 } })],
      ['huge name', await post({ name: 'x'.repeat(5000), category: 'Life Insurance' })],
      ['put name object', await put({ name: { a: 1 } })],
      ['put name blank', await put({ name: '   ' })],
      ['put bad category', await put({ category: 'Crypto' })],
      ['put isActive text', await put({ isActive: 'maybe' })],
      ['put malformed id', await put({ name: 'x' }, 'junk')],
      ['put unknown id', await put({ name: 'x' }, OID)],
      ['delete malformed id', await request.delete(`${P}/junk`, admin)]
    ];
    for (const [label, res] of cases) {
      expect(res.status(), `${label} -> ${res.status()}`).toBeGreaterThanOrEqual(400);
      expect(res.status(), `${label} -> ${res.status()}`).toBeLessThan(500);
    }
    for (const q of ['category[$ne]=x', 'category=%00', 'activeOnly[$gt]=1', 'category[]=a&category[]=b']) {
      expect((await request.get(`${P}?${q}`, admin)).status(), q).toBeLessThan(500);
    }
  });

  test('F31-D1 duplicate names: exact, case-insensitive and on rename answer 409/400', async ({ request }) => {
    const admin = await as(request, 'admin');
    const name = uniq('Dup product');
    await newProduct(request, { name });
    const same = await request.post(P, { ...admin, data: { name, category: 'Life Insurance' } });
    expect(same.status()).toBe(409);
    const upper = await request.post(P, { ...admin, data: { name: name.toUpperCase(), category: 'Life Insurance' } });
    expect([400, 409], 'case variant of an existing name').toContain(upper.status());
    const other = await newProduct(request);
    const ren = await request.put(`${P}/${other._id}`, { ...admin, data: { name } });
    expect([400, 409], 'rename to an existing name').toContain(ren.status());
  });

  test('F31-D2 concurrent creates of the same name produce exactly one product', async ({ request }) => {
    const admin = await as(request, 'admin');
    const name = uniq('Race product');
    const results = await Promise.all(Array.from({ length: 6 }, () => request.post(P, { ...admin, data: { name, category: 'Medicare' } })));
    const codes = results.map((r) => r.status());
    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(codes.every((c) => c < 500), `codes ${codes}`).toBe(true);
  });

  test('F31-D3 a deactivated product can be reactivated and shows to agents again', async ({ request }) => {
    const admin = await as(request, 'admin');
    const p = await newProduct(request);
    await request.delete(`${P}/${p._id}`, admin);
    expect((await request.delete(`${P}/${p._id}`, admin)).status(), 'repeat delete is idempotent').toBe(200);
    expect((await request.put(`${P}/${p._id}`, { ...admin, data: { isActive: true } })).status()).toBe(200);
    expect((await (await request.get(P, await as(request, 'agent'))).json()).products.map((x: any) => x._id)).toContain(p._id);
  });
});
