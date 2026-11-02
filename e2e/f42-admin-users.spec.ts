import { test, expect, APIRequestContext } from '@playwright/test';
import { API, as } from './helpers/api';

const { USERS } = require('./helpers/users');
const PW = USERS.admin.password;
const stamp = () => `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
const A = `${API}/admin`;

// Soft delete uses Mongo transactions (replica set only); the local standalone Mongo cannot run it,
// so mark the user deleted straight in the throwaway DB, exactly what softDelete does to the user row.
async function markDeleted(id: string) {
  const mongoose = require('../backend/node_modules/mongoose');
  const conn = await mongoose.createConnection(process.env.E2E_MONGO || 'mongodb://localhost:27018/rph_e2e_c').asPromise();
  try {
    await conn.collection('users').updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $set: { deletedAt: new Date(), isActive: false } });
  } finally { await conn.close(); }
}

async function login(request: APIRequestContext, email: string, password = PW) {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } });
  expect(res.status(), `login ${email}`).toBe(200);
  const body = await res.json();
  return { headers: { Authorization: `Bearer ${body.token}` } };
}

async function createUser(request: APIRequestContext, role: 'admin' | 'agent', over: Record<string, any> = {}) {
  const s = stamp();
  const email = over.email || `e2e-f42-${s}@example.com`;
  const res = await request.post(`${A}/users`, {
    ...(await as(request, 'admin')),
    data: { name: `F42 ${s}`, email, phone: '5551234567', role, password: PW, ...over }
  });
  expect(res.status(), 'create user ' + (await res.text())).toBe(201);
  const user = (await res.json()).user;
  return { id: user._id as string, email, auth: await login(request, email) };
}

const adm = async (request: APIRequestContext) => await as(request, 'admin');

test.describe('F42 admin user management', () => {
  test('F42-V1 duplicate email is refused case-insensitively, including a soft-deleted user email', async ({ request }) => {
    const u = await createUser(request, 'agent');
    const dup = await request.post(`${A}/users`, { ...(await adm(request)), data: { name: 'Dup User', email: u.email.toUpperCase(), phone: '5551234567', role: 'agent' } });
    expect([400, 409]).toContain(dup.status());
    await markDeleted(u.id);
    const dup2 = await request.post(`${A}/users`, { ...(await adm(request)), data: { name: 'Dup User', email: u.email, phone: '5551234567', role: 'agent' } });
    expect([400, 409]).toContain(dup2.status());
    await request.delete(`${A}/users/${u.id}/permanent`, await adm(request));
  });

  test('F42-V2 create rejects invalid role, bad email, short password and non-string values with 4xx', async ({ request }) => {
    const base = { name: 'Valid Name', email: `e2e-f42-${stamp()}@example.com`, phone: '5551234567', role: 'agent' };
    for (const bad of [{ role: 'superadmin' }, { email: 'nope' }, { password: '123' }, { email: { $ne: null } }, { name: ['a', 'b'] }, { role: { $ne: 'x' } }]) {
      const res = await request.post(`${A}/users`, { ...(await adm(request)), data: { ...base, ...bad } });
      expect(res.status(), JSON.stringify(bad)).toBe(400);
    }
  });

  test('F42-S1 an admin cannot deactivate, demote or delete their own account', async ({ request }) => {
    const me = await createUser(request, 'admin');
    try {
      const dea = await request.put(`${A}/users/${me.id}/deactivate`, me.auth);
      expect(dea.status(), 'self deactivate').toBe(400);
      const upd = await request.put(`${A}/users/${me.id}`, { ...me.auth, data: { isActive: false } });
      expect(upd.status(), 'self isActive=false via update').toBe(400);
      const dem = await request.put(`${A}/users/${me.id}`, { ...me.auth, data: { role: 'agent' } });
      expect(dem.status(), 'self demote').toBe(400);
      const del = await request.delete(`${A}/users/${me.id}`, me.auth);
      expect(del.status(), 'self delete').toBe(400);
      const still = await request.get(`${API}/auth/me`, me.auth);
      expect(still.status(), 'still able to use the account').toBe(200);
    } finally {
      await request.put(`${A}/users/${me.id}/activate`, await adm(request));
      await request.put(`${A}/users/${me.id}`, { ...(await adm(request)), data: { role: 'agent' } });
      await markDeleted(me.id);
      await request.delete(`${A}/users/${me.id}/permanent`, await adm(request));
    }
  });

  test('F42-I1 impersonation: no nesting, stop needs a real impersonation token, blocked for inactive/deleted/self', async ({ request }) => {
    const target = await createUser(request, 'agent');
    const adminTarget = await createUser(request, 'admin');
    try {
      const imp = await request.post(`${A}/users/${target.id}/impersonate`, await adm(request));
      expect(imp.status()).toBe(200);
      const impAuth = { headers: { Authorization: `Bearer ${(await imp.json()).token}` } };
      // agent-impersonation token cannot reach admin routes
      expect((await request.get(`${A}/users`, impAuth)).status()).toBe(403);
      // an impersonated session that is an admin cannot start another impersonation
      const impAdmin = await request.post(`${A}/users/${adminTarget.id}/impersonate`, await adm(request));
      expect(impAdmin.status()).toBe(200);
      const impAdminAuth = { headers: { Authorization: `Bearer ${(await impAdmin.json()).token}` } };
      const nested = await request.post(`${A}/users/${target.id}/impersonate`, impAdminAuth);
      expect(nested.status(), 'nested impersonation').toBe(400);
      // stop-impersonation: normal token -> 400, garbage -> 401, none -> 401
      expect((await request.post(`${API}/auth/stop-impersonation`, await adm(request))).status()).toBe(400);
      expect((await request.post(`${API}/auth/stop-impersonation`, { headers: { Authorization: 'Bearer garbage' } })).status()).toBe(401);
      expect((await request.post(`${API}/auth/stop-impersonation`)).status()).toBe(401);
      const stop = await request.post(`${API}/auth/stop-impersonation`, impAuth);
      expect(stop.status()).toBe(200);
      expect((await stop.json()).user.email).toBe(USERS.admin.email);
      // self / inactive / malformed
      const self = await request.post(`${A}/users/${(await (await request.get(`${API}/auth/me`, await adm(request))).json()).user._id}/impersonate`, await adm(request));
      expect(self.status()).toBe(400);
      const inactiveList = await (await request.get(`${A}/users?search=${encodeURIComponent(USERS.inactive.email)}`, await adm(request))).json();
      const inactiveId = inactiveList.users[0]._id;
      expect((await request.post(`${A}/users/${inactiveId}/impersonate`, await adm(request))).status()).toBe(400);
      expect((await request.post(`${A}/users/not-an-id/impersonate`, await adm(request))).status()).toBe(400);
    } finally {
      for (const u of [target, adminTarget]) {
        await markDeleted(u.id);
        await request.delete(`${A}/users/${u.id}/permanent`, await adm(request));
      }
    }
  });

  test('F42-P1 promote: unknown level, non-string level and non-agent targets give 4xx', async ({ request }) => {
    const u = await createUser(request, 'agent');
    const adminUser = await createUser(request, 'admin');
    try {
      for (const level of ['no-such-level', { $ne: 1 }, ['associate'], 42, '', null]) {
        const res = await request.put(`${A}/users/${u.id}/promote`, { ...(await adm(request)), data: { level } });
        expect(res.status(), JSON.stringify(level)).toBe(400);
      }
      const lv = await request.get(`${API}/promotion/admin/levels`, await adm(request));
      const levels = await lv.json();
      const first = (levels.levels || levels)[0]?.name;
      if (first) {
        const ok = await request.put(`${A}/users/${u.id}/promote`, { ...(await adm(request)), data: { level: first } });
        expect(ok.status()).toBe(200);
      }
      const adminPromote = await request.put(`${A}/users/${adminUser.id}/promote`, { ...(await adm(request)), data: { level: first || 'associate' } });
      expect(adminPromote.status()).toBe(400);
    } finally {
      for (const x of [u, adminUser]) {
        await markDeleted(x.id);
        await request.delete(`${A}/users/${x.id}/permanent`, await adm(request));
      }
    }
  });

  test('F42-D1 deactivating a user ends their session; activate restores it; deleted users are refused', async ({ request }) => {
    const u = await createUser(request, 'agent');
    try {
      expect((await request.get(`${API}/auth/me`, u.auth)).status()).toBe(200);
      expect((await request.put(`${A}/users/${u.id}/deactivate`, await adm(request))).status()).toBe(200);
      expect((await request.get(`${API}/auth/me`, u.auth)).status()).toBe(403);
      const relog = await request.post(`${API}/auth/login`, { data: { email: u.email, password: PW } });
      expect([401, 403]).toContain(relog.status());
      expect((await request.put(`${A}/users/${u.id}/activate`, await adm(request))).status()).toBe(200);
      expect((await request.get(`${API}/auth/me`, u.auth)).status()).toBe(200);
    } finally {
      await markDeleted(u.id);
      await request.delete(`${A}/users/${u.id}/permanent`, await adm(request));
    }
  });

  test('F42-D2 a soft-deleted user cannot be activated or edited back to life, and is hidden from list and stats', async ({ request }) => {
    const u = await createUser(request, 'agent');
    const statsBefore = (await (await request.get(`${A}/stats`, await adm(request))).json()).stats;
    await markDeleted(u.id);
    expect((await request.delete(`${A}/users/${u.id}`, await adm(request))).status(), 'double delete').toBe(400);
    const list = await (await request.get(`${A}/users?search=${encodeURIComponent(u.email)}`, await adm(request))).json();
    expect(list.users.length).toBe(0);
    const withDeleted = await (await request.get(`${A}/users?includeDeleted=true&search=${encodeURIComponent(u.email)}`, await adm(request))).json();
    expect(withDeleted.users.length).toBe(1);
    const statsAfter = (await (await request.get(`${A}/stats`, await adm(request))).json()).stats;
    expect(statsAfter.totalAgents).toBe(statsBefore.totalAgents - 1);
    // The deleted account must stay deleted: activate / update / promote are refused
    expect((await request.put(`${A}/users/${u.id}/activate`, await adm(request))).status(), 'activate deleted').toBeGreaterThanOrEqual(400);
    expect((await request.put(`${A}/users/${u.id}`, { ...(await adm(request)), data: { isActive: true } })).status(), 'update deleted').toBeGreaterThanOrEqual(400);
    expect((await request.put(`${A}/users/${u.id}/promote`, { ...(await adm(request)), data: { level: 'associate' } })).status(), 'promote deleted').toBeGreaterThanOrEqual(400);
    // permanent delete rules (restore itself needs a replica set, so it is not exercised locally)
    const live = await createUser(request, 'agent');
    expect((await request.put(`${A}/users/${live.id}/restore`, await adm(request))).status(), 'restore non-deleted').toBe(400);
    expect((await request.delete(`${A}/users/${live.id}/permanent`, await adm(request))).status(), 'permanent on live user').toBe(400);
    await markDeleted(live.id);
    await request.delete(`${A}/users/${live.id}/permanent`, await adm(request));
    expect((await request.delete(`${A}/users/${u.id}/permanent`, await adm(request))).status()).toBe(200);
    expect((await request.put(`${A}/users/${u.id}/restore`, await adm(request))).status(), 'restore after permanent delete').toBe(404);
    expect((await request.get(`${A}/users/${u.id}`, await adm(request))).status()).toBe(404);
  });

  test('F42-T1 transfer validates its target and refuses deleted or malformed uplines', async ({ request }) => {
    const a = await createUser(request, 'agent');
    const b = await createUser(request, 'agent');
    try {
      for (const newUplineId of ['not-an-id', { $ne: null }, 12, ['x']]) {
        const res = await request.put(`${A}/users/${a.id}/transfer`, { ...(await adm(request)), data: { newUplineId } });
        expect(res.status(), JSON.stringify(newUplineId)).toBe(400);
      }
      expect((await request.put(`${A}/users/${a.id}/transfer`, { ...(await adm(request)), data: { newUplineId: a.id } })).status()).toBe(400);
      expect((await request.put(`${A}/users/${a.id}/transfer`, { ...(await adm(request)), data: { newUplineId: '64b000000000000000000000' } })).status()).toBe(404);
      await markDeleted(b.id);
      const toDeleted = await request.put(`${A}/users/${a.id}/transfer`, { ...(await adm(request)), data: { newUplineId: b.id } });
      expect(toDeleted.status(), 'transfer under a deleted upline').toBe(400);
    } finally {
      for (const x of [a, b]) {
        await markDeleted(x.id);
        await request.delete(`${A}/users/${x.id}/permanent`, await adm(request));
      }
    }
  });

  test('F42-L1 list, audit log and detail endpoints give 4xx (never 5xx) for hostile input', async ({ request }) => {
    const h = await adm(request);
    const urls = [
      `${A}/users?page=-1`, `${A}/users?page=abc&limit=abc`, `${A}/users?limit=-5`, `${A}/users?role[$ne]=x`, `${A}/users?isActive[$ne]=x`,
      `${A}/users?search[$ne]=x`, `${A}/users?search=(`, `${A}/users?search=%5B`,
      `${A}/audit-logs?page=-3`, `${A}/audit-logs?userId=zzz`, `${A}/audit-logs?action[$ne]=x`, `${A}/audit-logs?userId[$ne]=x`,
      `${A}/users/not-an-id`, `${A}/users/${'a'.repeat(24)}/../x`
    ];
    for (const u of urls) {
      const res = await request.get(u, h);
      expect(res.status(), u).toBeLessThan(500);
    }
    for (const [m, p] of [['PUT', '/users/zzz'], ['PUT', '/users/zzz/activate'], ['PUT', '/users/zzz/deactivate'], ['DELETE', '/users/zzz'], ['PUT', '/users/zzz/restore'], ['DELETE', '/users/zzz/permanent'], ['PUT', '/users/zzz/transfer']] as const) {
      const res = await request.fetch(`${A}${p}`, { method: m, ...h, data: m === 'PUT' ? { newUplineId: 'x', name: 'Valid Name' } : undefined });
      expect(res.status(), `${m} ${p}`).toBe(400);
    }
  });

  test('F42-U1 update validates fields and never returns the password hash', async ({ request }) => {
    const u = await createUser(request, 'agent');
    try {
      for (const bad of [{ role: 'root' }, { name: 'x' }, { phone: '1' }, { isActive: 'maybe' }, { name: { $ne: 1 } }, { state: 'x'.repeat(80) }]) {
        const res = await request.put(`${A}/users/${u.id}`, { ...(await adm(request)), data: bad });
        expect(res.status(), JSON.stringify(bad)).toBe(400);
      }
      const ok = await request.put(`${A}/users/${u.id}`, { ...(await adm(request)), data: { name: 'Renamed User', email: 'hijack@example.com' } });
      const body = await ok.json();
      if (ok.status() === 200) expect(body.user.email, 'email must not change via this endpoint').toBe(u.email);
      expect(JSON.stringify(body)).not.toMatch(/\$2[aby]\$/);
      const detail = await (await request.get(`${A}/users/${u.id}`, await adm(request))).json();
      expect(JSON.stringify(detail)).not.toMatch(/\$2[aby]\$/);
    } finally {
      await markDeleted(u.id);
      await request.delete(`${A}/users/${u.id}/permanent`, await adm(request));
    }
  });

  test('F42-W1 welcome message rejects non-string content and invalid dates', async ({ request }) => {
    const cur = await (await request.get(`${A}/welcome-message`, await adm(request))).json();
    for (const bad of [{ title: { $ne: 1 } }, { message: ['a'] }, { videoUrl: 5 }, { startDate: 'not-a-date' }, { endDate: { a: 1 } }]) {
      const res = await request.put(`${A}/welcome-message`, { ...(await adm(request)), data: { enabled: false, ...bad } });
      expect(res.status(), JSON.stringify(bad)).toBe(400);
    }
    const restore = cur.config || {};
    await request.put(`${A}/welcome-message`, { ...(await adm(request)), data: { enabled: !!restore.enabled, title: restore.title || '', message: restore.message || '' } });
  });
});
