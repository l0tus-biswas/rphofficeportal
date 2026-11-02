import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { API, as, carrierId } from './helpers/api';

const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function submit(request: any, who: any, over: Record<string, unknown> = {}) {
  const res = await request.post(`${API}/production`, {
    ...(await as(request, who)),
    data: { clientName: `C${uniq()}`, productSold: 'Term Life Insurance', carrier: await carrierId(request), premiumAmount: 100, ...over }
  });
  expect(res.status(), JSON.stringify(await res.json())).toBe(201);
  return res.json();
}
const doc = (name: string, mimeType: string, body: string) => ({ document: { name, mimeType, buffer: Buffer.from(body) } });

test.describe('F52 production extras', () => {
  test('F52-X1 CSV export neutralises formulas and quotes commas, quotes and newlines', async ({ request }) => {
    const t = uniq();
    await submit(request, 'agent', { clientName: `=HYPERLINK("http://evil/${t}")` });
    await submit(request, 'agent', { clientName: `+cmd ${t}` });
    await submit(request, 'agent', { clientName: `@SUM(1) ${t}` });
    await submit(request, 'agent', { clientName: `Smith, "Bob" ${t}`, notes: 'line1\nline2' });
    const res = await request.get(`${API}/production/export`, await as(request, 'agent'));
    expect(res.status()).toBe(200);
    const csv = await res.text();
    expect(csv).not.toMatch(/(^|,|\n)"?=HYPERLINK/);
    expect(csv).not.toMatch(new RegExp(`(^|,|\\n)"?\\+cmd ${t}`));
    expect(csv).not.toMatch(new RegExp(`(^|,|\\n)"?@SUM\\(1\\) ${t}`));
    expect(csv).toContain(`"Smith, ""Bob"" ${t}"`);
    expect(csv).toContain('"line1\nline2"');
  });

  test('F52-S1 stats/filtered and stats/summary agree for an admin agent filter; bad ids are 4xx', async ({ request }) => {
    const sub = await submit(request, 'other', { premiumAmount: 321 });
    const admin = await as(request, 'admin');
    const aid = sub.agent._id;
    const filtered = (await (await request.get(`${API}/production/stats/filtered?agentId=${aid}`, admin)).json()).summary;
    const summary = (await (await request.get(`${API}/production/stats/summary?agentId=${aid}`, admin)).json()).summary;
    expect(filtered.totalSubmissions).toBeGreaterThan(0);
    expect(filtered.totalSubmissions).toBe(summary.totalSubmissions);
    expect(filtered.totalPremium).toBe(summary.totalPremium);
    expect((await request.get(`${API}/production/stats/summary?agentId=zzz`, admin)).status()).toBe(400);
    expect((await request.get(`${API}/production/stats/filtered?agentId=zzz`, admin)).status()).toBe(400);
  });

  test('F52-V1 bad paging values never give a 5xx on list, ranking and team-report', async ({ request }) => {
    const auth = await as(request, 'agent');
    for (const q of ['?page=-1', '?limit=-1', '?page=0&limit=0', '?limit=999999']) {
      expect((await request.get(`${API}/production${q}`, auth)).status(), q).toBeLessThan(500);
    }
    for (const q of ['?limit=-1', '?limit=0', '?window=-5', '?sortBy=zzz']) {
      expect((await request.get(`${API}/production/ranking${q}`, auth)).status(), q).toBeLessThan(500);
    }
    expect((await request.get(`${API}/production/team-report?window=abc`, auth)).status()).toBeLessThan(500);
  });

  test('F52-D1 a deleted submission is gone: no read, edit, review or second delete, and not counted', async ({ request }) => {
    const agent = await as(request, 'agent');
    const admin = await as(request, 'admin');
    const s = await submit(request, 'agent', { premiumAmount: 777 });
    const before = (await (await request.get(`${API}/production/stats/summary`, agent)).json()).summary.totalPremium;
    expect((await request.delete(`${API}/production/${s._id}`, agent)).status()).toBe(200);
    const after = (await (await request.get(`${API}/production/stats/summary`, agent)).json()).summary.totalPremium;
    expect(after).toBe(before - 777);
    expect((await request.get(`${API}/production/${s._id}`, agent)).status()).toBe(404);
    expect((await request.put(`${API}/production/${s._id}`, { ...agent, data: { notes: 'zombie' } })).status()).toBe(404);
    expect((await request.put(`${API}/production/${s._id}/review`, { ...admin, data: { status: 'In Force' } })).status()).toBe(404);
    expect((await request.delete(`${API}/production/${s._id}`, agent)).status()).toBe(404);
  });

  test('F52-U1 attachment upload: bad type is 4xx, rejected uploads leave no file, others cannot attach', async ({ request }) => {
    const s = await submit(request, 'agent');
    const t = uniq();
    const dir = path.join(__dirname, '..', 'backend', 'uploads', 'production');
    const count = () => (fs.existsSync(dir) ? fs.readdirSync(dir).length : 0);
    const before = count();
    const exe = await request.post(`${API}/production/${s._id}/upload`, {
      ...(await as(request, 'agent')), multipart: doc(`x-${t}.exe`, 'application/x-msdownload', 'MZ')
    });
    expect(exe.status()).toBe(400);
    const other = await request.post(`${API}/production/${s._id}/upload`, {
      ...(await as(request, 'other')), multipart: doc(`y-${t}.pdf`, 'application/pdf', '%PDF-1.4')
    });
    expect(other.status()).toBe(403);
    const ghost = await request.post(`${API}/production/64b000000000000000000000/upload`, {
      ...(await as(request, 'agent')), multipart: doc(`z-${t}.pdf`, 'application/pdf', '%PDF-1.4')
    });
    expect(ghost.status()).toBe(404);
    await sleep(300);
    expect(count()).toBe(before);
    const ok = await request.post(`${API}/production/${s._id}/upload`, {
      ...(await as(request, 'agent')), multipart: doc(`ok-${t}.pdf`, 'application/pdf', '%PDF-1.4')
    });
    expect(ok.status()).toBe(200);
  });

  test('F52-R1 ranking and team scope only expose the agent own team; custom fields are admin-only to write', async ({ request }) => {
    await submit(request, 'other', { premiumAmount: 55 });
    const rank = await (await request.get(`${API}/production/ranking`, await as(request, 'agent'))).json();
    expect(JSON.stringify(rank)).not.toContain('e2e-other@example.com');
    const team = await (await request.get(`${API}/production?scope=team`, await as(request, 'agent'))).json();
    expect(JSON.stringify(team)).not.toContain('e2e-other@example.com');
    expect((await request.put(`${API}/production/custom-fields`, { ...(await as(request, 'agent')), data: { fields: [] } })).status()).toBe(403);
  });
});
