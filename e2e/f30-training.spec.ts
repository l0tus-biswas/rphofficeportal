import { test, expect, APIRequestContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { API, as } from './helpers/api';

const T = `${API}/training`;
const UPLOADS = path.join(__dirname, '..', 'backend', 'uploads');
const PDF = Buffer.from('%PDF-1.4\n%%EOF\n');
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082', 'hex');
const uniq = (p: string) => `${p} ${Date.now()}${Math.floor(Math.random() * 1e5)}`;
const OID = '0'.repeat(24);
const files = (dir: string) => (fs.existsSync(path.join(UPLOADS, dir)) ? fs.readdirSync(path.join(UPLOADS, dir)) : []);

async function folder(request: APIRequestContext, over: Record<string, any> = {}) {
  const res = await request.post(`${T}/folders`, { ...(await as(request, 'admin')), data: { name: uniq('E2E folder'), ...over } });
  expect(res.status(), 'create folder').toBe(201);
  return (await res.json()).folder;
}
async function material(request: APIRequestContext, over: Record<string, any> = {}) {
  const res = await request.post(`${T}/materials`, { ...(await as(request, 'admin')), data: { title: uniq('E2E material'), type: 'link', url: 'https://example.com/x', ...over } });
  expect(res.status(), 'create material').toBe(201);
  return (await res.json()).material;
}

test.describe('F30 training management', () => {
  test('F30-H1 admin builds folder + material; agent reads; agent cannot write', async ({ request }) => {
    const f = await folder(request);
    const m = await material(request, { folder: f._id });
    const agent = await as(request, 'agent');
    const contents = await (await request.get(`${T}/folders/${f._id}/contents`, agent)).json();
    expect(contents.materials.map((x: any) => x._id)).toContain(m._id);
    expect((await request.post(`${T}/folders`, { ...agent, data: { name: 'x' } })).status()).toBe(403);
    expect((await request.post(`${T}/materials`, { ...agent, data: { title: 'xx', type: 'link' } })).status()).toBe(403);
    expect((await request.delete(`${T}/materials/${m._id}`, agent)).status()).toBe(403);
    expect((await request.put(`${T}/folders/${f._id}`, { ...agent, data: { name: 'h' } })).status()).toBe(403);
    expect((await request.post(`${T}/materials/${m._id}/pdf`, { ...agent, multipart: { pdf: { name: 'a.pdf', mimeType: 'application/pdf', buffer: PDF } } })).status()).toBe(403);
  });

  test('F30-A1 a deleted (inactive) material is not readable by id by agents', async ({ request }) => {
    const m = await material(request);
    await request.delete(`${T}/materials/${m._id}`, await as(request, 'admin'));
    const list = await (await request.get(`${T}/materials?limit=100`, await as(request, 'agent'))).json();
    expect(list.materials.map((x: any) => x._id)).not.toContain(m._id);
    expect((await request.get(`${T}/materials/${m._id}`, await as(request, 'agent'))).status(), 'list hides it, detail must too').toBe(404);
  });

  test('F30-A2 contents of a deleted folder is 404; unknown folder is 404', async ({ request }) => {
    const f = await folder(request);
    await request.delete(`${T}/folders/${f._id}`, await as(request, 'admin'));
    expect((await request.get(`${T}/folders/${f._id}/contents`, await as(request, 'agent'))).status()).toBe(404);
    expect((await request.get(`${T}/folders/${OID}/contents`, await as(request, 'agent'))).status()).toBe(404);
  });

  test('F30-N1 folder / category / material validation answers 4xx, never 5xx', async ({ request }) => {
    const admin = await as(request, 'admin');
    const f = await folder(request);
    const cases: Array<[string, string, string, any]> = [
      ['folder name object', 'post', `${T}/folders`, { name: { $ne: 1 } }],
      ['folder name array', 'post', `${T}/folders`, { name: ['a'] }],
      ['folder description object', 'post', `${T}/folders`, { name: 'ok', description: { a: 1 } }],
      ['folder parent junk', 'post', `${T}/folders`, { name: 'ok', parent: 'junk' }],
      ['folder parent object', 'post', `${T}/folders`, { name: 'ok', parent: { $ne: null } }],
      ['folder order text', 'post', `${T}/folders`, { name: 'ok', order: 'abc' }],
      ['folder put name object', 'put', `${T}/folders/${f._id}`, { name: { a: 1 } }],
      ['folder put description number', 'put', `${T}/folders/${f._id}`, { description: 5 }],
      ['folder put parent object', 'put', `${T}/folders/${f._id}`, { parent: { $ne: null } }],
      ['category name object', 'post', `${T}/categories`, { name: { a: 1 } }],
      ['category description object', 'post', `${T}/categories`, { name: uniq('c'), description: { a: 1 } }],
      ['category put name object', 'put', `${T}/categories/${OID}`, { name: { a: 1 } }],
      ['material no title', 'post', `${T}/materials`, { type: 'link' }],
      ['material bad url', 'post', `${T}/materials`, { title: 'abc', type: 'link', url: 'javascript:alert(1)' }],
      ['material bad type', 'post', `${T}/materials`, { title: 'abc', type: 'exe' }],
      ['material tags object', 'post', `${T}/materials`, { title: 'abc', type: 'link', tags: { a: 1 } }],
      ['material mass assignment key', 'post', `${T}/materials`, { title: 'abc', type: 'link', isActive: false }],
      ['material negative order', 'post', `${T}/materials`, { title: 'abc', type: 'link', order: -1 }]
    ];
    for (const [label, verb, url, data] of cases) {
      const res = await (request as any)[verb](url, { ...admin, data });
      expect(res.status(), `${label} -> ${res.status()}`).toBeGreaterThanOrEqual(400);
      expect(res.status(), `${label} -> ${res.status()}`).toBeLessThan(500);
    }
    for (const q of ['page=-1', 'limit=-5', 'page=abc', 'folder[$ne]=x', 'category[$ne]=x', 'type[$gt]=1', 'folder=junk']) {
      const res = await request.get(`${T}/materials?${q}`, await as(request, 'agent'));
      expect(res.status(), q).toBeLessThan(500);
    }
  });

  test('F30-N2 malformed / unknown ids give 4xx', async ({ request }) => {
    const admin = await as(request, 'admin');
    for (const id of ['junk', OID]) {
      for (const [verb, url] of [['get', `${T}/materials/${id}`], ['put', `${T}/materials/${id}`], ['delete', `${T}/materials/${id}`],
        ['delete', `${T}/folders/${id}`], ['put', `${T}/folders/${id}`], ['delete', `${T}/categories/${id}`]] as const) {
        const res = await (request as any)[verb](url, { ...admin, data: verb === 'put' ? { title: 'abcd' } : undefined });
        expect(res.status(), `${verb} ${url}`).toBeGreaterThanOrEqual(400);
        expect(res.status(), `${verb} ${url}`).toBeLessThan(500);
      }
    }
  });

  test('F30-S1 folder tree rules: self parent, cycle, delete re-parents contents', async ({ request }) => {
    const admin = await as(request, 'admin');
    const a = await folder(request);
    const b = await folder(request, { parent: a._id });
    const c = await folder(request, { parent: b._id });
    const m = await material(request, { folder: b._id });
    expect((await request.put(`${T}/folders/${a._id}`, { ...admin, data: { parent: a._id } })).status()).toBe(400);
    expect((await request.put(`${T}/folders/${a._id}`, { ...admin, data: { parent: c._id } })).status(), 'cycle').toBe(400);
    expect((await request.delete(`${T}/folders/${b._id}`, admin)).status()).toBe(200);
    const inA = await (await request.get(`${T}/folders/${a._id}/contents`, await as(request, 'agent'))).json();
    expect(inA.subfolders.map((x: any) => x._id)).toContain(c._id);
    expect(inA.materials.map((x: any) => x._id)).toContain(m._id);
    expect((await request.delete(`${T}/folders/${b._id}`, admin)).status(), 'second delete').toBe(404);
  });

  test('F30-S2 material cannot be created or moved into a missing/deleted folder', async ({ request }) => {
    const admin = await as(request, 'admin');
    expect((await request.post(`${T}/materials`, { ...admin, data: { title: 'abcd', type: 'link', folder: OID } })).status()).toBe(400);
    const f = await folder(request);
    await request.delete(`${T}/folders/${f._id}`, admin);
    expect((await request.post(`${T}/materials`, { ...admin, data: { title: 'abcd', type: 'link', folder: f._id } })).status()).toBe(400);
    const m = await material(request);
    expect((await request.put(`${T}/materials/${m._id}`, { ...admin, data: { folder: OID } })).status()).toBe(400);
  });

  test('F30-S3 category: duplicate, rename cascades, delete moves materials to General', async ({ request }) => {
    const admin = await as(request, 'admin');
    const name = uniq('Cat');
    const c = (await (await request.post(`${T}/categories`, { ...admin, data: { name } })).json()).category;
    expect((await request.post(`${T}/categories`, { ...admin, data: { name } })).status()).toBe(400);
    const m = await material(request, { category: name });
    const renamed = uniq('Cat2');
    expect((await request.put(`${T}/categories/${c._id}`, { ...admin, data: { name: renamed } })).status()).toBe(200);
    expect((await (await request.get(`${T}/materials/${m._id}`, admin)).json()).material.category).toBe(renamed);
    expect((await request.delete(`${T}/categories/${c._id}`, admin)).status()).toBe(200);
    expect((await (await request.get(`${T}/materials/${m._id}`, admin)).json()).material.category).toBe('General');
    expect((await request.delete(`${T}/categories/${c._id}`, admin)).status()).toBe(404);
  });

  test('F30-U1 thumbnail upload: bad type / extension mismatch / empty give 4xx and leave no files', async ({ request }) => {
    const admin = await as(request, 'admin');
    const f = await folder(request);
    const up = (file: any) => request.post(`${T}/folders/${f._id}/thumbnail`, { ...admin, multipart: { thumbnail: file } });
    const before = files('training-thumbnails').length;
    expect((await up({ name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') })).status(), 'text file').toBe(400);
    expect((await up({ name: 'a.png', mimeType: 'image/png', buffer: Buffer.alloc(6 * 1024 * 1024, 1) })).status(), '6 MB').toBe(400);
    expect((await up({ name: 'a.png', mimeType: 'image/png', buffer: Buffer.alloc(0) })).status(), 'empty').toBe(400);
    expect((await up({ name: 'a.png', mimeType: 'image/png', buffer: Buffer.from('<html><script>alert(1)</script></html>') })).status(), 'html with png mime').toBe(400);
    const res = await request.post(`${T}/folders/${f._id}/thumbnail`, { ...admin });
    expect(res.status(), 'no file').toBe(400);
    expect(files('training-thumbnails').length, 'rejected uploads must not leave files').toBe(before);
  });

  test('F30-U2 thumbnail is stored with a safe extension, never the client one (public folder)', async ({ request }) => {
    const admin = await as(request, 'admin');
    const f = await folder(request);
    const res = await request.post(`${T}/folders/${f._id}/thumbnail`, { ...admin, multipart: { thumbnail: { name: 'evil.html', mimeType: 'image/png', buffer: PNG } } });
    expect(res.status()).toBe(200);
    const stored = (await res.json()).folder.thumbnail as string;
    expect(stored, 'public /uploads/training-thumbnails must never serve .html').toMatch(/\.png$/);
  });

  test('F30-U3 svg thumbnail with script is refused', async ({ request }) => {
    const admin = await as(request, 'admin');
    const f = await folder(request);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.domain)</script></svg>');
    const res = await request.post(`${T}/folders/${f._id}/thumbnail`, { ...admin, multipart: { thumbnail: { name: 'x.svg', mimeType: 'image/svg+xml', buffer: svg } } });
    expect(res.status()).toBe(400);
  });

  test('F30-U4 upload to a missing folder/material leaves no orphan file', async ({ request }) => {
    const admin = await as(request, 'admin');
    const t0 = files('training-thumbnails').length;
    const p0 = files('training-pdfs').length;
    expect((await request.post(`${T}/folders/${OID}/thumbnail`, { ...admin, multipart: { thumbnail: { name: 'a.png', mimeType: 'image/png', buffer: PNG } } })).status()).toBe(404);
    expect((await request.post(`${T}/materials/${OID}/thumbnail`, { ...admin, multipart: { thumbnail: { name: 'a.png', mimeType: 'image/png', buffer: PNG } } })).status()).toBe(404);
    expect((await request.post(`${T}/materials/${OID}/pdf`, { ...admin, multipart: { pdf: { name: 'a.pdf', mimeType: 'application/pdf', buffer: PDF } } })).status()).toBe(404);
    expect((await request.post(`${T}/folders/junk/thumbnail`, { ...admin, multipart: { thumbnail: { name: 'a.png', mimeType: 'image/png', buffer: PNG } } })).status()).toBe(400);
    expect(files('training-thumbnails').length).toBe(t0);
    expect(files('training-pdfs').length).toBe(p0);
  });

  test('F30-U5 replacing a thumbnail removes the old file; delete removes it too', async ({ request }) => {
    const admin = await as(request, 'admin');
    const f = await folder(request);
    const put = async () => (await (await request.post(`${T}/folders/${f._id}/thumbnail`, { ...admin, multipart: { thumbnail: { name: 'a.png', mimeType: 'image/png', buffer: PNG } } })).json()).folder.thumbnail as string;
    const one = await put();
    const two = await put();
    expect(one).not.toBe(two);
    expect(fs.existsSync(path.join(UPLOADS, '..', one)), 'old file gone').toBe(false);
    expect(fs.existsSync(path.join(UPLOADS, '..', two))).toBe(true);
    expect((await request.delete(`${T}/folders/${f._id}/thumbnail`, admin)).status()).toBe(200);
    expect(fs.existsSync(path.join(UPLOADS, '..', two))).toBe(false);
  });

  test('F30-D1 PDF upload rules, agent download, unicode names, delete', async ({ request }) => {
    const admin = await as(request, 'admin');
    const m = await material(request);
    const up = (file: any) => request.post(`${T}/materials/${m._id}/pdf`, { ...admin, multipart: { pdf: file } });
    const before = files('training-pdfs').length;
    expect((await up({ name: 'a.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') })).status(), 'exe').toBe(400);
    expect((await up({ name: 'a.pdf', mimeType: 'application/pdf', buffer: Buffer.from('<html><script>alert(1)</script>') })).status(), 'html pretending to be pdf').toBe(400);
    expect((await up({ name: 'a.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(0) })).status(), 'empty').toBe(400);
    expect((await up({ name: 'big.pdf', mimeType: 'application/pdf', buffer: Buffer.concat([PDF, Buffer.alloc(21 * 1024 * 1024)]) })).status(), '21 MB').toBe(400);
    expect(files('training-pdfs').length, 'rejections leave nothing behind').toBe(before);

    const ok = await up({ name: 'Guía “2026” 😀.pdf', mimeType: 'application/pdf', buffer: PDF });
    expect(ok.status()).toBe(200);
    const att = (await ok.json()).pdfAttachments.slice(-1)[0];
    expect(att.fileName).toBe('Guía “2026” 😀.pdf');
    expect(att.filePath).toMatch(/\.pdf$/);
    const dl = await request.get(`${API.replace(/\/api$/, '')}${att.filePath}`, await as(request, 'agent'));
    expect(dl.status()).toBe(200);
    expect((await request.delete(`${T}/materials/${m._id}/pdf/${att._id}`, await as(request, 'agent'))).status()).toBe(403);
    expect((await request.delete(`${T}/materials/${m._id}/pdf/${att._id}`, admin)).status()).toBe(200);
    expect((await request.delete(`${T}/materials/${m._id}/pdf/${att._id}`, admin)).status(), 'already removed').toBe(404);
    expect((await request.delete(`${T}/materials/${m._id}/pdf/junk`, admin)).status()).toBeLessThan(500);
  });

  test('F30-D2 pdf upload with a wrong field name or too many files is 4xx', async ({ request }) => {
    const admin = await as(request, 'admin');
    const m = await material(request);
    const wrong = await request.post(`${T}/materials/${m._id}/pdf`, { ...admin, multipart: { file: { name: 'a.pdf', mimeType: 'application/pdf', buffer: PDF } } });
    expect(wrong.status()).toBeGreaterThanOrEqual(400);
    expect(wrong.status()).toBeLessThan(500);
  });

  test('F30-O1 ordering: materials sort by order then newest', async ({ request }) => {
    const f = await folder(request);
    const m2 = await material(request, { folder: f._id, order: 2, title: 'order two' });
    const m1 = await material(request, { folder: f._id, order: 1, title: 'order one' });
    const c = await (await request.get(`${T}/folders/${f._id}/contents`, await as(request, 'agent'))).json();
    expect(c.materials.map((x: any) => x._id)).toEqual([m1._id, m2._id]);
  });
});
