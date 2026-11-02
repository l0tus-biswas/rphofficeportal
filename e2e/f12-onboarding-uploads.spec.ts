import { test, expect, APIRequestContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { API, as } from './helpers/api';

const { USERS } = require('./helpers/users');
const HUB = `${API}/onboarding-hub`;
const DIR = path.join(__dirname, '../backend/uploads/onboarding-docs');
const files = () => (fs.existsSync(DIR) ? fs.readdirSync(DIR) : []);
const PDF = Buffer.from('%PDF-1.4\n%%EOF\n');
const pdf = (name = 'id.pdf') => ({ name, mimeType: 'application/pdf', buffer: PDF });

let types: { photo: string; deposit: string; adminOnly: string; undeletable: string };
const ids: Record<string, string> = {};

async function userId(request: APIRequestContext, key: keyof typeof USERS) {
  if (ids[key]) return ids[key];
  const list = await (await request.get(`${API}/admin/users`, await as(request, 'admin'))).json();
  const u = (Array.isArray(list) ? list : list.users).find((x: any) => x.email === USERS[key].email);
  return (ids[key] = u._id);
}

async function makeType(request: APIRequestContext, over: Record<string, any>) {
  const res = await request.post(`${HUB}/admin/doc-types`, {
    ...(await as(request, 'admin')),
    data: { name: `E2E ${over.name || 'type'} ${Date.now()}${Math.floor(Math.random() * 1e4)}`, description: 'e2e', required: false, agentCanUpload: true, agentCanDelete: true, isReadOnlyLink: false, hasDirectDepositFields: false, sortOrder: 99, ...over, ...(over.name ? { name: `E2E ${over.name} ${Date.now()}${Math.floor(Math.random() * 1e4)}` } : {}) }
  });
  expect(res.status(), 'create doc type').toBeLessThan(300);
  const body = await res.json();
  return (body.docType || body)._id as string;
}

async function put(request: APIRequestContext, who: 'agent' | 'other' | 'admin', multipart: Record<string, any>) {
  return request.post(`${HUB}/documents`, { ...(await as(request, who)), multipart });
}


test.describe('F12 onboarding uploads', () => {
  test.beforeAll(async ({ request }) => {
    types = {
      photo: await makeType(request, { name: 'Photo ID' }),
      deposit: await makeType(request, { name: 'Direct Deposit', hasDirectDepositFields: true }),
      adminOnly: await makeType(request, { name: 'Admin only', agentCanUpload: false }),
      undeletable: await makeType(request, { name: 'Undeletable', agentCanDelete: false })
    };
  });

  test('F12-H1 agent uploads; admin reviews; agent sees the decision', async ({ request }) => {
    const res = await put(request, 'agent', { docTypeId: types.photo, docFile: pdf() });
    expect(res.status()).toBe(201);
    const doc = (await res.json()).document;
    expect(doc.status).toBe('pending');
    const review = await request.put(`${HUB}/admin/documents/${doc._id}/status`, { ...(await as(request, 'admin')), data: { status: 'approved', comment: 'Looks good' } });
    expect(review.status()).toBe(200);
    const mine = await (await request.get(`${HUB}/documents/${await userId(request, 'agent')}`, await as(request, 'agent'))).json();
    const seen = mine.find((d: any) => d._id === doc._id);
    expect(seen.status).toBe('approved');
    expect(seen.adminComment).toBe('Looks good');
  });

  test('F12-I1 other agents cannot list, download or delete my documents', async ({ request }) => {
    const doc = (await (await put(request, 'agent', { docTypeId: types.photo, docFile: pdf() })).json()).document;
    const other = await as(request, 'other');
    const agentId = await userId(request, 'agent');
    expect((await request.get(`${HUB}/documents/${agentId}`, other)).status()).toBe(403);
    expect((await request.get(`${HUB}/documents/${agentId}/${doc._id}/download`, other)).status()).toBe(403);
    expect((await request.delete(`${HUB}/documents/${doc._id}`, other)).status()).toBe(403);
    expect((await request.get(`${HUB}/documents/${agentId}/${doc._id}/download`, await as(request, 'agent'))).status()).toBe(200);
  });

  test('F12-I2 an agent cannot upload on behalf of another agent via agentId', async ({ request }) => {
    const otherId = await userId(request, 'other');
    const res = await put(request, 'agent', { docTypeId: types.photo, agentId: otherId, docFile: pdf() });
    expect(res.status()).toBe(201);
    const theirs = await (await request.get(`${HUB}/documents/${otherId}`, await as(request, 'admin'))).json();
    expect(theirs.map((d: any) => d.uploadedBy?._id || d.uploadedBy)).not.toContain(await userId(request, 'agent'));
  });

  test('F12-I3 agents cannot review documents or read bank info', async ({ request }) => {
    const doc = (await (await put(request, 'agent', { docTypeId: types.photo, docFile: pdf() })).json()).document;
    const agent = await as(request, 'agent');
    expect((await request.put(`${HUB}/admin/documents/${doc._id}/status`, { ...agent, data: { status: 'approved' } })).status()).toBe(403);
    expect((await request.get(`${HUB}/admin/documents/${doc._id}/bank-info`, agent)).status()).toBe(403);
  });

  test('F12-N1 upload validation answers 4xx, never 5xx', async ({ request }) => {
    const cases: Array<[string, Record<string, any>, number[]]> = [
      ['no docTypeId', { docFile: pdf() }, [400]],
      ['unknown type', { docTypeId: '0'.repeat(24), docFile: pdf() }, [404]],
      ['malformed type id', { docTypeId: 'nope', docFile: pdf() }, [400, 404]],
      ['type agents may not upload', { docTypeId: types.adminOnly, docFile: pdf() }, [403]],
      ['no file and no link', { docTypeId: types.photo }, [400]],
      ['executable', { docTypeId: types.photo, docFile: { name: 'virus.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') } }, [400]],
      ['html declared as pdf', { docTypeId: types.photo, docFile: { name: 'page.html', mimeType: 'application/pdf', buffer: Buffer.from('<script>1</script>') } }, [400]],
      ['svg declared as png', { docTypeId: types.photo, docFile: { name: 'x.svg', mimeType: 'image/png', buffer: Buffer.from('<svg onload=alert(1)>') } }, [400]]
    ];
    for (const [label, mp, expected] of cases) {
      const res = await put(request, 'agent', mp);
      expect(expected, `${label} -> ${res.status()}`).toContain(res.status());
    }
  });

  test('F12-N2 oversize file (16 MB) is rejected with 413', async ({ request }) => {
    const res = await put(request, 'agent', { docTypeId: types.photo, docFile: { name: 'big.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(16 * 1024 * 1024, 1) } });
    expect(res.status()).toBe(413);
  });

  test('F12-N3 rejected uploads leave no orphan files (ID documents must not linger)', async ({ request }) => {
    const before = files().length;
    await put(request, 'agent', { docFile: pdf() });
    await put(request, 'agent', { docTypeId: '0'.repeat(24), docFile: pdf() });
    await put(request, 'agent', { docTypeId: types.adminOnly, docFile: pdf() });
    await put(request, 'agent', { docTypeId: types.deposit, routingNumber: '123', accountNumber: '123456', accountType: 'checking', docFile: pdf() });
    expect(files().length).toBe(before);
  });

  test('F12-N4 direct deposit: validation, encryption and admin-only decryption', async ({ request }) => {
    const base = { docTypeId: types.deposit, docFile: pdf('check.pdf') };
    for (const [label, extra] of [
      ['missing fields', {}],
      ['short routing', { routingNumber: '12345678', accountNumber: '123456789', accountType: 'checking' }],
      ['letters in routing', { routingNumber: '12345678a', accountNumber: '123456789', accountType: 'checking' }],
      ['short account', { routingNumber: '123456789', accountNumber: '123', accountType: 'checking' }],
      ['long account', { routingNumber: '123456789', accountNumber: '1'.repeat(18), accountType: 'checking' }],
      ['bad account type', { routingNumber: '123456789', accountNumber: '123456789', accountType: 'crypto' }]
    ] as Array<[string, Record<string, string>]>) {
      const res = await put(request, 'agent', { ...base, ...extra });
      expect(res.status(), label).toBe(400);
    }
    const ok = await put(request, 'agent', { ...base, routingNumber: '021000021', accountNumber: '123456789', accountType: 'checking' });
    expect(ok.status()).toBe(201);
    const created = await ok.json();
    const raw = JSON.stringify(created);
    expect(raw, 'plain account number must never be returned to the uploader').not.toContain('123456789');
    expect(raw, 'plain routing number must never be returned to the uploader').not.toContain('021000021');
    const mine = JSON.stringify(await (await request.get(`${HUB}/documents/${await userId(request, 'agent')}`, await as(request, 'agent'))).json());
    expect(mine).not.toContain('123456789');
    const info = await request.get(`${HUB}/admin/documents/${created.document._id}/bank-info`, await as(request, 'admin'));
    expect(info.status()).toBe(200);
    expect(await info.json()).toMatchObject({ routingNumber: '021000021', accountNumber: '123456789', accountType: 'checking' });
  });

  test('F12-N5 external links must be http(s); script URLs are rejected', async ({ request }) => {
    for (const link of ['javascript:alert(document.cookie)', 'data:text/html,<script>1</script>', 'file:///etc/passwd', 'x'.repeat(5000)]) {
      const res = await put(request, 'agent', { docTypeId: types.photo, externalLink: link });
      expect(res.status(), link.slice(0, 30)).toBe(400);
    }
    const ok = await put(request, 'agent', { docTypeId: types.photo, externalLink: 'https://example.com/my-id' });
    expect(ok.status()).toBe(201);
  });

  test('F12-E1 re-upload replaces the file, resets status to pending, keeps one document', async ({ request }) => {
    const agentId = await userId(request, 'agent');
    const type = await makeType(request, { name: 'Replace me' });
    const first = (await (await put(request, 'agent', { docTypeId: type, docFile: pdf('first.pdf') })).json()).document;
    await request.put(`${HUB}/admin/documents/${first._id}/status`, { ...(await as(request, 'admin')), data: { status: 'approved' } });
    const oldFile = path.join(__dirname, '../backend', first.filePath);
    expect(fs.existsSync(oldFile)).toBe(true);
    const second = (await (await put(request, 'agent', { docTypeId: type, docFile: pdf('second.pdf') })).json()).document;
    expect(second._id).toBe(first._id);
    expect(second.status).toBe('pending');
    expect(fs.existsSync(oldFile), 'old file removed on replace').toBe(false);
    const list = (await (await request.get(`${HUB}/documents/${agentId}`, await as(request, 'agent'))).json()).filter((d: any) => (d.docType?._id || d.docType) === type);
    expect(list).toHaveLength(1);
  });

  test('F12-E2 two simultaneous uploads of the same document type create one document', async ({ request }) => {
    const agentId = await userId(request, 'agent');
    const type = await makeType(request, { name: 'Race' });
    await Promise.all([
      put(request, 'agent', { docTypeId: type, docFile: pdf('a.pdf') }),
      put(request, 'agent', { docTypeId: type, docFile: pdf('b.pdf') })
    ]);
    const list = (await (await request.get(`${HUB}/documents/${agentId}`, await as(request, 'agent'))).json()).filter((d: any) => (d.docType?._id || d.docType) === type);
    expect(list).toHaveLength(1);
  });

  test('F12-N6 delete rules: owner may delete when allowed, not when type forbids; file removed from disk', async ({ request }) => {
    const del = (await (await put(request, 'agent', { docTypeId: types.photo, docFile: pdf('del.pdf') })).json()).document;
    const onDisk = path.join(__dirname, '../backend', del.filePath);
    expect(fs.existsSync(onDisk)).toBe(true);
    expect((await request.delete(`${HUB}/documents/${del._id}`, await as(request, 'agent'))).status()).toBe(200);
    expect(fs.existsSync(onDisk)).toBe(false);
    expect((await request.get(`${HUB}/documents/${await userId(request, 'agent')}/${del._id}/download`, await as(request, 'agent'))).status()).toBe(404);

    const keep = (await (await put(request, 'agent', { docTypeId: types.undeletable, docFile: pdf('keep.pdf') })).json()).document;
    expect((await request.delete(`${HUB}/documents/${keep._id}`, await as(request, 'agent'))).status()).toBe(403);
  });

  test('F12-E3 a document with a non-ASCII file name keeps its name and downloads', async ({ request }) => {
    const type = await makeType(request, { name: 'Unicode name' });
    const name = 'Cédula “identidad” 😀.pdf';
    const res = await put(request, 'agent', { docTypeId: type, docFile: pdf(name) });
    expect(res.status()).toBe(201);
    const doc = (await res.json()).document;
    expect(doc.originalFileName).toBe(name);
    const dl = await request.get(`${HUB}/documents/${await userId(request, 'agent')}/${doc._id}/download`, await as(request, 'agent'));
    expect(dl.status()).toBe(200);
    expect(decodeURIComponent(dl.headers()['content-disposition'].split("filename*=UTF-8''")[1])).toBe(name);
  });

  test('F12-N7 review status validation', async ({ request }) => {
    const doc = (await (await put(request, 'agent', { docTypeId: types.photo, docFile: pdf() })).json()).document;
    const admin = await as(request, 'admin');
    for (const status of ['hacked', '', null, 7]) {
      const res = await request.put(`${HUB}/admin/documents/${doc._id}/status`, { ...admin, data: { status } });
      expect(res.status(), String(status)).toBe(400);
    }
  });

  test('F12-N8 admin cannot attach a document to a user that does not exist', async ({ request }) => {
    const res = await put(request, 'admin', { docTypeId: types.photo, agentId: '0'.repeat(24), docFile: pdf() });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });
});
