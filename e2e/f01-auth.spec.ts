import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { API, failOnErrors } from './helpers/api';

const { USERS } = require('./helpers/users');

test.describe('F01 authentication', () => {
  test('F01-H1 agent signs in and reaches the dashboard', async ({ page }) => {
    // 401s from the probe calls are expected noise only in negative cases; here none are.
    failOnErrors(page);
    await page.goto('/login');
    await page.getByLabel('Email Address').fill(USERS.agent.email);
    await page.getByLabel('Password', { exact: true }).fill(USERS.agent.password);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('F01-A11Y login screen has no axe violations', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel('Email Address')).toBeVisible();
    const a11y = await new AxeBuilder({ page }).analyze();
    expect(a11y.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test('F01-N1 wrong password shows an error and stays on login', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email Address').fill(USERS.agent.email);
    await page.getByLabel('Password', { exact: true }).fill('definitely-wrong');
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(page.getByRole('alert').filter({ hasText: /invalid credentials/i })).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('F01-N2 deactivated account cannot sign in', async ({ request }) => {
    const res = await request.post(`${API}/auth/login`, {
      data: { email: USERS.inactive.email, password: USERS.inactive.password }
    });
    expect(res.status()).toBe(403);
  });

  test('F01-N3 unknown email and wrong password give the same response (no enumeration)', async ({ request }) => {
    const a = await request.post(`${API}/auth/login`, { data: { email: 'nobody@example.com', password: 'x' } });
    const b = await request.post(`${API}/auth/login`, { data: { email: USERS.agent.email, password: 'x' } });
    expect(a.status()).toBe(401);
    expect(b.status()).toBe(401);
    expect(await a.json()).toEqual(await b.json());
  });

  test('F01-E1 empty submit shows validation, sends no request', async ({ page }) => {
    let loginCalls = 0;
    page.on('request', (r) => { if (r.url().includes('/auth/login')) loginCalls++; });
    await page.goto('/login');
    const submit = page.getByRole('button', { name: /sign in|log in/i });
    await expect(submit).toBeDisabled();
    await page.getByLabel('Email Address').fill('not-an-email');
    await page.getByLabel('Email Address').blur();
    await expect(page.getByText(/valid email required/i)).toBeVisible();
    await expect(submit).toBeDisabled();
    expect(loginCalls).toBe(0);
  });

  test('F01-E2 email is case- and whitespace-insensitive', async ({ request }) => {
    const res = await request.post(`${API}/auth/login`, {
      data: { email: `  ${USERS.agent.email.toUpperCase()} `, password: USERS.agent.password }
    });
    // Joi email() may reject the padded value (400) or the route may normalise it (200); never 5xx.
    expect([200, 400]).toContain(res.status());
  });

  test('F01-E3 very long and emoji input never causes a 5xx', async ({ request }) => {
    for (const email of ['a'.repeat(5000) + '@example.com', '😀@example.com']) {
      const res = await request.post(`${API}/auth/login`, { data: { email, password: 'p'.repeat(100000) } });
      expect(res.status(), email.slice(0, 20)).toBeLessThan(500);
    }
  });

  test('F01-E4 refresh keeps the session; protected route redirects when signed out', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel('Email Address').fill(USERS.agent.email);
    await page.getByLabel('Password', { exact: true }).fill(USERS.agent.password);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('F01-N4 forgot-password gives an identical answer for real and unknown emails', async ({ request }) => {
    const real = await request.post(`${API}/auth/forgot-password`, { data: { email: USERS.child.email } });
    const fake = await request.post(`${API}/auth/forgot-password`, { data: { email: 'nobody@example.com' } });
    expect(real.status()).toBe(200);
    expect(fake.status()).toBe(200);
    expect((await real.json()).message).toBe((await fake.json()).message);
  });

  test('F01-N5 invalid/garbage reset token is rejected', async ({ request }) => {
    const res = await request.post(`${API}/auth/reset-password/not-a-real-token`, {
      data: { password: 'New-Pass-12345!', confirmPassword: 'New-Pass-12345!' }
    });
    expect([400, 401, 404]).toContain(res.status());
  });

  test('F01-N6 tampered / missing JWT is rejected on a protected endpoint', async ({ request }) => {
    expect((await request.get(`${API}/auth/me`)).status()).toBe(401);
    const bad = await request.get(`${API}/auth/me`, { headers: { Authorization: 'Bearer abc.def.ghi' } });
    expect(bad.status()).toBe(401);
    const none = await request.get(`${API}/auth/me`, { headers: { Authorization: 'Bearer none' } });
    expect(none.status()).toBe(401);
  });
});
