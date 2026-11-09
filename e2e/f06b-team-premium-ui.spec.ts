import { test, expect, Page } from '@playwright/test';
import { API, as, carrierId } from './helpers/api';

const { USERS } = require('./helpers/users');

/**
 * Browser validation of the Team Premium fix (agent with personal production and NO downline).
 *
 * Seeded agent "other" (E2E Other Team) has no downline. This mirrors the live case:
 * an agent with an In Force policy whose Builder-track Team Premium showed $0.
 *
 * Rules under test (from the client):
 *  - Team Premium (Builder track) = personal premium + downline premium.
 *  - Promotion Tracker counts only Life + Supplemental premium.
 *  - Production page "Team Report" counts ALL In Force production (any category).
 *  - Level skipping / fast-track is never shown to agents.
 *
 * The spec never deletes data. It records the agent's totals BEFORE adding its own policies and
 * asserts the screen shows BEFORE + what this run added, so it is repeatable on a used database.
 */
const agent = USERS.other;
const LIFE = 758;
const ACA = 5000;
const uniq = () => `E2E-UI ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

/** Accept "$1,234" or "$1,234.00" for the same amount. */
const money = (n: number) => new RegExp('\\$' + n.toLocaleString('en-US').replace(/,/g, ',') + '(\\.00)?(?![\\d,])');

const unwrap = (body: any) => body?.data ?? body;

async function createInForce(request: any, productSold: string, premiumAmount: number) {
  const res = await request.post(`${API}/production`, {
    ...(await as(request, 'other')),
    data: {
      clientName: uniq(), productSold, carrier: await carrierId(request),
      premiumAmount, status: 'In Force'
    }
  });
  expect(res.status(), `create ${productSold}`).toBe(201);
}

async function baseline(request: any) {
  const auth = await as(request, 'other');
  const tracker = unwrap(await (await request.get(`${API}/promotion/tracker`, auth)).json());
  const team = await (await request.get(`${API}/production/team-report`, auth)).json();
  return {
    producer: tracker.producer.premium as number,
    builder: tracker.builder.premium as number,
    teamReport: team.totalPremiumInForce as number
  };
}

async function loginViaUi(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email Address').fill(agent.email);
  await page.getByLabel('Password', { exact: true }).fill(agent.password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL(/dashboard/, { timeout: 20_000 });
}

/** Announcement popups (created by other specs) overlay the page. Dismiss is client-side only. */
async function dismissAnnouncements(page: Page) {
  const dismiss = page.getByRole('button', { name: /dismiss/i });
  for (let i = 0; i < 10; i++) {
    if (!(await dismiss.first().isVisible().catch(() => false))) break;
    await dismiss.first().click();
    await page.waitForTimeout(250);
  }
}

test.describe('F06b Team Premium — browser', () => {
  let before: { producer: number; builder: number; teamReport: number };

  test.beforeAll(async ({ request }) => {
    before = await baseline(request);
    // $758 Life (qualifies for promotion) + $5,000 ACA (production-page only)
    await createInForce(request, 'Term Life Insurance', LIFE);
    await createInForce(request, 'ACA Marketplace Health Insurance', ACA);
  });

  test('F06b-1 dashboard Builder track Team Premium includes the agent\'s own premium (not $0)', async ({ page, request }) => {
    const after = await baseline(request);
    // API-level truth: personal Life premium rose by 758 and so did Team Premium; ACA counted in neither
    expect(after.producer).toBe(before.producer + LIFE);
    expect(after.builder).toBe(before.builder + LIFE);

    await loginViaUi(page);
    await dismissAnnouncements(page);
    const tracker = page.locator('app-promotion-tracker');
    await expect(tracker).toContainText('Producer Track');

    const producerPremium = tracker.locator('.track-row', { hasText: 'In Force Premium' }).first();
    const teamPremium = tracker.locator('.track-row', { hasText: 'Team Premium' }).first();

    await expect(producerPremium).toContainText(money(after.producer));
    await expect(teamPremium).toContainText(money(after.builder));
    expect(after.builder).toBeGreaterThanOrEqual(LIFE); // never $0 when the agent has personal premium
    // ACA ($5,000) must NOT have been added to either track
    expect(after.builder - before.builder).toBe(LIFE);

    await tracker.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/f06b-dashboard-team-premium.png', fullPage: true });
  });

  test('F06b-2 agents never see level skipping, even when the API reports fast-track eligibility', async ({ page }) => {
    await page.route('**/api/promotion/tracker*', async (route) => {
      const res = await route.fetch();
      const body = await res.json();
      const data = body.data ?? body;
      data.fastTrack = {
        eligible: true, track: 'producer',
        skipToLevel: { name: 'advisor', rank: 3, commissionPercent: 80 },
        skipMultiplier: 1.4, skipLegCapPercent: 50
      };
      data.skipInfo = { canSkip: true, skipMultiplier: 1.4, skipLegCapPercent: 50 };
      await route.fulfill({ response: res, json: body.data ? { ...body, data } : data });
    });

    await loginViaUi(page);
    await dismissAnnouncements(page);
    const tracker = page.locator('app-promotion-tracker');
    await expect(tracker).toContainText('Producer Track');
    await expect(tracker).not.toContainText(/fast-?track/i);
    await expect(tracker).not.toContainText(/skip one/i);
    await expect(page.locator('body')).not.toContainText(/fast-?track eligible/i);
  });

  test('F06b-3 Production page Team Report shows all production incl. own premium (and ACA)', async ({ page, request }) => {
    const after = await baseline(request);
    // All production: Life + ACA both counted, own premium included, no downline needed
    expect(after.teamReport).toBe(before.teamReport + LIFE + ACA);

    await loginViaUi(page);
    await dismissAnnouncements(page);
    await page.goto('/production');
    await dismissAnnouncements(page);
    await page.getByRole('button', { name: /team report/i }).click();

    const panel = page.locator('div.card', { hasText: 'Team Premium In Force' }).first();
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(money(after.teamReport));
    await expect(panel).toContainText(/Active Agents/);

    await page.screenshot({ path: 'test-results/f06b-production-team-report.png', fullPage: true });
  });
});
