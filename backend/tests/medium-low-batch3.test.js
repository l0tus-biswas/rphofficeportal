/**
 * Unit tests for batch 3 fixes (#27, #28, #32, #33, #53, #63, #65)
 * Tests: webhook signature, maintenance cache, Stripe cancel handling,
 *        payment normalization removal, CORS multi-origin, login redirect, unique index
 */
process.env.NODE_ENV = 'test';

const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────
// Fix #32: Stripe webhook signature verification
// ─────────────────────────────────────────────────────────
describe('Fix #32: Stripe webhook signature verification', () => {
  const paymentCode = fs.readFileSync(
    path.join(__dirname, '../routes/payment.routes.js'), 'utf8'
  );

  it('checks for stripe-signature header', () => {
    expect(paymentCode).toContain("req.headers['stripe-signature']");
  });

  it('rejects missing signature with 400', () => {
    expect(paymentCode).toContain('Missing stripe-signature header');
  });

  it('checks STRIPE_WEBHOOK_SECRET is configured', () => {
    expect(paymentCode).toContain('STRIPE_WEBHOOK_SECRET');
    expect(paymentCode).toContain('Webhook secret not configured');
  });

  it('uses constructWebhookEvent for verification', () => {
    expect(paymentCode).toContain('constructWebhookEvent(req.body, sig)');
  });

  it('uses express.raw for webhook body', () => {
    expect(paymentCode).toContain("express.raw({ type: 'application/json' })");
  });
});

// ─────────────────────────────────────────────────────────
// Fix #28: SystemConfig maintenance mode cache
// ─────────────────────────────────────────────────────────
describe('Fix #28: Maintenance mode cache', () => {
  const authCode = fs.readFileSync(
    path.join(__dirname, '../middleware/auth.middleware.js'), 'utf8'
  );

  it('has cache TTL defined (30 seconds)', () => {
    expect(authCode).toContain('CACHE_TTL_MS');
    expect(authCode).toContain('30 * 1000');
  });

  it('uses getMaintenanceState function', () => {
    expect(authCode).toContain('getMaintenanceState');
  });

  it('checks cache freshness before DB query', () => {
    expect(authCode).toContain('now - maintenanceCache.lastFetched < CACHE_TTL_MS');
  });

  it('does not query SystemConfig inline in protect middleware', () => {
    // The old pattern was: SystemConfig.findOne({ key: 'site_access_enabled' }) inline
    const protectFnStart = authCode.indexOf('exports.protect');
    const protectFnBody = authCode.slice(protectFnStart);
    expect(protectFnBody).not.toContain("SystemConfig.findOne({ key: 'site_access_enabled' })");
  });

  it('handles DB errors gracefully (does not block users)', () => {
    expect(authCode).toContain('Maintenance state fetch error');
  });
});

// ─────────────────────────────────────────────────────────
// Fix #33: Stripe cancel failure handling
// ─────────────────────────────────────────────────────────
describe('Fix #33: Stripe cancel failure during deactivation', () => {
  const adminCode = fs.readFileSync(
    path.join(__dirname, '../routes/admin.routes.js'), 'utf8'
  );

  it('marks subscription as cancel_pending on failure', () => {
    expect(adminCode).toContain("subscription.status = 'cancel_pending'");
  });

  it('stores cancel error message', () => {
    expect(adminCode).toContain('subscription.cancelError = stripeError.message');
  });

  it('stores cancel attempt timestamp', () => {
    expect(adminCode).toContain('subscription.cancelAttemptedAt = new Date()');
  });

  it('includes warning in response when cancel fails', () => {
    expect(adminCode).toContain('subscriptionCancelWarning');
    expect(adminCode).toContain('Subscription cancellation failed');
  });
});

// ─────────────────────────────────────────────────────────
// Fix #27: Payment amount normalization removed
// ─────────────────────────────────────────────────────────
describe('Fix #27: Payment amount normalization removed', () => {
  const userRoutesCode = fs.readFileSync(
    path.join(__dirname, '../routes/user.routes.js'), 'utf8'
  );

  it('does not contain the fragile modulo normalization', () => {
    expect(userRoutesCode).not.toContain('amount % 100');
    expect(userRoutesCode).not.toContain('amount * 100');
  });

  it('returns payments directly without transformation', () => {
    // Should not map/transform payment amounts
    expect(userRoutesCode).not.toContain('rawPayments.map');
  });
});

// ─────────────────────────────────────────────────────────
// Fix #63: CORS multi-origin support
// ─────────────────────────────────────────────────────────
describe('Fix #63: CORS multi-origin support', () => {
  const serverCode = fs.readFileSync(
    path.join(__dirname, '../server.js'), 'utf8'
  );

  it('uses a function for origin validation', () => {
    expect(serverCode).toContain('origin: function(origin, callback)');
  });

  it('supports comma-separated APP_URL values', () => {
    expect(serverCode).toContain(".split(',')");
    expect(serverCode).toContain('.trim()');
  });

  it('allows requests with no origin (server-to-server)', () => {
    expect(serverCode).toContain('if (!origin) return callback(null, true)');
  });

  it('checks against allowed origins list', () => {
    expect(serverCode).toContain('allowedOrigins.includes(origin)');
  });
});

// ─────────────────────────────────────────────────────────
// Fix #53: Login redirect guard for root path
// ─────────────────────────────────────────────────────────
describe('Fix #53: Root path redirect when logged in', () => {
  const routingCode = fs.readFileSync(
    path.join(__dirname, '../../frontend/src/app/app-routing.module.ts'), 'utf8'
  );

  it('login route has LoginRedirectGuard', () => {
    expect(routingCode).toContain('LoginRedirectGuard');
    expect(routingCode).toContain("path: 'login'");
  });

  it('imports LoginRedirectGuard', () => {
    expect(routingCode).toContain("import { LoginRedirectGuard }");
  });

  const guardCode = fs.readFileSync(
    path.join(__dirname, '../../frontend/src/app/guards/login-redirect.guard.ts'), 'utf8'
  );

  it('guard redirects to dashboard when logged in', () => {
    expect(guardCode).toContain("this.authService.isLoggedIn()");
    expect(guardCode).toContain("this.router.navigate(['/dashboard'])");
  });

  it('guard returns true (allows) when not logged in', () => {
    expect(guardCode).toContain('return true');
  });
});

// ─────────────────────────────────────────────────────────
// Fix #65: Document hub unique filePath index
// ─────────────────────────────────────────────────────────
describe('Fix #65: DocumentHubFile unique filePath index', () => {
  const modelCode = fs.readFileSync(
    path.join(__dirname, '../models/DocumentHubFile.js'), 'utf8'
  );

  it('has unique index on filePath', () => {
    expect(modelCode).toContain("{ filePath: 1 }, { unique: true }");
  });
});
