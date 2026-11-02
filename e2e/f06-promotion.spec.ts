import { test, expect } from '@playwright/test';
import { API, as } from './helpers/api';

const name = () => `e2e${Date.now()}${Math.floor(Math.random() * 1e4)}`;

test.describe('F06 promotion levels', () => {
  test('F06-H1 admin creates a level, agents can read it, admin deletes it', async ({ request }) => {
    const admin = await as(request, 'admin');
    const n = name();
    const created = await request.post(`${API}/promotion/admin/levels`, { ...admin, data: { name: n, rank: 900 } });
    expect(created.status()).toBe(201);
    const level = (await created.json()).level;
    const seen = await (await request.get(`${API}/promotion/levels`, await as(request, 'agent'))).json();
    expect(seen.levels.map((l: any) => l.name)).toContain(n);
    const del = await request.delete(`${API}/promotion/admin/levels/${level._id}`, admin);
    expect(del.status()).toBe(200);
  });

  test('F06-N1 invalid level input is rejected with 4xx', async ({ request }) => {
    const admin = await as(request, 'admin');
    for (const [label, data] of [
      ['empty name', { name: '   ', rank: 901 }],
      ['rank 0', { name: name(), rank: 0 }],
      ['negative rank', { name: name(), rank: -3 }],
      ['missing rank', { name: name() }],
      ['rank as text', { name: name(), rank: 'abc' }]
    ] as Array<[string, Record<string, unknown>]>) {
      const res = await request.post(`${API}/promotion/admin/levels`, { ...admin, data });
      expect(res.status(), label).toBeGreaterThanOrEqual(400);
      expect(res.status(), label).toBeLessThan(500);
    }
  });

  test('F06-N2 duplicate level name is refused', async ({ request }) => {
    const admin = await as(request, 'admin');
    const n = name();
    const a = await request.post(`${API}/promotion/admin/levels`, { ...admin, data: { name: n, rank: 902 } });
    expect(a.status()).toBe(201);
    const b = await request.post(`${API}/promotion/admin/levels`, { ...admin, data: { name: n, rank: 903 } });
    expect(b.status()).toBe(400);
    await request.delete(`${API}/promotion/admin/levels/${(await a.json()).level._id}`, admin);
  });

  test('F06-N3 agent cannot create, edit, reorder or delete levels', async ({ request }) => {
    const agent = await as(request, 'agent');
    const fake = '0'.repeat(24);
    expect((await request.post(`${API}/promotion/admin/levels`, { ...agent, data: { name: name(), rank: 904 } })).status()).toBe(403);
    expect((await request.put(`${API}/promotion/admin/levels/${fake}`, { ...agent, data: { name: 'x' } })).status()).toBe(403);
    expect((await request.put(`${API}/promotion/admin/levels/reorder`, { ...agent, data: {} })).status()).toBe(403);
    expect((await request.delete(`${API}/promotion/admin/levels/${fake}`, agent)).status()).toBe(403);
  });

  test('F06-E1 tracker responds for an agent and never 5xx', async ({ request }) => {
    const res = await request.get(`${API}/promotion/tracker`, await as(request, 'agent'));
    expect(res.status()).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  test('F06-E2 malformed level id gives 4xx not 5xx', async ({ request }) => {
    const admin = await as(request, 'admin');
    expect((await request.delete(`${API}/promotion/admin/levels/not-an-id`, admin)).status()).toBeLessThan(500);
    expect((await request.put(`${API}/promotion/admin/levels/not-an-id`, { ...admin, data: { name: 'x' } })).status()).toBeLessThan(500);
  });
});
