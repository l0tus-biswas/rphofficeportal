import { test, expect, APIRequestContext } from '@playwright/test';
import { API, as, tokenFor } from './helpers/api';

const { USERS } = require('./helpers/users');
const SERVER = API.replace(/\/api$/, '');
const PDF = Buffer.from('%PDF-1.4\n%%EOF\n');

async function userId(request: APIRequestContext, key: keyof typeof USERS): Promise<string> {
  const list = await (await request.get(`${API}/admin/users`, await as(request, 'admin'))).json();
  return (Array.isArray(list) ? list : list.users).find((u: any) => u.email === USERS[key].email)._id;
}

async function statementFor(request: APIRequestContext, who: 'agent' | 'other') {
  const res = await request.post(`${API}/commission-statements`, {
    ...(await as(request, 'admin')),
    multipart: { agentId: await userId(request, who), payPeriod: '2026-09-30', statementFile: { name: 'private.pdf', mimeType: 'application/pdf', buffer: PDF } }
  });
  expect(res.status()).toBe(201);
  return (await res.json()).statements[0];
}

const staticGet = async (request: APIRequestContext, urlPath: string, who?: 'agent' | 'other' | 'admin') =>
  request.get(`${SERVER}${urlPath}`, who ? await as(request, who) : {});

test.describe('F11 protected /uploads files', () => {
  test('F11-I1 another agent cannot read my commission statement through the static route', async ({ request }) => {
    const stmt = await statementFor(request, 'agent');
    const url = `/${stmt.filePath}`;
    expect((await staticGet(request, url, 'agent')).status(), 'admin-only folder, even for the owner').toBe(403);
    expect((await staticGet(request, url, 'other')).status()).toBe(403);
    expect((await staticGet(request, url)).status()).toBe(401);
    expect((await staticGet(request, url, 'admin')).status()).toBe(200);
  });

  test('F11-I2 percent-encoding and case tricks do not get around the folder rules', async ({ request }) => {
    const stmt = await statementFor(request, 'agent');
    const file = stmt.filePath.split('/').pop();
    for (const p of [
      `/uploads/%63ommission-statements/${file}`,
      `/uploads/Commission-Statements/${file}`,
      `/uploads/commission-statements/../commission-statements/${file}`,
      `/uploads//commission-statements/${file}`,
      `/uploads/./commission-statements/${file}`
    ]) {
      const s = (await staticGet(request, p, 'other')).status();
      expect([301, 308, 400, 401, 403, 404], `${p} -> ${s}`).toContain(s);
    }
  });

  test('F11-I3 other private folders are admin-only for agents', async ({ request }) => {
    for (const dir of ['onboarding-docs', 'document-requests', 'document-hub', 'apa-compliance', 'licensing', 'production', 'onboarding']) {
      const s = (await staticGet(request, `/uploads/${dir}/anything.pdf`, 'agent')).status();
      expect([403], `/uploads/${dir} -> ${s}`).toContain(s);
    }
  });

  test('F11-E1 shared training content stays available to agents; missing file is a real 404', async ({ request }) => {
    const res = await staticGet(request, '/uploads/training-pdfs/none.pdf', 'agent');
    expect(res.status(), 'allowed folder: 404 (no such file), not 403 and not SPA 200').toBe(404);
    expect(res.headers()['content-type']).toMatch(/json/);
  });

  test('F11-N1 a deactivated user\'s token stops working on /uploads immediately', async ({ request }) => {
    const stmt = await statementFor(request, 'agent');
    const childToken = await tokenFor(request, 'child');
    const childId = await userId(request, 'child');
    const admin = await as(request, 'admin');
    try {
      expect((await request.get(`${SERVER}/uploads/training-pdfs/none.pdf`, { headers: { Authorization: `Bearer ${childToken}` } })).status()).toBe(404);
      expect((await request.put(`${API}/admin/users/${childId}/deactivate`, { ...admin, data: {} })).status()).toBe(200);
      const after = await request.get(`${SERVER}/uploads/training-pdfs/none.pdf`, { headers: { Authorization: `Bearer ${childToken}` } });
      expect(after.status(), 'deactivated token on static files').toBe(401);
      expect([401, 403], 'and on the API').toContain((await request.get(`${API}/auth/me`, { headers: { Authorization: `Bearer ${childToken}` } })).status());
      void stmt;
    } finally {
      await request.put(`${API}/admin/users/${childId}/activate`, { ...admin, data: {} });
    }
  });
});
