/**
 * Checklist Ordering E2E Validation
 * Verifies: "Complete W-9" comes BEFORE "Request Carrier Appointments"
 * 
 * Run: npx playwright test tests/checklist-order-e2e.spec.js --config=playwright.config.js
 */
const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://localhost:5000';
const API_URL = 'http://localhost:5000/api';
const AGENT_EMAIL = 'lotushotmail111@gmail.com';
const AGENT_PASS = '123456';

async function loginAndGo(page, email, password, targetPath) {
  const response = await page.request.post(`${API_URL}/auth/login`, {
    data: { email, password }
  });
  const data = await response.json();
  if (!data.token) throw new Error(`Login failed for ${email}: ${JSON.stringify(data)}`);

  await page.goto(BASE_URL, { waitUntil: 'commit' });
  await page.evaluate((authData) => {
    localStorage.setItem('token', authData.token);
    localStorage.setItem('user', JSON.stringify(authData.user));
  }, data);

  await page.goto(`${BASE_URL}/${targetPath}`, { waitUntil: 'networkidle' });
}

test.describe('Onboarding Checklist Order Validation', () => {

  test('API: W-9 step comes before Carrier Appointments', async ({ request }) => {
    // Login to get token
    const loginRes = await request.post(`${API_URL}/auth/login`, {
      data: { email: AGENT_EMAIL, password: AGENT_PASS }
    });
    const { token } = await loginRes.json();
    expect(token).toBeTruthy();

    // Fetch checklist
    const checklistRes = await request.get(`${API_URL}/agent/dashboard/checklist`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(checklistRes.ok()).toBe(true);

    const { checklist } = await checklistRes.json();
    expect(checklist).toBeTruthy();
    expect(checklist.length).toBeGreaterThanOrEqual(4);

    // Verify ordering
    const labels = checklist.map(item => item.label);
    console.log('Checklist order:', labels);

    const w9Index = labels.findIndex(l => l.includes('W-9'));
    const carrierIndex = labels.findIndex(l => l.includes('Carrier Appointments'));

    expect(w9Index).toBeGreaterThanOrEqual(0);
    expect(carrierIndex).toBeGreaterThanOrEqual(0);
    expect(w9Index).toBeLessThan(carrierIndex);

    // Verify exact expected order
    expect(labels[0]).toContain('W-9');
    expect(labels[1]).toContain('E&O Insurance');
    expect(labels[2]).toContain('CMS Certificate');
    expect(labels[3]).toContain('Carrier Appointments');
    expect(labels[4]).toContain('onboarding docs');
  });

  test.skip('Browser: Dashboard checklist renders in correct order', async ({ page }) => {
    await loginAndGo(page, AGENT_EMAIL, AGENT_PASS, 'dashboard');

    // Wait for checklist component to load
    const checklistSection = page.locator('app-next-steps-checklist');
    await expect(checklistSection).toBeVisible({ timeout: 15000 });

    // Get all checklist item labels
    const items = checklistSection.locator('.list-group-item, .checklist-item, li');
    await expect(items.first()).toBeVisible({ timeout: 10000 });

    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(4);

    // Read text content of all items
    const texts = [];
    for (let i = 0; i < count; i++) {
      texts.push(await items.nth(i).textContent());
    }
    console.log('UI checklist items:', texts);

    // Verify W-9 appears before Carrier Appointments in the DOM
    const w9Idx = texts.findIndex(t => t.includes('W-9'));
    const carrierIdx = texts.findIndex(t => t.includes('Carrier Appointments'));

    expect(w9Idx).toBeGreaterThanOrEqual(0);
    expect(carrierIdx).toBeGreaterThanOrEqual(0);
    expect(w9Idx).toBeLessThan(carrierIdx);
  });
});
