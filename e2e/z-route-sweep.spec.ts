import { test, expect } from '@playwright/test';
import { API, tokenFor } from './helpers/api';

// Calls EVERY route (e2e/routes.json, built by `npm run e2e:routes`) and checks invariants that
// should hold for all of them. Named z-* so it runs last: it calls every route as an admin.
const routes: Array<{ method: string; path: string }> = require('./routes.json');
const FAKE = '0'.repeat(24);
const SERVER = API.replace(/\/api$/, '');

// Public by design (login page, applicant registration, provider callbacks).
const PUBLIC = [
  /^\/api\/public\//,
  /^\/api\/auth\/(login|forgot-password|reset-password\/|token-exchange|stop-impersonation)/,
  /^\/api\/admin\/config\/(branding|site-access\/public)$/,
  /^\/api\/payments\/webhook/,
  /^\/api\/examfx\/webhook/,
  /^\/api\/quickbooks\/callback/,
  /^\/health/
];
// Readable by agents on purpose (production form needs the product list).
const AGENT_ALLOWED_ADMIN = [/^\/api\/admin\/products\/?$/, /^\/api\/admin\/config\/(branding|site-access\/public)$/];
// These depend on a live provider that the local run deliberately leaves unconfigured.
const PROVIDER_DEPENDENT = [/\/payments\/(create-customer|one-time-intent)$/, /\/config\/email\/test$/, /\/examfx\/.*sync/, /\/business-cards\//];

const isPublic = (p: string) => PUBLIC.some((r) => r.test(p));
const real = (p: string) => p.replace(/:[A-Za-z]+/g, FAKE).replace(/\/\//g, '/');
const bad = (p: string) => p.replace(/:[A-Za-z]+/g, 'not-an-id').replace(/\/\//g, '/');
const testable = routes.filter((r) => r.path !== '*' && !r.path.startsWith('/health'));

async function status(request: any, method: string, path: string, token?: string): Promise<number> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const hasBody = !['GET', 'HEAD', 'DELETE'].includes(method);
  const res = await request.fetch(`${SERVER}${path}`, {
    method, headers, timeout: 20000,
    ...(hasBody ? { data: {} } : {})
  });
  return res.status();
}

test.describe.configure({ timeout: 300_000 });

test.describe('Z route sweep', () => {
  test('Z-N1 every non-public route rejects anonymous callers with 401', async ({ request }) => {
    const failures: string[] = [];
    for (const r of testable.filter((x) => !isPublic(x.path))) {
      const s = await status(request, r.method, real(r.path));
      if (s !== 401) failures.push(`${r.method} ${r.path} -> ${s}`);
    }
    expect(failures).toEqual([]);
  });

  test('Z-N2 every /api/admin route rejects an agent with 403', async ({ request }) => {
    const token = await tokenFor(request, 'agent');
    const failures: string[] = [];
    for (const r of testable.filter((x) => x.path.startsWith('/api/admin') && !AGENT_ALLOWED_ADMIN.some((a) => a.test(x.path)))) {
      const s = await status(request, r.method, real(r.path), token);
      if (s !== 403) failures.push(`${r.method} ${r.path} -> ${s}`);
    }
    expect(failures).toEqual([]);
  });

  test('Z-N3 malformed ids never cause a 5xx (admin)', async ({ request }) => {
    const token = await tokenFor(request, 'admin');
    const failures: string[] = [];
    for (const r of testable.filter((x) => /:[A-Za-z]+/.test(x.path) && !PROVIDER_DEPENDENT.some((p) => p.test(x.path)))) {
      const s = await status(request, r.method, bad(r.path), token);
      if (s >= 500) failures.push(`${r.method} ${r.path} -> ${s}`);
    }
    expect(failures).toEqual([]);
  });

  test('Z-N4 empty bodies and unknown ids never cause a 5xx (admin)', async ({ request }) => {
    const token = await tokenFor(request, 'admin');
    const failures: string[] = [];
    for (const r of testable.filter((x) => !PROVIDER_DEPENDENT.some((p) => p.test(x.path)))) {
      const s = await status(request, r.method, real(r.path), token);
      if (s >= 500) failures.push(`${r.method} ${r.path} -> ${s}`);
    }
    expect(failures).toEqual([]);
  });
});
