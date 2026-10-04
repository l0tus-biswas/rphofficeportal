/**
 * Free Access / billing — live E2E (real browser + real Stripe TEST mode + dev DB).
 *
 * Proves that an agent given Free Access is NOT charged automatically:
 *   A. Admin UI: "Grant Free Access" schedules cancellation of the agent's Stripe subscription.
 *   B. Admin UI: same, when our DB never stored the subscription id (the prod/Carlos gap).
 *   C. Stripe still tries to bill an exempt agent (flag set, sub left active):
 *        C1. signed `invoice.created`  -> draft invoice deleted in Stripe + subscription canceled
 *        C2. signed `invoice.paid`     -> charge refunded in Stripe + subscription canceled, no Payment row
 *   D. Control: a normal (non-exempt) agent's renewal is recorded and NOT refunded/canceled.
 *   E. Exempt agent logs in and gets full access (no payment wall), billing-portal/cancel are blocked.
 *   F. Removing Free Access works and leaves the agent un-exempt.
 *
 * Webhook deliveries are signed locally with the server's STRIPE_WEBHOOK_SECRET (Stripe cannot reach
 * localhost); the invoices/charges/refunds they reference are REAL Stripe test-mode objects.
 *
 * Run (server must be started with the same STRIPE_WEBHOOK_SECRET):
 *   STRIPE_WEBHOOK_SECRET=whsec_localvalidation123 node server.js
 *   STRIPE_WEBHOOK_SECRET=whsec_localvalidation123 npx playwright test --config=playwright.free-access.config.js
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

// UI is the Angular dev server (talks to the local API via environment.ts).
// NEVER use frontend/dist here: it is a production build pointing at rhpoffice.com/api.
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:4200';
const API_URL = process.env.E2E_API_URL || 'http://localhost:5000/api';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@rhpoffice.com';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS || 'admin123';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_localvalidation123';
const AGENT_PASS = 'E2e-Test-Pass-123!';
const RUN = Date.now();

// Hard safety rails: never run against live Stripe or the prod database.
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';
const MONGO_URI = process.env.MONGODB_URI || '';
if (!STRIPE_KEY.startsWith('sk_test_')) throw new Error('Refusing to run: STRIPE_SECRET_KEY is not a TEST key');
if (/prod/i.test(MONGO_URI)) throw new Error('Refusing to run: MONGODB_URI looks like production');

const stripe = require('stripe')(STRIPE_KEY);
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const Payment = require('../models/Payment');

const created = { users: [], customers: [] };

async function makeAgent({ label, exempt = false, linkSubscription = true }) {
  const email = `e2e-free-${label}-${RUN}@example.com`;
  const customer = await stripe.customers.create({ email, name: `E2E ${label} ${RUN}` });
  created.customers.push(customer.id);
  const pm = await stripe.paymentMethods.attach('pm_card_visa', { customer: customer.id });
  await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: pm.id } });
  const sub = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: process.env.STRIPE_MONTHLY_PRICE_ID }],
    default_payment_method: pm.id
  });

  const user = await User.create({
    name: `E2E ${label} ${RUN}`,
    email,
    password: AGENT_PASS,
    phone: '5555550100',
    role: 'agent',
    isActive: true,
    stripeCustomerId: customer.id,
    ...(linkSubscription ? { stripeSubscriptionId: sub.id } : {}),
    subscriptionStatus: 'active',
    oneTimePaymentCompleted: true,
    paymentAccessEnabled: true,
    ...(exempt ? { billingExempt: true, billingExemptReason: 'E2E test' } : {})
  });
  created.users.push(user._id);
  await Subscription.create({
    user: user._id,
    stripeSubscriptionId: sub.id,
    stripeCustomerId: customer.id,
    stripePriceId: process.env.STRIPE_MONTHLY_PRICE_ID,
    status: 'active',
    amount: 2000,
    currency: 'usd',
    interval: 'month'
  });
  return { user, customer, sub, email };
}

/** Deliver a Stripe-signed webhook to the local server. */
async function sendWebhook(request, type, object) {
  const payload = JSON.stringify({
    id: `evt_e2e_${Date.now()}`,
    object: 'event',
    api_version: '2025-11-17.clover',
    type,
    data: { object }
  });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  return request.post(`${API_URL}/payments/webhook`, {
    headers: { 'stripe-signature': signature, 'content-type': 'application/json' },
    data: payload
  });
}

/** A real Stripe invoice, shaped like a clover-API subscription renewal for `subId`. */
function asRenewal(invoice, subId) {
  return { ...invoice, parent: { type: 'subscription_details', subscription_details: { subscription: subId } } };
}

async function newDraftInvoice(customerId, amount = 2000) {
  await stripe.invoiceItems.create({ customer: customerId, amount, currency: 'usd', description: 'E2E renewal' });
  return stripe.invoices.create({ customer: customerId, auto_advance: false, pending_invoice_items_behavior: 'include' });
}

async function newPaidInvoice(customerId) {
  const draft = await newDraftInvoice(customerId);
  const finalized = await stripe.invoices.finalizeInvoice(draft.id);
  return stripe.invoices.pay(finalized.id);
}

