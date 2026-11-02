import { test, expect } from '@playwright/test';
import { API, as } from './helpers/api';

// An agent must never reach admin-only endpoints, and unauthenticated callers reach nothing private.
const ADMIN_ONLY: Array<[string, string]> = [
  ['GET', '/admin/users'],
  ['GET', '/admin/hierarchy'],
  ['GET', '/admin/stats'],
  ['GET', '/admin/audit-logs'],
  ['GET', '/admin/payments'],
  ['GET', '/admin/subscriptions'],
  ['GET', '/admin/payment-settings'],
  ['GET', '/admin/billing-resumes'],
  ['GET', '/production/income-paid'],
  ['GET', '/promotion/admin/levels'],
  ['GET', '/commission-statements/agents/search?q=a']
];

test.describe('F02 access control', () => {
  for (const [method, path] of ADMIN_ONLY) {
    test(`F02-N1 agent is denied ${method} ${path}`, async ({ request }) => {
      const res = await request.fetch(`${API}${path}`, { method, ...(await as(request, 'agent')) });
      expect(res.status()).toBe(403);
    });

    test(`F02-N2 anonymous is denied ${method} ${path}`, async ({ request }) => {
      const res = await request.fetch(`${API}${path}`, { method });
      expect(res.status()).toBe(401);
    });
  }

  test('F02-N3 agent cannot promote, deactivate, delete or impersonate another user', async ({ request }) => {
    const admin = await as(request, 'admin');
    const users = await (await request.get(`${API}/admin/users`, admin)).json();
    const list = Array.isArray(users) ? users : users.users;
    const victim = list.find((u: any) => u.email === 'e2e-other@example.com');
    expect(victim).toBeTruthy();
    const agent = await as(request, 'agent');
    for (const [method, path] of [
      ['PUT', `/admin/users/${victim._id}/promote`],
      ['PUT', `/admin/users/${victim._id}/deactivate`],
      ['DELETE', `/admin/users/${victim._id}`],
      ['POST', `/admin/users/${victim._id}/impersonate`],
      ['PUT', `/admin/users/${victim._id}/transfer`]
    ]) {
      const res = await request.fetch(`${API}${path}`, { method, ...agent });
      expect(res.status(), `${method} ${path}`).toBe(403);
    }
    // The victim must be untouched.
    const after = await (await request.get(`${API}/admin/users/${victim._id}`, admin)).json();
    const u = after.user || after;
    expect(u.isActive).toBe(true);
    expect(u.deletedAt ?? null).toBeNull();
  });

  test('F02-N4 agent cannot self-escalate to admin via profile update', async ({ request }) => {
    const agent = await as(request, 'agent');
    await request.put(`${API}/auth/profile`, { ...agent, data: { name: 'Lotus Test', role: 'admin', level: 'executive' } });
    const me = await (await request.get(`${API}/auth/me`, agent)).json();
    expect((me.user || me).role).toBe('agent');
  });

  test('F02-N5 password hash is never returned from the API', async ({ request }) => {
    const me = await (await request.get(`${API}/auth/me`, await as(request, 'agent'))).json();
    expect(JSON.stringify(me)).not.toMatch(/\$2[aby]\$\d{2}\$/);
    const list = await (await request.get(`${API}/admin/users`, await as(request, 'admin'))).text();
    expect(list).not.toMatch(/\$2[aby]\$\d{2}\$/);
  });
});
