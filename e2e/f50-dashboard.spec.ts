import { test, expect, APIRequestContext } from '@playwright/test';
import { API, as } from './helpers/api';

const { USERS, PASSWORD } = require('./helpers/users');

// Soft delete in the admin API needs a replica set (transactions), which the throwaway standalone
// Mongo does not have, so flag deleted users straight in the database.
async function softDelete(id: string) {
  const { MongoClient, ObjectId } = require('../backend/node_modules/mongodb');
  const client = new MongoClient(process.env.E2E_DB || 'mongodb://localhost:27018/rph_e2e_d');
  await client.connect();
  try {
    await client.db().collection('users').updateOne({ _id: new ObjectId(id) }, { $set: { deletedAt: new Date() } });
  } finally {
    await client.close();
  }
}

const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const flatten = (nodes: any[]): any[] => nodes.flatMap((n) => [n, ...flatten(n.children || [])]);

async function adminAuth(request: APIRequestContext) {
  return as(request, 'admin');
}

async function userId(request: APIRequestContext, email: string) {
  const res = await request.get(`${API}/admin/users?limit=500&search=${encodeURIComponent(email)}`, await adminAuth(request));
  const body = await res.json();
  const list: any[] = Array.isArray(body) ? body : body.users;
  return list.find((u) => u.email === email)._id as string;
}

/** Create an agent through the admin API, put it under `uplineEmail`, and log it in. */
async function makeAgent(request: APIRequestContext, uplineEmail: string | null, label: string) {
  const admin = await adminAuth(request);
  const email = `e2e-d-${label}-${uniq()}@example.com`;
  const phone = `555${Math.floor(1000000 + Math.random() * 8999999)}`;
  const res = await request.post(`${API}/admin/users`, {
    ...admin,
    data: { name: `D ${label}`, email, phone, role: 'agent', password: PASSWORD }
  });
  expect(res.status(), 'create user').toBe(201);
  const id = (await res.json()).user._id;
  if (uplineEmail) {
    const up = await userId(request, uplineEmail);
    const t = await request.put(`${API}/admin/users/${id}/transfer`, { ...admin, data: { newUplineId: up } });
    expect(t.status(), 'transfer').toBe(200);
  }
  const login = await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
  expect(login.status(), 'login new agent').toBe(200);
  const token = (await login.json()).token;
  return { id, email, headers: { Authorization: `Bearer ${token}` } };
}