/** Safety rail: a test page must never be able to reach the production site/API. */
async function blockProd(page) {
  await page.route(/^https?:\/\/(www\.)?rhpoffice\.com\//, (route) => route.abort());
}

async function injectLogin(page, email, password) {
  await blockProd(page);
  const res = await page.request.post(`${API_URL}/auth/login`, { data: { email, password } });
  const data = await res.json();
  if (!data.token) throw new Error(`Login failed for ${email}: ${JSON.stringify(data)}`);
  await page.goto(BASE_URL, { waitUntil: 'commit' });
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  }, { token: data.token, user: data.user });
  return data.token;
}

async function dismissOverlays(page) {
  const dismiss = page.locator('button:has-text("Dismiss")');
  if (await dismiss.isVisible({ timeout: 1500 }).catch(() => false)) await dismiss.click();
}

/** Admin UI: search for the agent and click the gift (Grant/Remove Free Access) button. */
async function toggleFreeAccessInUi(page, agent, { reason } = {}) {
  await injectLogin(page, ADMIN_EMAIL, ADMIN_PASS);
  await page.goto(`${BASE_URL}/admin/users`, { waitUntil: 'networkidle' });
  await dismissOverlays(page);
  await page.getByPlaceholder('Search by name, email, or code').fill(agent.email);
  const row = page.locator('tr', { hasText: agent.email });
  await expect(row).toBeVisible({ timeout: 15000 });

  page.on('dialog', (d) => (d.type() === 'prompt' ? d.accept(reason || 'E2E free access') : d.accept()));
  const call = page.waitForResponse((r) => r.url().includes('/billing-exempt') && r.request().method() === 'PUT');
  await row.locator('button .bi-gift').click();
  const response = await call;
  expect(response.status()).toBe(200);
  return response.json();
}

