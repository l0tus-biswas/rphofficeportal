import { test, expect, APIRequestContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { API, as } from './helpers/api';

const { USERS } = require('./helpers/users');
const DIR = path.join(__dirname, '../backend/uploads/commission-statements');
const files = () => (fs.existsSync(DIR) ? fs.readdirSync(DIR) : []);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

async function userId(request: APIRequestContext, key: 'agent' | 'other' | 'child'): Promise<string> {
  const list = await (await request.get(`${API}/admin/users`, await as(request, 'admin'))).json();
  const users: any[] = Array.isArray(list) ? list : list.users;
  return users.find((u) => u.email === USERS[key].email)._id;
}

async function upload(request: APIRequestContext, fields: Record<string, any>, file?: { name: string; mimeType: string; buffer: Buffer } | null) {
  const multipart: Record<string, any> = { ...fields };
  if (file !== null) multipart.statementFile = file ?? { name: 'stmt.pdf', mimeType: 'application/pdf', buffer: PDF };
  return request.post(`${API}/commission-statements`, { ...(await as(request, 'admin')), multipart });
}

async function createFor(request: APIRequestContext, who: 'agent' | 'other' | 'child' = 'agent') {
  const res = await upload(request, { agentId: await userId(request, who), payPeriod: '2026-09-30', carriers: 'E2E Carrier' });
  expect(res.status()).toBe(201);
  return (await res.json()).statements[0];
}

test.describe('F10 commission statements', () => {
  test('F10-H1 admin uploads; only the owning agent can list it', async ({ request }) => {
    const stmt = await createFor(request);
    const mine = await (await request.get(`${API}/commission-statements`, await as(request, 'agent'))).json();
    expect(mine.map((s: any) => s._id)).toContain(stmt._id);
    for (const who of ['other', 'child'] as const) {
      const theirs = await (await request.get(`${API}/commission-statements`, await as(request, who))).json();
      expect(theirs.map((s: any) => s._id), who).not.toContain(stmt._id);
    }
  });

  test('F10-I1 download: owner gets the bytes, others 403, anonymous 401', async ({ request }) => {
    const stmt = await createFor(request);
    const ok = await request.get(`${API}/commission-statements/${stmt._id}/download`, await as(request, 'agent'));
    expect(ok.status()).toBe(200);
    expect(ok.headers()['content-disposition']).toMatch(/^attachment/);
    expect(Buffer.compare(await ok.body(), PDF)).toBe(0);
    expect((await request.get(`${API}/commission-statements/${stmt._id}/download`, await as(request, 'other'))).status()).toBe(403);
    expect((await request.get(`${API}/commission-statements/${stmt._id}/download`)).status()).toBe(401);
  });

  test('F10-I2 notes: other agents cannot read notes on my statement; an agent cannot add notes', async ({ request }) => {
    const stmt = await createFor(request);
    const added = await request.post(`${API}/commission-statements/${stmt._id}/notes`, { ...(await as(request, 'admin')), data: { text: 'Chargeback in Oct' } });
    expect(added.status()).toBeLessThan(300);
    const own = await request.get(`${API}/commission-statements/${stmt._id}/notes`, await as(request, 'agent'));
    expect(own.status()).toBe(200);
    expect(JSON.stringify(await own.json())).toContain('Chargeback in Oct');
    const other = await request.get(`${API}/commission-statements/${stmt._id}/notes`, await as(request, 'other'));
    expect([403, 404]).toContain(other.status());
    const forged = await request.post(`${API}/commission-statements/${stmt._id}/notes`, { ...(await as(request, 'agent')), data: { text: 'x' } });
    expect(forged.status()).toBe(403);
  });

  test('F10-N1 agents cannot upload, edit or delete statements', async ({ request }) => {
    const stmt = await createFor(request);
    const agent = await as(request, 'agent');
    const up = await request.post(`${API}/commission-statements`, { ...agent, multipart: { agentId: await userId(request, 'agent'), payPeriod: '2026-09-30', statementFile: { name: 'a.pdf', mimeType: 'application/pdf', buffer: PDF } } });
    expect(up.status()).toBe(403);
    expect((await request.put(`${API}/commission-statements/${stmt._id}`, { ...agent, data: { carriers: 'hijack' } })).status()).toBe(403);
    expect((await request.delete(`${API}/commission-statements/${stmt._id}`, agent)).status()).toBe(403);
  });

  test('F10-N2 upload validation answers 4xx, never 5xx', async ({ request }) => {
    const agentId = await userId(request, 'agent');
    const cases: Array<[string, Record<string, any>, any, number[]]> = [
      ['no file', { agentId, payPeriod: '2026-09-30' }, null, [400]],
      ['no agentId', { payPeriod: '2026-09-30' }, undefined, [400]],
      ['no payPeriod', { agentId }, undefined, [400]],
      ['unknown agent', { agentId: '0'.repeat(24), payPeriod: '2026-09-30' }, undefined, [404]],
      ['malformed agent id', { agentId: 'nope', payPeriod: '2026-09-30' }, undefined, [400, 404]],
      ['invalid pay period', { agentId, payPeriod: 'not-a-date' }, undefined, [400]],
      ['executable', { agentId, payPeriod: '2026-09-30' }, { name: 'virus.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') }, [400]],
      ['html disguised as pdf', { agentId, payPeriod: '2026-09-30' }, { name: 'page.html', mimeType: 'application/pdf', buffer: Buffer.from('<script>alert(1)</script>') }, [400]]
    ];
    for (const [label, fields, file, expected] of cases) {
      const res = await upload(request, fields, file);
      expect(expected, `${label} -> ${res.status()}`).toContain(res.status());
    }
  });

  test('F10-N3 oversize file (21 MB) is rejected', async ({ request }) => {
    const res = await upload(request, { agentId: await userId(request, 'agent'), payPeriod: '2026-09-30' }, { name: 'big.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(21 * 1024 * 1024, 1) });
    expect(res.status()).toBe(400);
  });

  test('F10-N4 a rejected upload leaves no orphan file on disk', async ({ request }) => {
    const before = files().length;
    await upload(request, { agentId: '0'.repeat(24), payPeriod: '2026-09-30' });
    await upload(request, { agentId: await userId(request, 'agent'), payPeriod: 'not-a-date' });
    expect(files().length).toBe(before);
  });

  test('F10-N5 a failed edit does not destroy the existing file', async ({ request }) => {
    const stmt = await createFor(request);
    const res = await request.put(`${API}/commission-statements/${stmt._id}`, {
      ...(await as(request, 'admin')),
      multipart: { payPeriod: 'not-a-date', statementFile: { name: 'replacement.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-replacement') } }
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    const dl = await request.get(`${API}/commission-statements/${stmt._id}/download`, await as(request, 'agent'));
    expect(dl.status(), 'original file must still be downloadable').toBe(200);
    expect(Buffer.compare(await dl.body(), PDF)).toBe(0);
  });

  test('F10-N6 hostile query parameters never cause a 5xx', async ({ request }) => {
    const admin = await as(request, 'admin');
    for (const q of ['carrier[$gt]=', 'carrier[$ne]=x', 'carrier=(a%2B)%2B%24', 'page=abc&limit=-5', 'from=garbage&to=garbage', 'agentId=not-an-id', 'agentId[$ne]=1']) {
      const res = await request.get(`${API}/commission-statements?${q}`, admin);
      expect(res.status(), q).toBeLessThan(500);
    }
  });

  test('F10-E1 hostile and unicode file names are stored safely and download', async ({ request }) => {
    const agentId = await userId(request, 'agent');
    for (const name of ['../../évidence 😀.pdf', 'a b&c%20d.pdf']) {
      const res = await upload(request, { agentId, payPeriod: '2026-09-30' }, { name, mimeType: 'application/pdf', buffer: PDF });
      expect(res.status(), name).toBe(201);
      const stmt = (await res.json()).statements[0];
      expect(stmt.filePath, name).toMatch(/^uploads\/commission-statements\/[A-Za-z0-9._-]+$/);
      const dl = await request.get(`${API}/commission-statements/${stmt._id}/download`, await as(request, 'agent'));
      expect(dl.status(), name).toBe(200);
    }
  });

  test('F10-H2 admin edit and delete; delete removes the file from disk', async ({ request }) => {
    const stmt = await createFor(request);
    const admin = await as(request, 'admin');
    const edited = await request.put(`${API}/commission-statements/${stmt._id}`, { ...admin, data: { carriers: 'Updated Carrier' } });
    expect(edited.status()).toBe(200);
    const onDisk = path.join(__dirname, '../backend', stmt.filePath);
    expect(fs.existsSync(onDisk)).toBe(true);
    expect((await request.delete(`${API}/commission-statements/${stmt._id}`, admin)).status()).toBe(200);
    expect(fs.existsSync(onDisk)).toBe(false);
    expect((await request.get(`${API}/commission-statements/${stmt._id}/download`, admin)).status()).toBe(404);
  });
});
