import { test, expect } from '@playwright/test';
import { API, as } from './helpers/api';

const C = `${API}/admin/coupons`;
const OID = '0'.repeat(24);
const rnd = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const day = 86400000;
const body = (over: Record<string, any> = {}) => ({
  code: `E2E${rnd()}`, description: 'E2E coupon description', discountType: 'percentage', discountValue: 10,
  validFrom: new Date(Date.now() - day).toISOString(), validUntil: new Date(Date.now() + 30 * day).toISOString(), ...over
});
async function newCoupon(request: any, over: Record<string, any> = {}) {
  const res = await request.post(C, { ...(await as(request, 'admin')), data: body(over) });
  expect(res.status(), 'create coupon ' + (await res.text())).toBe(201);
  return (await res.json()).coupon;
}

test.describe('F32 coupon management', () => {
  test('F32-H1 admin CRUD, toggle, verify', async ({ request }) => {
    const admin = await as(request, 'admin');
    const c = await newCoupon(request, { code: `lower${rnd()}` });
    expect(c.code, 'stored upper-case').toBe(c.code.toUpperCase());
    const v = await (await request.get(`${C}/verify/${encodeURIComponent(c.code.toLowerCase())}`, admin)).json();
    expect(v.valid).toBe(true);
    expect((await request.patch(`${C}/${c._id}/toggle`, admin)).status()).toBe(200);
    expect((await (await request.get(`${C}/verify/${c.code}`, admin)).json()).valid, 'inactive').toBe(false);
    expect((await request.put(`${C}/${c._id}`, { ...admin, data: { description: 'changed description' } })).status()).toBe(200);
    expect((await request.delete(`${C}/${c._id}`, admin)).status()).toBe(200);
    expect((await request.get(`${C}/verify/${c.code}`, admin)).status(), 'deleted code').toBe(404);
    expect((await request.get(`${C}/${c._id}`, admin)).status()).toBe(404);
  });

  test('F32-I1 agents and anonymous are denied everywhere', async ({ request }) => {
    const c = await newCoupon(request);
    const agent = await as(request, 'agent');
    for (const [verb, url] of [['get', C], ['get', `${C}/${c._id}`], ['post', C], ['put', `${C}/${c._id}`], ['delete', `${C}/${c._id}`],
      ['patch', `${C}/${c._id}/toggle`], ['get', `${C}/verify/${c.code}`]] as const) {
      expect((await (request as any)[verb](url, { ...agent, data: {} })).status(), `agent ${verb} ${url}`).toBe(403);
      expect((await (request as any)[verb](url, { data: {} })).status(), `anon ${verb} ${url}`).toBe(401);
    }
  });

  test('F32-V1 create validation: percentage > 100, negatives, dates, limits are 400', async ({ request }) => {
    const admin = await as(request, 'admin');
    const cases: Array<[string, any]> = [
      ['percentage 150', body({ discountValue: 150 })],
      ['negative value', body({ discountValue: -5 })],
      ['negative min purchase', body({ minPurchaseAmount: -1 })],
      ['negative max discount', body({ maxDiscountAmount: -1 })],
      ['absurd value', body({ discountValue: 1e300 })],
      ['until before from', body({ validUntil: new Date(Date.now() - 5 * day).toISOString() })],
      ['invalid date', body({ validFrom: 'not a date' })],
      ['usage limit negative', body({ usageLimit: -1 })],
      ['usage limit fractional', body({ usageLimit: 1.5 })],
      ['user usage limit 0', body({ userUsageLimit: 0 })],
      ['code object', body({ code: { $ne: 1 } })],
      ['code too short', body({ code: 'AB' })],
      ['code regex chars', body({ code: '(((.*+?' })],
      ['bad type', body({ discountType: 'free' })],
      ['bad role', body({ applicableRoles: ['root'] })],
      ['unknown field', body({ usageCount: 99 })],
      ['createdBy injected', body({ createdBy: OID })]
    ];
    for (const [label, data] of cases) {
      const res = await request.post(C, { ...admin, data });
      expect(res.status(), `${label} -> ${res.status()}`).toBe(400);
    }
  });

  test('F32-V2 update validation: dates order, percentage > 100, nulls', async ({ request }) => {
    const admin = await as(request, 'admin');
    const c = await newCoupon(request);
    const put = (data: any, id = c._id) => request.put(`${C}/${id}`, { ...admin, data });
    expect((await put({ discountValue: 150 })).status(), 'percentage 150 via update').toBe(400);
    expect((await put({ discountType: 'percentage', discountValue: 500 })).status()).toBe(400);
    expect((await put({ validUntil: new Date(Date.now() - 10 * day).toISOString() })).status(), 'until before from').toBe(400);
    expect((await put({ validFrom: new Date(Date.now() + 90 * day).toISOString() })).status(), 'from after until').toBe(400);
    expect((await put({ code: null })).status()).toBe(400);
    expect((await put({ description: 'x' })).status()).toBe(400);
    expect((await put({ discountValue: -1 })).status()).toBe(400);
    expect((await put({ usageCount: 0 })).status(), 'usageCount is not editable').toBe(400);
    expect((await put({ code: 'ab' })).status()).toBe(400);
    expect((await put({ description: 'fine description' }, 'junk')).status()).toBe(400);
    expect((await put({ description: 'fine description' }, OID)).status()).toBe(404);
    const after = (await (await request.get(`${C}/${c._id}`, admin)).json()).coupon;
    expect(after.discountValue).toBe(10);
  });

  test('F32-D1 duplicate codes: exact, other case, whitespace, on rename', async ({ request }) => {
    const admin = await as(request, 'admin');
    const a = await newCoupon(request);
    const b = await newCoupon(request);
    expect((await request.post(C, { ...admin, data: body({ code: a.code }) })).status()).toBe(400);
    expect((await request.post(C, { ...admin, data: body({ code: a.code.toLowerCase() }) })).status()).toBe(400);
    expect((await request.post(C, { ...admin, data: body({ code: `  ${a.code}  ` }) })).status()).toBe(400);
    expect((await request.put(`${C}/${b._id}`, { ...admin, data: { code: a.code.toLowerCase() } })).status()).toBe(400);
    expect((await request.put(`${C}/${a._id}`, { ...admin, data: { code: a.code.toLowerCase() } })).status(), 'same code, other case, own record').toBe(200);
  });

  test('F32-D2 concurrent creates of one code give exactly one coupon', async ({ request }) => {
    const admin = await as(request, 'admin');
    const data = body();
    const rs = await Promise.all(Array.from({ length: 6 }, () => request.post(C, { ...admin, data })));
    const codes = rs.map((r) => r.status());
    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(codes.every((c) => c < 500), `codes ${codes}`).toBe(true);
  });

  test('F32-E1 verify: expired, not yet valid, usage limit reached, hostile codes', async ({ request }) => {
    const admin = await as(request, 'admin');
    const expired = await newCoupon(request, { validFrom: new Date(Date.now() - 10 * day).toISOString(), validUntil: new Date(Date.now() - day).toISOString() });
    const future = await newCoupon(request, { validFrom: new Date(Date.now() + day).toISOString(), validUntil: new Date(Date.now() + 5 * day).toISOString() });
    const full = await newCoupon(request, { usageLimit: 0 });
    for (const c of [expired, future, full]) {
      expect((await (await request.get(`${C}/verify/${c.code}`, admin)).json()).valid, c.code).toBe(false);
    }
    for (const code of ['%00', '(((', '.*', '%24ne', 'a'.repeat(3000), '%20', 'x%2Fy']) {
      const res = await request.get(`${C}/verify/${code}`, admin);
      expect([200, 400, 404], `${code} -> ${res.status()}`).toContain(res.status());
    }
    expect((await request.get(`${C}/verify/%20${expired.code.toLowerCase()}%20`, admin)).status(), 'whitespace around a real code is tolerated or a clean 404').toBeLessThan(500);
    const list = await (await request.get(C, admin)).json();
    const row = list.coupons.find((x: any) => x._id === expired._id);
    expect(row.isExpired).toBe(true);
    expect(row.isValid).toBe(false);
  });

  test('F32-L1 list: hostile search / sort / paging never 5xx', async ({ request }) => {
    const admin = await as(request, 'admin');
    await newCoupon(request, { code: 'SEARCH' + rnd() });
    for (const q of ['search=(((', 'search=[', 'search=*', 'search=\\', 'search[$ne]=1', 'search[]=a&search[]=b', 'sortBy[]=a', 'sortBy=$where:1', 'sortBy=code:desc',
      'sortBy=:', 'page=-1', 'page=0', 'page=abc', 'limit=-5', 'limit=0', 'limit=999999999', 'status[$ne]=x', 'status=active']) {
      const res = await request.get(`${C}?${q}`, admin);
      expect(res.status(), q).toBeLessThan(500);
    }
    const many = await (await request.get(`${C}?limit=999999999`, admin)).json();
    expect(many.pagination.limit, 'limit is capped').toBeLessThanOrEqual(100);
    const found = await (await request.get(`${C}?search=${encodeURIComponent('SEARCH')}`, admin)).json();
    expect(found.coupons.length).toBeGreaterThan(0);
  });

  test('F32-L2 search treats regex characters literally', async ({ request }) => {
    const admin = await as(request, 'admin');
    await newCoupon(request, { description: 'Literal a.c description' });
    const dot = await (await request.get(`${C}?search=${encodeURIComponent('a.c desc')}`, admin)).json();
    expect(dot.coupons.length).toBeGreaterThan(0);
    const wild = await (await request.get(`${C}?search=${encodeURIComponent('.*')}`, admin)).json();
    expect(wild.coupons.every((c: any) => /\.\*/.test(c.code + c.description)), '".*" must not match everything').toBe(true);
  });
});