test.describe.serial('Free Access — agents are never auto-charged', () => {
  test.setTimeout(120000);

  test.beforeAll(async () => {
    await mongoose.connect(MONGO_URI);
  });

  test.afterAll(async () => {
    // Clean up everything this run created in the dev DB + Stripe test mode.
    try {
      await Payment.deleteMany({ user: { $in: created.users } });
      await Subscription.deleteMany({ user: { $in: created.users } });
      await User.deleteMany({ _id: { $in: created.users } });
      for (const id of created.customers) await stripe.customers.del(id).catch(() => {});
    } finally {
      await mongoose.disconnect();
    }
  });

  test('A. admin UI "Grant Free Access" schedules the Stripe subscription to cancel', async ({ page }) => {
    const a = await makeAgent({ label: 'ui' });
    expect((await stripe.subscriptions.retrieve(a.sub.id)).cancel_at_period_end).toBe(false);

    const body = await toggleFreeAccessInUi(page, a);
    expect(body.warning).toBeUndefined();

    // UI shows the badge
    await expect(page.locator('tr', { hasText: a.email }).getByText('Free Access')).toBeVisible({ timeout: 15000 });

    // Stripe (source of truth) will not bill again
    const live = await stripe.subscriptions.retrieve(a.sub.id);
    expect(live.cancel_at_period_end).toBe(true);

    // Local records agree
    const u = await User.findById(a.user._id);
    expect(u.billingExempt).toBe(true);
    expect(u.paymentAccessEnabled).toBe(true);
    expect((await Subscription.findOne({ stripeSubscriptionId: a.sub.id })).cancelAtPeriodEnd).toBe(true);
  });

  test('B. Free Access also stops a Stripe subscription our DB never stored (the Carlos gap)', async ({ page }) => {
    const a = await makeAgent({ label: 'orphan', linkSubscription: false });
    expect((await User.findById(a.user._id)).stripeSubscriptionId).toBeFalsy();

    const body = await toggleFreeAccessInUi(page, a);
    expect(body.warning).toBeUndefined();

    expect((await stripe.subscriptions.retrieve(a.sub.id)).cancel_at_period_end).toBe(true);
  });

  test('C1. renewal invoice for an exempt agent is deleted before it can charge, and the subscription is canceled', async ({ request }) => {
    // Exact prod state: exempt flag on, Stripe subscription still active/uncancelled.
    const a = await makeAgent({ label: 'c1', exempt: true });
    const draft = await newDraftInvoice(a.customer.id);
    expect(draft.status).toBe('draft');

    const res = await sendWebhook(request, 'invoice.created', asRenewal(draft, a.sub.id));
    expect(res.status()).toBe(200);

    await expect.poll(async () => (await stripe.subscriptions.retrieve(a.sub.id)).status).toBe('canceled');
    // Draft invoice no longer exists in Stripe -> it can never be collected
    await expect(stripe.invoices.retrieve(draft.id)).rejects.toMatchObject({ code: 'resource_missing' });
    // Exempt agent keeps their access
    expect((await User.findById(a.user._id)).paymentAccessEnabled).toBe(true);
  });

  test('C2. if an exempt agent is charged anyway, it is refunded in Stripe, the sub is canceled, nothing is recorded as a payment', async ({ request }) => {
    const a = await makeAgent({ label: 'c2', exempt: true });
    const paid = await newPaidInvoice(a.customer.id);
    expect(paid.status).toBe('paid');
    expect(paid.amount_paid).toBe(2000);

    const res = await sendWebhook(request, 'invoice.paid', asRenewal(paid, a.sub.id));
    expect(res.status()).toBe(200);

    await expect.poll(async () => (await stripe.subscriptions.retrieve(a.sub.id)).status).toBe('canceled');

    const payments = await stripe.invoicePayments.list({ invoice: paid.id });
    const pi = payments.data[0].payment.payment_intent;
    const refunds = await stripe.refunds.list({ payment_intent: pi });
    expect(refunds.data).toHaveLength(1);
    expect(refunds.data[0].amount).toBe(2000);

    expect(await Payment.countDocuments({ user: a.user._id, stripeInvoiceId: paid.id })).toBe(0);
    expect((await User.findById(a.user._id)).paymentAccessEnabled).toBe(true);
  });

  test('C3. a re-delivered invoice.paid does not double-refund or error', async ({ request }) => {
    const a = await makeAgent({ label: 'c3', exempt: true });
    const paid = await newPaidInvoice(a.customer.id);

    expect((await sendWebhook(request, 'invoice.paid', asRenewal(paid, a.sub.id))).status()).toBe(200);
    expect((await sendWebhook(request, 'invoice.paid', asRenewal(paid, a.sub.id))).status()).toBe(200);

    const pi = (await stripe.invoicePayments.list({ invoice: paid.id })).data[0].payment.payment_intent;
    expect((await stripe.refunds.list({ payment_intent: pi })).data).toHaveLength(1);
  });

  test('D. control: a normal (non-exempt) agent renewal is recorded, not refunded, and the subscription stays active', async ({ request }) => {
    const a = await makeAgent({ label: 'normal' });
    const paid = await newPaidInvoice(a.customer.id);

    const res = await sendWebhook(request, 'invoice.paid', asRenewal(paid, a.sub.id));
    expect(res.status()).toBe(200);

    await expect.poll(() => Payment.countDocuments({ user: a.user._id, stripeInvoiceId: paid.id })).toBe(1);
    const pi = (await stripe.invoicePayments.list({ invoice: paid.id })).data[0].payment.payment_intent;
    expect((await stripe.refunds.list({ payment_intent: pi })).data).toHaveLength(0);
    expect((await stripe.subscriptions.retrieve(a.sub.id)).status).toBe('active');

    // invoice.created for a normal agent must be left alone
    const draft = await newDraftInvoice(a.customer.id);
    await sendWebhook(request, 'invoice.created', asRenewal(draft, a.sub.id));
    expect((await stripe.invoices.retrieve(draft.id)).status).toBe('draft');
    expect((await stripe.subscriptions.retrieve(a.sub.id)).status).toBe('active');
  });

  test('E. exempt agent signs in through the browser with full access and no payment wall', async ({ page }) => {
    const a = await makeAgent({ label: 'login', exempt: true });
    await blockProd(page);

    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.locator('input[type="email"], input[formcontrolname="email"], input[name="email"]').first().fill(a.email);
    await page.locator('input[type="password"]').first().fill(AGENT_PASS);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20000 });
    await dismissOverlays(page);

    expect(page.url()).not.toMatch(/payment|subscribe|apa-payment/);

    const token = await page.evaluate(() => localStorage.getItem('token'));
    const status = await (await page.request.get(`${API_URL}/payments/status`, { headers: { Authorization: `Bearer ${token}` } })).json();
    expect(status.billingExempt).toBe(true);
    expect(status.paymentAccessEnabled).toBe(true);
    expect(status.subscriptionStatus).toBe('exempt');

    // Exempt agents cannot be pushed into paying
    const intent = await page.request.post(`${API_URL}/payments/one-time-intent`, { headers: { Authorization: `Bearer ${token}` } });
    expect(intent.status()).toBe(400);
    const portal = await page.request.post(`${API_URL}/payments/billing-portal`, { headers: { Authorization: `Bearer ${token}` } });
    expect(portal.status()).toBe(400);

    await page.goto(`${BASE_URL}/transactions`, { waitUntil: 'networkidle' });
    expect(page.url()).toContain('/transactions');
  });

  test('F. admin UI can remove Free Access again', async ({ page }) => {
    const a = await makeAgent({ label: 'remove', exempt: true });
    await Subscription.updateOne({ stripeSubscriptionId: a.sub.id }, { cancelAtPeriodEnd: true });
    await stripe.subscriptions.update(a.sub.id, { cancel_at_period_end: true });

    const body = await toggleFreeAccessInUi(page, a);
    expect(body.user.billingExempt).toBe(false);
    expect((await User.findById(a.user._id)).billingExempt).toBe(false);
    // Paused (not yet ended) subscription resumes on its existing schedule
    expect((await stripe.subscriptions.retrieve(a.sub.id)).cancel_at_period_end).toBe(false);
  });
});
