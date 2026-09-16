/**
 * Regression test for a real production-breaking bug caught via live manual
 * testing: server.js required jobs/resumeBilling.job.js (which pulls in
 * utils/stripe.js) BEFORE dotenv.config() ran. utils/stripe.js reads
 * STRIPE_SECRET_KEY at module-load time, so on a real boot (not Jest's
 * mocked test environment, which sets env vars before any require happens)
 * Stripe silently initialized as disabled for the ENTIRE process — breaking
 * every Stripe-backed route in the running app, not just billing-exempt.
 *
 * Jest's own test suite couldn't catch this: setup-integration.js mocks
 * utils/stripe.js entirely, and tests/setup.js sets env vars up front, so
 * the real module-load-order bug never gets exercised. This test spawns a
 * real child process that requires server.js exactly like `node server.js`
 * would, with env vars supplied the same way a real deployment supplies
 * them (as process env, not a pre-loaded .env), and asserts Stripe actually
 * initializes.
 */
const { spawnSync } = require('child_process');
const path = require('path');

describe('server.js boot order: Stripe must initialize from real env vars', () => {
  it('does not disable Stripe due to require-order issues', () => {
    const serverPath = path.join(__dirname, '..', '..', 'server.js');

    // Deliberately do NOT set STRIPE_SECRET_KEY (or JWT_SECRET) here — the
    // whole point is to prove they get picked up from the real backend/.env
    // file via server.js's own dotenv.config() call, exactly like `node
    // server.js` in production. Pre-setting them as spawn env vars would
    // mask the bug: dotenv never overrides an already-set process.env value,
    // so the require-order issue wouldn't reproduce.
    const spawnEnv = { ...process.env };
    delete spawnEnv.STRIPE_SECRET_KEY;
    delete spawnEnv.JWT_SECRET;
    delete spawnEnv.MONGODB_URI;

    const result = spawnSync(
      process.execPath,
      ['-e', `require(${JSON.stringify(serverPath)}); setTimeout(() => process.exit(0), 300);`],
      {
        cwd: path.join(__dirname, '..', '..'),
        env: spawnEnv,
        timeout: 10000,
        encoding: 'utf8'
      }
    );

    const combined = `${result.stdout || ''}\n${result.stderr || ''}`;
    expect(combined).not.toMatch(/Stripe API key not configured/);
    expect(combined).not.toMatch(/Payment features will be disabled/);
  }, 15000);
});
