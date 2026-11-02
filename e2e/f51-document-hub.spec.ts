import { test, expect, APIRequestContext } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { API, as } from './helpers/api';

const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const uploads = (sub: string) => path.join(__dirname, '..', 'backend', 'uploads', sub);
const hasFile = (sub: string, token: string) =>
  fs.existsSync(uploads(sub)) && fs.readdirSync(uploads(sub)).some((f) => f.includes(token));
const pdf = (name: string) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function agentId(request: APIRequestContext, key: 'agent' | 'child' | 'other') {
  const me = await request.get(`${API}/agent/profile`, await as(request, key));
  return (await me.json()).user._id as string;
}
async function mkFolder(request: APIRequestContext, data: any) {
  const r = await request.post(`${API}/document-hub/folders`, { ...(await as(request, 'admin')), data: { name: `F${uniq()}`, ...data } });
  expect(r.status()).toBe(201);
  return r.json();
}
async function upload(request: APIRequestContext, multipart: any) {
  return request.post(`${API}/document-hub/files`, { ...(await as(request, 'admin')), multipart });
}

test.describe('F51 document hub', () => {
  test('F51-P1 agents never list files inside admin-only or inactive folders', async ({ request }) => {
    const secretFolder = await mkFolder(request, { visibility: 'admin' });
    const sub = await mkFolder(request, { visibility: 'all', parent: secretFolder._id });
    const t = uniq();
    expect((await upload(request, { files: pdf(`secret-${t}.pdf`), folder: secretFolder._id, visibility: 'all' })).status()).toBe(201);
    expect((await upload(request, { files: pdf(`nested-${t}.pdf`), folder: sub._id, visibility: 'all' })).status()).toBe(201);
    expect((await upload(request, { files: pdf(`public-${t}.pdf`), visibility: 'all' })).status()).toBe(201);
    const list = await (await request.get(`${API}/document-hub/files`, await as(request, 'agent'))).json();
    const names = list.map((f: any) => f.originalFileName);
    expect(names).toContain(`public-${t}.pdf`);
    expect(names).not.toContain(`secret-${t}.pdf`);
    expect(names).not.toContain(`nested-${t}.pdf`);
  });

  test('F51-U1 rejected uploads leave no file on disk', async ({ request }) => {
    const t = uniq();
    expect((await upload(request, { files: pdf(`bad-vis-${t}.pdf`), visibility: 'nonsense' })).status()).toBe(400);
    expect((await upload(request, { files: pdf(`no-users-${t}.pdf`), visibility: 'restricted' })).status()).toBe(400);
    expect((await upload(request, { files: pdf(`no-folder-${t}.pdf`), folder: '64b000000000000000000000' })).status()).toBe(400);
    const exe = await upload(request, { files: { name: `x-${t}.exe`, mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') } });
    expect(exe.status()).toBe(400);
    await sleep(300);
    expect(hasFile('document-hub', t)).toBe(false);
  });

  test('F51-R1 request flow: isolation, rejected responses leave no file, review rules', async ({ request }) => {
    const admin = await as(request, 'admin');
    const aId = await agentId(request, 'agent');
    const bId = await agentId(request, 'other');
    const cr = await request.post(`${API}/document-hub/requests`, { ...admin, data: { title: `Req ${uniq()}`, requestedFrom: [aId, bId] } });
    expect(cr.status()).toBe(201);
    const reqId = (await cr.json())._id;

    const t = uniq();
    const stranger = await request.post(`${API}/document-hub/requests/${reqId}/respond`, {
      ...(await as(request, 'child')), multipart: { file: pdf(`stranger-${t}.pdf`) }
    });
    expect(stranger.status()).toBe(403);
    const ghost = await request.post(`${API}/document-hub/requests/64b000000000000000000000/respond`, {
      ...(await as(request, 'agent')), multipart: { file: pdf(`ghost-${t}.pdf`) }
    });
    expect(ghost.status()).toBe(404);
    await sleep(300);
    expect(hasFile('document-requests', t)).toBe(false);

    const resp = await request.post(`${API}/document-hub/requests/${reqId}/respond`, {
      ...(await as(request, 'agent')), multipart: { file: pdf(`mine-${t}.pdf`), notes: 'here' }
    });
    expect(resp.status()).toBe(200);
    const bView = await (await request.get(`${API}/document-hub/requests`, await as(request, 'other'))).json();
    const bReq = bView.find((r: any) => r._id === reqId);
    expect(bReq.responses.every((x: any) => (x.agent._id || x.agent) === bId)).toBe(true);
    expect(JSON.stringify(bReq)).not.toContain('lotushotmail111@gmail.com');
    expect((await request.get(`${API}/document-hub/requests/${reqId}/responses/${aId}/download`, await as(request, 'other'))).status()).toBe(403);

    const review = (who: any, agentId: string, status: string) =>
      who.then((a: any) => request.put(`${API}/document-hub/requests/${reqId}/review/${agentId}`, { ...a, data: { status } }));
    expect((await review(as(request, 'admin'), bId, 'approved')).status()).toBe(400);
    expect((await review(as(request, 'admin'), aId, 'bogus')).status()).toBe(400);
    expect((await review(as(request, 'agent'), aId, 'approved')).status()).toBe(403);
    expect((await review(as(request, 'admin'), aId, 'approved')).status()).toBe(200);

    const t2 = uniq();
    const again = await request.post(`${API}/document-hub/requests/${reqId}/respond`, {
      ...(await as(request, 'agent')), multipart: { file: pdf(`again-${t2}.pdf`) }
    });
    expect(again.status()).toBe(400);
    await sleep(300);
    expect(hasFile('document-requests', t2)).toBe(false);
  });

  test('F51-F1 a folder cannot be moved into its own subfolder', async ({ request }) => {
    const admin = await as(request, 'admin');
    const a = await mkFolder(request, {});
    const b = await mkFolder(request, { parent: a._id });
    const c = await mkFolder(request, { parent: b._id });
    expect((await request.put(`${API}/document-hub/folders/${a._id}`, { ...admin, data: { parent: c._id } })).status()).toBe(400);
    expect((await request.put(`${API}/document-hub/folders/${a._id}`, { ...admin, data: { parent: '64b000000000000000000000' } })).status()).toBe(400);
  });

  test('F51-F2 deleting a folder moves files to the parent; unicode names survive', async ({ request }) => {
    const admin = await as(request, 'admin');
    const parent = await mkFolder(request, {});
    const child = await mkFolder(request, { parent: parent._id });
    const t = uniq();
    const name = `Ünïcode-文档-${t}.pdf`;
    const up = await upload(request, { files: { name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 x') }, folder: child._id });
    expect(up.status()).toBe(201);
    const file = (await up.json()).files[0];
    expect(file.originalFileName).toBe(name);
    expect((await request.delete(`${API}/document-hub/folders/${child._id}`, admin)).status()).toBe(200);
    const list = await (await request.get(`${API}/document-hub/files?folder=${parent._id}`, await as(request, 'agent'))).json();
    expect(list.map((f: any) => f._id)).toContain(file._id);
    const dl = await request.get(`${API}/document-hub/files/${file._id}/download`, await as(request, 'agent'));
    expect(dl.status()).toBe(200);
  });

  test('F51-A1 agents cannot manage the hub and restricted files stay private', async ({ request }) => {
    const agent = await as(request, 'agent');
    expect((await request.post(`${API}/document-hub/folders`, { ...agent, data: { name: 'x' } })).status()).toBe(403);
    expect((await request.post(`${API}/document-hub/requests`, { ...agent, data: { title: 'x', requestedFrom: [] } })).status()).toBe(403);
    const bId = await agentId(request, 'other');
    const up = await upload(request, { files: pdf(`restr-${uniq()}.pdf`), visibility: 'restricted', restrictedTo: JSON.stringify([bId]) });
    expect(up.status()).toBe(201);
    const id = (await up.json()).files[0]._id;
    expect((await request.get(`${API}/document-hub/files/${id}/download`, agent)).status()).toBe(403);
    expect((await request.get(`${API}/document-hub/files/${id}/download`, await as(request, 'other'))).status()).toBe(200);
    const mine = await (await request.get(`${API}/document-hub/files`, agent)).json();
    expect(mine.map((f: any) => f._id)).not.toContain(id);
  });
});
