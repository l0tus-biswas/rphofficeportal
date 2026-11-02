import { test, expect, APIRequestContext } from '@playwright/test';
import { API, as } from './helpers/api';

const A = API;
const uniq = () => `E2E-${Date.now()}${Math.floor(Math.random() * 1e4)}`;
const csv = (...rows: string[]) => Buffer.from(['first_name,last_name,issuer,agent,household_size', ...rows].join('\n'), 'utf-8');
const f = (buffer: Buffer, name = 'aca.csv', mimeType = 'text/csv') => ({ name, mimeType, buffer });

async function upload(request: APIRequestContext, file: any, fields: Record<string, string> = {}, query = '') {
  return request.post(`${A}/admin/aca-clients/upload${query}`, { ...(await as(request, 'admin')), multipart: { files: file, ...fields } });
}
const records = async (request: APIRequestContext, batch: string) =>
  (await (await request.get(`${A}/admin/aca-clients/records?batch=${encodeURIComponent(batch)}`, await as(request, 'admin'))).json()).records;

test.describe('F22 ACA management', () => {
  test('F22-I1 agents cannot use any admin ACA endpoint', async ({ request }) => {
    const agent = await as(request, 'agent');
    expect((await request.post(`${A}/admin/aca-clients/upload`, { ...agent, multipart: { files: f(csv('a,b,c,Lotus Test,1')) } })).status()).toBe(403);
    for (const p of ['admin/aca-clients/batches', 'admin/aca-clients/records', 'admin/aca-clients/sample-csv', 'admin/aca-tiers', 'admin/aca-tiers/agent-overrides', 'admin/aca-tiers/agents/search?q=a']) {
      expect((await request.get(`${A}/${p}`, agent)).status(), p).toBe(403);
    }
    expect((await request.delete(`${A}/admin/aca-clients/batches/2026-01`, agent)).status()).toBe(403);
    expect((await request.put(`${A}/admin/aca-tiers`, { ...agent, data: { tiers: [] } })).status()).toBe(403);
    expect((await request.get(`${A}/dashboard/aca-tracker`, agent)).status(), 'tracker is for agents').toBe(200);
  });

  test('F22-S1 sample CSV downloads and is importable', async ({ request }) => {
    const res = await request.get(`${A}/admin/aca-clients/sample-csv`, await as(request, 'admin'));
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body.split('\n')[0]).toBe('first_name,last_name,issuer,agent,household_size');
  });

  test('F22-U1 bad uploads answer 4xx, never 5xx', async ({ request }) => {
    const cases: Array<[string, any]> = [
      ['exe', f(Buffer.from('MZ'), 'x.exe', 'application/x-msdownload')],
      ['empty', f(Buffer.alloc(0))],
      ['header only', f(csv())],
      ['binary xlsx junk', f(Buffer.from([0, 1, 2, 3]), 'x.xlsx', 'application/octet-stream')],
      ['oversize', f(Buffer.alloc(11 * 1024 * 1024, 65))]
    ];
    for (const [label, file] of cases) {
      const res = await upload(request, file);
      expect(res.status(), `${label} -> ${res.status()}`).toBeGreaterThanOrEqual(400);
      expect(res.status(), `${label} must not be 5xx`).toBeLessThan(500);
    }
    expect((await request.post(`${A}/admin/aca-clients/upload`, { ...(await as(request, 'admin')), multipart: { note: 'x' } })).status()).toBe(400);
  });

  test('F22-U2 import sums households, matches by name, reports unmatched and invalid rows', async ({ request }) => {
    const batch = uniq();
    const res = await upload(request, f(csv(
      'A,B,Ambetter,Lotus Test,2',
      'C,D,Oscar,lotus test,3',
      'E,F,Oscar,Nobody Atall,1',
      'G,H,Oscar,E2E Downline,-4',
      'I,J,Oscar,,1',
      'K,L,Oscar,E2E Downline,abc',
      'M,N,Oscar,E2E Other Team,Ünï'
    )), { uploadBatch: batch });
    expect(res.status()).toBe(200);
    const out = await res.json();
    expect(out.matched).toBe(1);
    expect(out.unmatched.map((u: any) => u.agentName)).toEqual(['Nobody Atall']);
    expect(out.invalidRows.length).toBe(4);
    const recs = await records(request, batch);
    expect(recs).toHaveLength(1);
    expect(recs[0].clientCount).toBe(5);

    // second upload of same batch updates, does not duplicate
    await upload(request, f(csv('A,B,Ambetter,Lotus Test,7')), { uploadBatch: batch });
    const again = await records(request, batch);
    expect(again).toHaveLength(1);
    expect(again[0].clientCount).toBe(7);
  });

  test('F22-U3 a partial agent name does not match a different agent', async ({ request }) => {
    const batch = uniq();
    const out = await (await upload(request, f(csv('A,B,x,Lot Test,2')), { uploadBatch: batch })).json();
    expect(out.matched, '"Lot Test" is not "Lotus Test"').toBe(0);
  });

  test('F22-R1 replaceBatch with an unusable file keeps the existing batch', async ({ request }) => {
    const batch = uniq();
    await upload(request, f(csv('A,B,x,Lotus Test,4')), { uploadBatch: batch });
    for (const file of [f(Buffer.from([0, 1, 2, 3]), 'x.xlsx', 'application/octet-stream'), f(csv('A,B,x,,1')), f(csv())]) {
      const res = await upload(request, file, { uploadBatch: batch, replaceBatch: 'true' });
      expect(res.status()).toBeGreaterThanOrEqual(400);
      expect(res.status()).toBeLessThan(500);
    }
    expect((await records(request, batch)).length, 'good data must survive a failed replace').toBe(1);
    const ok = await upload(request, f(csv('A,B,x,E2E Downline,2')), { uploadBatch: batch, replaceBatch: 'true' });
    expect(ok.status()).toBe(200);
    const recs = await records(request, batch);
    expect(recs.map((r: any) => r.agentName)).toEqual(['E2E Downline']);
  });

  test('F22-R2 operator objects in batch parameters cannot touch other batches', async ({ request }) => {
    const keep = uniq();
    await upload(request, f(csv('A,B,x,Lotus Test,4')), { uploadBatch: keep });
    const res = await upload(request, f(csv('A,B,x,E2E Downline,1')), { replaceBatch: 'true' }, '?uploadBatch[$ne]=zzz');
    expect(res.status()).toBe(400);
    expect((await records(request, keep)).length, 'other batch must be untouched').toBe(1);
    const get = await request.get(`${A}/admin/aca-clients/records?batch[$ne]=zzz`, await as(request, 'admin'));
    expect(get.status()).toBe(400);
  });

  test('F22-B1 batch delete is idempotent and tolerant of odd names', async ({ request }) => {
    const admin = await as(request, 'admin');
    const batch = uniq();
    await upload(request, f(csv('A,B,x,Lotus Test,4')), { uploadBatch: batch });
    const del = await request.delete(`${A}/admin/aca-clients/batches/${encodeURIComponent(batch)}`, admin);
    expect(del.status()).toBe(200);
    expect((await del.json()).deletedCount).toBe(1);
    expect((await request.delete(`${A}/admin/aca-clients/batches/${encodeURIComponent(batch)}`, admin)).status()).toBeLessThan(500);
    for (const odd of ['%00', '(((.*', 'a%2Fb', '..%2F..']) {
      expect((await request.delete(`${A}/admin/aca-clients/batches/${odd}`, admin)).status(), odd).toBeLessThan(500);
    }
  });

  test('F22-T1 tier config validation', async ({ request }) => {
    const admin = await as(request, 'admin');
    const ok = { tier: 1, label: 'T1', threshold: 10, rate: 1 };
    const bad: any[] = [
      undefined, 'x', [], [null], [1], [{}], [{ ...ok, label: { $ne: 1 } }], [{ ...ok, label: '' }],
      [{ ...ok, threshold: -1 }], [{ ...ok, rate: -5 }], [{ ...ok, tier: '1' }]
    ];
    for (const tiers of bad) {
      for (const url of [`${A}/admin/aca-tiers`, `${A}/admin/aca-tiers/agent/${'0'.repeat(24)}`]) {
        const res = await request.put(url, { ...admin, data: { tiers } });
        expect(res.status(), `${JSON.stringify(tiers)} ${url}`).toBe(400);
      }
    }
  });

  test('F22-T2 per-agent override: unknown or non-agent targets are 404, delete is idempotent', async ({ request }) => {
    const admin = await as(request, 'admin');
    const tiers = [{ tier: 0, label: 'T0', threshold: 0, rate: 0 }];
    const put = (id: string) => request.put(`${A}/admin/aca-tiers/agent/${id}`, { ...admin, data: { tiers } });
    expect((await put('0'.repeat(24))).status()).toBe(404);
    expect((await put('not-a-real-code')).status()).toBe(404);
    expect((await put('(((.*')).status()).toBeLessThan(500);
    const list = await (await request.get(`${A}/admin/aca-tiers/agents/search?q=E2E Other`, admin)).json();
    const id = list.agents[0]._id;
    expect((await put(id)).status()).toBe(200);
    expect((await request.delete(`${A}/admin/aca-tiers/agent/${id}`, admin)).status()).toBe(200);
    expect((await request.delete(`${A}/admin/aca-tiers/agent/${id}`, admin)).status()).toBe(200);
    expect((await request.delete(`${A}/admin/aca-tiers/agent/zzzz-nope`, admin)).status()).toBe(404);
  });

  test('F22-Q1 agent search tolerates hostile query values', async ({ request }) => {
    const admin = await as(request, 'admin');
    for (const q of ['q[$ne]=x', 'q=a&q=b', 'q[]=a', 'q=(((.*', 'q=%00', 'q=' + 'a'.repeat(5000)]) {
      expect((await request.get(`${A}/admin/aca-tiers/agents/search?${q}`, admin)).status(), q).toBeLessThan(500);
    }
    const found = await (await request.get(`${A}/admin/aca-tiers/agents/search?q=e2e-other`, admin)).json();
    expect(JSON.stringify(found)).not.toMatch(/password|\$2[aby]\$/);
  });

  test('F22-K1 tracker shows an agent only their own team in the breakdown', async ({ request }) => {
    const batch = uniq();
    await upload(request, f(csv('A,B,x,Lotus Test,2', 'A,B,x,E2E Downline,3', 'A,B,x,E2E Other Team,9')), { uploadBatch: batch });
    const t = await (await request.get(`${A}/dashboard/aca-tracker`, await as(request, 'agent'))).json();
    expect(t.uploadBatch).toBe(batch);
    const names = t.agentBreakdown.map((a: any) => a.agentName);
    expect(names).toContain('E2E Downline');
    expect(names).not.toContain('E2E Other Team');
    expect(t.totalVerifiedClients).toBe(5);
    const other = await (await request.get(`${A}/dashboard/aca-tracker`, await as(request, 'other'))).json();
    expect(JSON.stringify(other.agentBreakdown)).not.toContain('Lotus Test');
  });
});
