import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { API, as, failOnErrors } from './helpers/api';

const { USERS } = require('./helpers/users');

const flatten = (nodes: any[]): any[] => nodes.flatMap((n) => [n, ...flatten(n.children || [])]);
const emails = (list: any[]) => list.map((n) => n.email);

test.describe('F05 team hierarchy', () => {
  test('F05-H1 agent sees their own downline and stats', async ({ request }) => {
    const auth = await as(request, 'agent');
    const recruits = await (await request.get(`${API}/agent/recruits`, auth)).json();
    expect(emails(recruits.recruits)).toContain(USERS.child.email);
    const stats = (await (await request.get(`${API}/agent/stats`, auth)).json()).stats;
    expect(stats.directRecruits).toBeGreaterThanOrEqual(1);
    expect(stats.totalDownline).toBeGreaterThanOrEqual(stats.directRecruits);
  });

  test('F05-I1 agent never sees another team in my-team, downline or recruits', async ({ request }) => {
    const auth = await as(request, 'agent');
    const team = await (await request.get(`${API}/agent/my-team`, auth)).json();
    const down = await (await request.get(`${API}/agent/downline`, auth)).json();
    const rec = await (await request.get(`${API}/agent/recruits`, auth)).json();
    const seen = [
      ...emails(flatten(team.tree || [])),
      ...emails(flatten([down.downline])),
      ...emails(rec.recruits)
    ];
    expect(seen).not.toContain(USERS.other.email);
    expect(seen).not.toContain(USERS.admin.email);
    expect(JSON.stringify([team, down, rec])).not.toMatch(/\$2[aby]\$\d{2}\$/);
  });

  test('F05-I2 downline agent sees no one above or beside them', async ({ request }) => {
    const auth = await as(request, 'child');
    const team = await (await request.get(`${API}/agent/my-team`, auth)).json();
    const seen = emails(flatten(team.tree || []));
    for (const k of ['admin', 'agent', 'other']) expect(seen).not.toContain(USERS[k].email);
  });

  test('F05-H2 admin hierarchy contains the whole tree', async ({ request }) => {
    const h = await (await request.get(`${API}/admin/hierarchy`, await as(request, 'admin'))).json();
    const seen = emails(flatten(h.hierarchy));
    for (const k of ['admin', 'agent', 'child', 'other']) expect(seen).toContain(USERS[k].email);
  });

  test('F05-N1 hierarchy survives a referral cycle without hanging or 5xx', async ({ request }) => {
    // Admin tries to transfer the top agent under their own downline: must be refused, not loop.
    const admin = await as(request, 'admin');
    const list = await (await request.get(`${API}/admin/users`, admin)).json();
    const users: any[] = Array.isArray(list) ? list : list.users;
    const id = (e: string) => users.find((u) => u.email === e)._id;
    const res = await request.put(`${API}/admin/users/${id(USERS.agent.email)}/transfer`, {
      ...admin,
      data: { newUplineId: id(USERS.child.email), newReferrerId: id(USERS.child.email), newParentId: id(USERS.child.email) }
    });
    expect(res.status()).toBeLessThan(500);
    expect([400, 403, 404, 409, 422]).toContain(res.status());
    const team = await request.get(`${API}/agent/my-team`, await as(request, 'agent'));
    expect(team.status()).toBe(200);
  });

  test('F05-UI1 My Team and Dashboard render for an agent without console errors or 5xx', async ({ page }) => {
    failOnErrors(page);
    await page.goto('/login');
    await page.getByLabel('Email Address').fill(USERS.agent.email);
    await page.getByLabel('Password', { exact: true }).fill(USERS.agent.password);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto('/my-team');
    await expect(page.getByText(USERS.child.name).first()).toBeVisible();
    await expect(page.getByText(USERS.other.name)).toHaveCount(0);
  });

  // BUG-006: the authenticated app shell has no <main>/<h1>, an unlabeled <select>, skipped
  // heading levels and low-contrast text. test.fail() flips to a failure once it is fixed.
  test('F05-A11Y1 My Team has no axe violations', async ({ page }) => {
    test.fail(true, 'BUG-006 open: app shell accessibility');
    await page.goto('/login');
    await page.getByLabel('Email Address').fill(USERS.agent.email);
    await page.getByLabel('Password', { exact: true }).fill(USERS.agent.password);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto('/my-team');
    await expect(page.getByText(USERS.child.name).first()).toBeVisible();
    const a11y = await new AxeBuilder({ page }).analyze();
    expect(a11y.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
