import { APIRequestContext, expect } from '@playwright/test';

const { USERS } = require('./users');
export type UserKey = 'admin' | 'agent' | 'child' | 'other' | 'inactive';
export const API = process.env.E2E_API || 'http://localhost:5000/api';

const tokens: Partial<Record<UserKey, string>> = {};

export async function tokenFor(request: APIRequestContext, key: UserKey): Promise<string> {
  if (tokens[key]) return tokens[key]!;
  const res = await request.post(`${API}/auth/login`, {
    data: { email: USERS[key].email, password: USERS[key].password }
  });
  expect(res.status(), `login as ${key}`).toBe(200);
  const body = await res.json();
  tokens[key] = body.token;
  return body.token;
}

export async function as(request: APIRequestContext, key: UserKey) {
  const token = await tokenFor(request, key);
  return { headers: { Authorization: `Bearer ${token}` } };
}

export async function carrierId(request: APIRequestContext): Promise<string> {
  const res = await request.get(`${API}/carriers`, await as(request, 'agent'));
  expect(res.status()).toBe(200);
  const body = await res.json();
  const list = Array.isArray(body) ? body : body.carriers;
  const c = list.find((x: any) => x.name === 'E2E Carrier');
  expect(c, 'seeded E2E Carrier').toBeTruthy();
  return c._id;
}

/** Fail the test on console errors or 5xx responses, as the replica-test rule requires. */
export function failOnErrors(page: import('@playwright/test').Page, ignore: RegExp[] = []) {
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const t = msg.text();
    if (ignore.some((r) => r.test(t))) return;
    throw new Error(`console error: ${t}`);
  });
  page.on('response', (res) => {
    if (res.status() >= 500) throw new Error(`${res.status()} on ${res.url()}`);
  });
}