test.describe('F50 dashboard numbers and team', () => {
  test('F50-N1 stats, recruits, downline and my-team agree on a 3-level tree with deleted and inactive agents', async ({ request }) => {
    const top = await makeAgent(request, null, 'top');
    const a = await makeAgent(request, top.email, 'a');
    const b = await makeAgent(request, top.email, 'b');
    const a1 = await makeAgent(request, a.email, 'a1');
    const a2 = await makeAgent(request, a.email, 'a2');
    const a11 = await makeAgent(request, a1.email, 'a11');
    const admin = await adminAuth(request);
    // b is inactive, a2 is soft-deleted
    expect((await request.put(`${API}/admin/users/${b.id}/deactivate`, { ...admin, data: {} })).status()).toBeLessThan(300);
    await softDelete(a2.id);

    const stats = (await (await request.get(`${API}/agent/stats`, top)).json()).stats;
    expect(stats.directRecruits).toBe(2); // a, b
    expect(stats.activeRecruits).toBe(1);
    expect(stats.inactiveRecruits).toBe(1);
    expect(stats.totalDownline).toBe(4); // a, b, a1, a11 (a2 deleted)

    const rec = await (await request.get(`${API}/agent/recruits`, top)).json();
    expect(rec.recruits.map((r: any) => r.email).sort()).toEqual([a.email, b.email].sort());
    expect(rec.stats).toMatchObject({ total: 2, active: 1, inactive: 1 });

    const down = await (await request.get(`${API}/agent/downline`, top)).json();
    expect(down.stats.totalMembers).toBe(4);
    expect(down.stats.totalActive).toBe(3);
    expect(down.stats.totalInactive).toBe(1);
    expect(down.stats.levels).toBe(3);

    const team = await (await request.get(`${API}/agent/my-team`, top)).json();
    const all = flatten(team.tree);
    expect(all.map((n: any) => n.email)).not.toContain(a2.email);
    expect(team.stats.totalMembers).toBe(4);
    expect(team.stats.directRecruits).toBe(2);
    const node11 = all.find((n: any) => n.email === a11.email);
    expect(node11.treeLevel).toBe(3);

    const list = await (await request.get(`${API}/agent/my-team?view=list&status=inactive`, top)).json();
    expect(list.members.map((m: any) => m.email)).toEqual([b.email]);

    // an agent with no team
    const lone = await makeAgent(request, null, 'lone');
    const loneStats = (await (await request.get(`${API}/agent/stats`, lone)).json()).stats;
    expect(loneStats).toMatchObject({ directRecruits: 0, totalDownline: 0, activeRecruits: 0, inactiveRecruits: 0 });
    const loneTeam = await (await request.get(`${API}/agent/my-team`, lone)).json();
    expect(loneTeam.tree).toEqual([]);
    expect((await request.get(`${API}/agent/downline`, lone)).status()).toBe(200);
  });

  test('F50-V1 recruits: invalid search/sort/paging input never gives a 5xx', async ({ request }) => {
    const auth = await as(request, 'agent');
    for (const q of ['search=(', 'search=[', 'search=*', 'search=\\', 'limit=-1', 'page=-3', 'page=0&limit=0', 'sortBy=$bad', 'sortBy=password', 'limit=100000']) {
      const res = await request.get(`${API}/agent/recruits?${q}`, auth);
      expect(res.status(), q).toBeLessThan(500);
    }
    const res = await request.get(`${API}/agent/recruits?search=${encodeURIComponent('(')}`, auth);
    expect([200, 400]).toContain(res.status());
  });

  test('F50-V2 recruits: sorting by a secret field is refused or ignored', async ({ request }) => {
    const auth = await as(request, 'agent');
    const res = await request.get(`${API}/agent/recruits?sortBy=password`, auth);
    expect(res.status()).toBeLessThan(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/\$2[aby]\$/);
  });

  test('F50-V3 my-team: bad paging and sort input never gives a 5xx', async ({ request }) => {
    const auth = await as(request, 'agent');
    for (const q of ['view=list&limit=-5', 'view=list&page=-2', 'view=list&page=0&limit=0', 'view=list&sortBy=nonsense', 'view=list&dateFrom=garbage', 'view=list&search=(']) {
      const res = await request.get(`${API}/agent/my-team?${q}`, auth);
      expect(res.status(), q).toBeLessThan(500);
    }
    const bad = await (await request.get(`${API}/agent/my-team?view=list&limit=-5`, auth)).json();
    expect(bad.members.length).toBeGreaterThanOrEqual(0);
    expect(bad.pagination.pages).toBeGreaterThanOrEqual(0);
  });

  test('F50-R1 referral link has the apply path and a real code, never "undefined"', async ({ request }) => {
    const res = await request.get(`${API}/agent/referral-link`, await as(request, 'agent'));
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.referralLink).toMatch(/^https?:\/\/[^/]+\/apply\?ref=[A-Z0-9]+$/);
    expect(body.referralLink).toContain(body.referralCode);
  });

  test('F50-C1 checklist for an unlicensed agent shows study + license steps, no onboarding steps', async ({ request }) => {
    const lone = await makeAgent(request, null, 'chk');
    const res = await request.get(`${API}/agent/dashboard/checklist`, lone);
    expect(res.status()).toBe(200);
    const { checklist } = await res.json();
    expect(checklist).toHaveLength(2);
    expect(checklist.every((i: any) => i.completed === false)).toBe(true);
  });

  test('F50-W1 welcome message dismiss is idempotent and never 5xx', async ({ request }) => {
    const lone = await makeAgent(request, null, 'wel');
    expect((await request.get(`${API}/agent/welcome-message`, lone)).status()).toBe(200);
    expect((await request.post(`${API}/agent/welcome-message/dismiss`, lone)).status()).toBe(200);
    expect((await request.post(`${API}/agent/welcome-message/dismiss`, lone)).status()).toBe(200);
    const after = await (await request.get(`${API}/agent/welcome-message`, lone)).json();
    expect(after.show).toBe(false);
  });

  test('F50-A1 announcements: an agent cannot read an inactive or admin-only broadcast by id', async ({ request }) => {
    const admin = await adminAuth(request);
    const agent = await makeAgent(request, null, 'ann');
    // Broadcast created after the agent so that it is visible in principle
    const mk = async (data: any) => {
      const r = await request.post(`${API}/broadcasts`, { ...admin, data });
      expect(r.status()).toBe(201);
      return (await r.json()).broadcast;
    };
    const visible = await mk({ title: `Hello ${uniq()}`, message: '<p>hi all</p>', targetRoles: ['agent'] });
    const adminOnly = await mk({ title: `Admins ${uniq()}`, message: '<p>secret admin note</p>', targetRoles: ['admin'] });
    const retired = await mk({ title: `Retired ${uniq()}`, message: '<p>retired</p>', targetRoles: [] });
    expect((await request.put(`${API}/broadcasts/${retired._id}`, { ...admin, data: { isActive: false } })).status()).toBe(200);

    const list = await (await request.get(`${API}/broadcasts`, agent)).json();
    const ids = list.broadcasts.map((b: any) => b._id);
    expect(ids).toContain(visible._id);
    expect(ids).not.toContain(adminOnly._id);
    expect(ids).not.toContain(retired._id);

    expect((await request.get(`${API}/broadcasts/${visible._id}`, agent)).status()).toBe(200);
    expect((await request.get(`${API}/broadcasts/${adminOnly._id}`, agent)).status()).toBe(404);
    expect((await request.get(`${API}/broadcasts/${retired._id}`, agent)).status()).toBe(404);

    const unread = await (await request.get(`${API}/broadcasts/unread-count`, agent)).json();
    expect(unread.unreadCount).toBe(0); // visible was read above; others not visible
  });

  test('F50-A2 announcements: bad paging gives 4xx or a sane page, never 5xx', async ({ request }) => {
    const agent = await as(request, 'agent');
    for (const q of ['page=-1', 'limit=-1', 'page=0&limit=0', 'limit=abc']) {
      const res = await request.get(`${API}/broadcasts?${q}`, agent);
      expect(res.status(), q).toBeLessThan(500);
    }
    expect((await request.get(`${API}/broadcasts/not-an-id`, agent)).status()).toBe(400);
  });
});
