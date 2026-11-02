import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { API, as } from './helpers/api';

const B = `${API}/broadcasts`;
const N = `${API}/notifications`;
const IMG_DIR = path.join(__dirname, '..', 'backend', 'uploads', 'broadcast-images');
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082', 'hex');
const uniq = (p: string) => `${p} ${Date.now()}${Math.floor(Math.random() * 1e5)}`;
const OID = '0'.repeat(24);
const imgCount = () => (fs.existsSync(IMG_DIR) ? fs.readdirSync(IMG_DIR).length : 0);

async function newBroadcast(request: any, over: Record<string, any> = {}) {
  const res = await request.post(B, { ...(await as(request, 'admin')), data: { title: uniq('E2E broadcast'), message: '<p>Hello team</p>', ...over } });
  expect(res.status(), 'create broadcast ' + (await res.text())).toBe(201);
  return (await res.json()).broadcast;
}
async function notifications(request: any, who: 'agent' | 'other') {
  return (await (await request.get(`${N}?limit=100`, await as(request, who))).json()).notifications as any[];
}

test.describe('F33 broadcasts', () => {
  test('F33-H1 admin sends, agent receives, reads once, unread count drops', async ({ request }) => {
    const agent = await as(request, 'agent');
    const before = (await (await request.get(`${B}/unread-count`, agent)).json()).unreadCount;
    const b = await newBroadcast(request);
    expect((await (await request.get(`${B}/unread-count`, agent)).json()).unreadCount).toBe(before + 1);
    const list = await (await request.get(`${B}?limit=100`, agent)).json();
    expect(list.broadcasts.find((x: any) => x._id === b._id).isRead).toBe(false);
    expect((await request.get(`${B}/${b._id}`, agent)).status()).toBe(200);
    expect((await request.get(`${B}/${b._id}`, agent)).status(), 'read twice is idempotent').toBe(200);
    expect((await (await request.get(`${B}/unread-count`, agent)).json()).unreadCount).toBe(before);
    expect((await notifications(request, 'agent')).filter((n) => n.data?.broadcastId === b._id)).toHaveLength(1);
  });

  test('F33-I1 agents cannot create, edit, delete, notify, resend or upload', async ({ request }) => {
    const b = await newBroadcast(request);
    const agent = await as(request, 'agent');
    expect((await request.post(B, { ...agent, data: { title: 'x', message: 'y' } })).status()).toBe(403);
    expect((await request.put(`${B}/${b._id}`, { ...agent, data: { title: 'x' } })).status()).toBe(403);
    expect((await request.delete(`${B}/${b._id}`, agent)).status()).toBe(403);
    expect((await request.post(`${B}/${b._id}/notify`, agent)).status()).toBe(403);
    expect((await request.post(`${B}/${b._id}/resend`, agent)).status()).toBe(403);
    expect((await request.get(`${B}/admin/all`, agent)).status()).toBe(403);
    expect((await request.post(`${N}/broadcast`, { ...agent, data: { title: 'x', message: 'y' } })).status()).toBe(403);
    expect((await request.post(`${B}/${b._id}/image`, { ...agent, multipart: { image: { name: 'a.png', mimeType: 'image/png', buffer: PNG } } })).status()).toBe(403);
  });

  test('F33-I2 agents cannot open inactive or admin-only broadcasts by id', async ({ request }) => {
    const admin = await as(request, 'admin');
    const agent = await as(request, 'agent');
    const adminOnly = await newBroadcast(request, { targetRoles: ['admin'] });
    expect((await request.get(`${B}/${adminOnly._id}`, agent)).status(), 'targeted at admins only').toBe(404);
    const hidden = await newBroadcast(request);
    await request.put(`${B}/${hidden._id}`, { ...admin, data: { isActive: false } });
    expect((await request.get(`${B}/${hidden._id}`, agent)).status(), 'inactive').toBe(404);
    expect((await request.get(`${B}/${hidden._id}`, admin)).status()).toBe(200);
  });

  test('F33-N1 create/update validation answers 4xx, never 5xx', async ({ request }) => {
    const admin = await as(request, 'admin');
    const b = await newBroadcast(request);
    const m = '<p>ok</p>';
    const cases: Array<[string, any]> = [
      ['no title', await request.post(B, { ...admin, data: { message: m } })],
      ['title object', await request.post(B, { ...admin, data: { title: { $ne: 1 }, message: m } })],
      ['title array', await request.post(B, { ...admin, data: { title: ['a'], message: m } })],
      ['empty message', await request.post(B, { ...admin, data: { title: 'abc', message: '<p><br></p>' } })],
      ['message object', await request.post(B, { ...admin, data: { title: 'abc', message: { a: 1 } } })],
      ['link object', await request.post(B, { ...admin, data: { title: 'abc', message: m, link: { a: 1 } } })],
      ['link javascript:', await request.post(B, { ...admin, data: { title: 'abc', message: m, link: 'javascript:alert(1)' } })],
      ['link data:', await request.post(B, { ...admin, data: { title: 'abc', message: m, link: 'data:text/html,<script>1</script>' } })],
      ['bad role', await request.post(B, { ...admin, data: { title: 'abc', message: m, targetRoles: ['root'] } })],
      ['huge title', await request.post(B, { ...admin, data: { title: 'x'.repeat(5000), message: m } })],
      ['put title object', await request.put(`${B}/${b._id}`, { ...admin, data: { title: { a: 1 } } })],
      ['put link object', await request.put(`${B}/${b._id}`, { ...admin, data: { link: { a: 1 } } })],
      ['put link javascript:', await request.put(`${B}/${b._id}`, { ...admin, data: { link: 'javascript:alert(1)' } })],
      ['put malformed id', await request.put(`${B}/junk`, { ...admin, data: { title: 'abc' } })],
      ['get malformed id', await request.get(`${B}/junk`, admin)],
      ['delete unknown id', await request.delete(`${B}/${OID}`, admin)],
      ['notify malformed id', await request.post(`${B}/junk/notify`, admin)],
      ['resend unknown id', await request.post(`${B}/${OID}/resend`, admin)],
      ['legacy no title', await request.post(`${N}/broadcast`, { ...admin, data: { message: m } })],
      ['legacy link javascript:', await request.post(`${N}/broadcast`, { ...admin, data: { title: 'abc', message: m, link: 'javascript:alert(1)' } })],
      ['legacy title object', await request.post(`${N}/broadcast`, { ...admin, data: { title: { a: 1 }, message: m } })],
      ['legacy targetRoles bad', await request.post(`${N}/broadcast`, { ...admin, data: { title: 'abc', message: m, targetRoles: ['root'] } })]
    ];
    for (const [label, res] of cases) {
      expect(res.status(), `${label} -> ${res.status()}`).toBeGreaterThanOrEqual(400);
      expect(res.status(), `${label} -> ${res.status()}`).toBeLessThan(500);
    }
    for (const q of ['page=-1', 'limit=-3', 'page=abc', 'limit=100000']) {
      expect((await request.get(`${B}?${q}`, admin)).status(), q).toBeLessThan(500);
      expect((await request.get(`${B}/admin/all?${q}`, admin)).status(), q).toBeLessThan(500);
      expect((await request.get(`${N}?${q}`, admin)).status(), q).toBeLessThan(500);
    }
  });

  test('F33-X1 rich text is sanitised on store and in the notification text', async ({ request }) => {
    const b = await newBroadcast(request, { message: '<p onclick="x()">Hi<script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">l</a></p>' });
    expect(b.message).not.toMatch(/<script|onerror|onclick|javascript:|<img/i);
    const n = (await notifications(request, 'agent')).find((x) => x.data?.broadcastId === b._id);
    expect(n.message).not.toMatch(/[<>]/);
    const put = await request.put(`${B}/${b._id}`, { ...(await as(request, 'admin')), data: { message: '<svg onload=alert(1)><b>bold</b>' } });
    expect((await put.json()).broadcast.message).not.toMatch(/onload|<svg/i);
  });

  test('F33-X2 title is stored as plain text and the link must be http(s) or relative', async ({ request }) => {
    const admin = await as(request, 'admin');
    const res = await request.post(B, { ...admin, data: { title: '<img src=x onerror=alert(1)>Title', message: '<p>m</p>', link: '/dashboard' } });
    expect(res.status()).toBe(201);
    const b = (await res.json()).broadcast;
    expect(b.title).not.toMatch(/<[a-z]/i);
    expect(b.link).toBe('/dashboard');
  });

  test('F33-S1 delete removes the broadcast, its notifications and its image file', async ({ request }) => {
    const admin = await as(request, 'admin');
    const b = await newBroadcast(request);
    const up = await request.post(`${B}/${b._id}/image`, { ...admin, multipart: { image: { name: 'a.png', mimeType: 'image/png', buffer: PNG } } });
    expect(up.status()).toBe(200);
    const file = path.join(IMG_DIR, path.basename((await up.json()).broadcast.image));
    expect(fs.existsSync(file)).toBe(true);
    expect((await request.delete(`${B}/${b._id}`, admin)).status()).toBe(200);
    expect(fs.existsSync(file), 'image removed with the broadcast').toBe(false);
    expect((await notifications(request, 'agent')).filter((n) => n.data?.broadcastId === b._id)).toHaveLength(0);
    expect((await request.get(`${B}/${b._id}`, admin)).status()).toBe(404);
    expect((await request.delete(`${B}/${b._id}`, admin)).status()).toBe(404);
  });

  test('F33-S2 resend only reaches users who do not have it yet (idempotent)', async ({ request }) => {
    const admin = await as(request, 'admin');
    const b = await newBroadcast(request);
    const before = (await notifications(request, 'agent')).filter((n) => n.data?.broadcastId === b._id).length;
    expect((await request.post(`${B}/${b._id}/resend`, admin)).status()).toBe(200);
    expect((await notifications(request, 'agent')).filter((n) => n.data?.broadcastId === b._id).length).toBe(before);
  });

  test('F33-U1 image upload: rules, no orphan files, safe extension', async ({ request }) => {
    const admin = await as(request, 'admin');
    const b = await newBroadcast(request);
    const up = (file: any, id = b._id) => request.post(`${B}/${id}/image`, { ...admin, multipart: { image: file } });
    const start = imgCount();
    expect((await up({ name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') })).status(), 'text').toBe(400);
    expect((await up({ name: 'a.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') })).status(), 'svg').toBe(400);
    expect((await up({ name: 'a.png', mimeType: 'image/png', buffer: Buffer.alloc(6 * 1024 * 1024, 1) })).status(), '6 MB').toBe(400);
    expect((await up({ name: 'a.png', mimeType: 'image/png', buffer: Buffer.alloc(0) })).status(), 'empty').toBe(400);
    expect((await up({ name: 'a.png', mimeType: 'image/png', buffer: Buffer.from('<html><script>alert(1)</script></html>') })).status(), 'html as png').toBe(400);
    expect((await up({ name: 'a.png', mimeType: 'image/png', buffer: PNG }, OID)).status(), 'unknown broadcast').toBe(404);
    expect((await up({ name: 'a.png', mimeType: 'image/png', buffer: PNG }, 'junk')).status(), 'malformed id').toBe(400);
    expect(imgCount(), 'rejected uploads leave no files').toBe(start);
    const ok = await up({ name: 'evil.html', mimeType: 'image/png', buffer: PNG });
    expect(ok.status()).toBe(200);
    expect((await ok.json()).broadcast.image, 'public folder must not serve client-chosen extensions').toMatch(/\.png$/);
  });

  test('F33-U2 replacing the image deletes the old file only after the new one is saved', async ({ request }) => {
    const admin = await as(request, 'admin');
    const b = await newBroadcast(request);
    const put = async () => (await (await request.post(`${B}/${b._id}/image`, { ...admin, multipart: { image: { name: 'a.png', mimeType: 'image/png', buffer: PNG } } })).json()).broadcast.image as string;
    const one = await put();
    const two = await put();
    expect(fs.existsSync(path.join(IMG_DIR, path.basename(one)))).toBe(false);
    expect(fs.existsSync(path.join(IMG_DIR, path.basename(two)))).toBe(true);
    expect((await request.delete(`${B}/${b._id}/image`, admin)).status()).toBe(200);
    expect(fs.existsSync(path.join(IMG_DIR, path.basename(two)))).toBe(false);
  });

  test('F33-U3 legacy multipart broadcast: bad image answers 400 and leaves nothing', async ({ request }) => {
    const admin = await as(request, 'admin');
    const start = imgCount();
    const res = await request.post(`${N}/broadcast`, { ...admin, multipart: { title: 'abc', message: '<p>m</p>', image: { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('x') } } });
    expect(res.status()).toBe(400);
    const bad = await request.post(`${N}/broadcast`, { ...admin, multipart: { title: '', message: '<p>m</p>', image: { name: 'a.png', mimeType: 'image/png', buffer: PNG } } });
    expect(bad.status()).toBe(400);
    expect(imgCount()).toBe(start);
  });
});

test.describe('F33 notifications', () => {
  test('F33-P1 a user cannot read, mark or delete another user\'s notification', async ({ request }) => {
    await newBroadcast(request);
    const mine = (await notifications(request, 'agent'))[0];
    const other = await as(request, 'other');
    expect((await request.put(`${N}/${mine._id}/read`, other)).status()).toBe(404);
    expect((await request.delete(`${N}/${mine._id}`, other)).status()).toBe(404);
    expect((await notifications(request, 'other')).map((n) => n._id)).not.toContain(mine._id);
    expect((await request.put(`${N}/junk/read`, other)).status()).toBe(400);
    expect((await request.delete(`${N}/junk`, other)).status()).toBe(400);
    const still = (await notifications(request, 'agent')).find((n) => n._id === mine._id);
    expect(still, 'untouched by the other user').toBeTruthy();
    expect((await request.get(N)).status()).toBe(401);
  });

  test('F33-P2 mark read is idempotent; mark-all-read and delete-read only touch own rows', async ({ request }) => {
    await newBroadcast(request);
    const agent = await as(request, 'agent');
    const other = await as(request, 'other');
    const unreadOther = (await (await request.get(`${N}/unread-count`, other)).json()).count;
    const n = (await notifications(request, 'agent')).find((x) => !x.isRead)!;
    expect((await request.put(`${N}/${n._id}/read`, agent)).status()).toBe(200);
    expect((await request.put(`${N}/${n._id}/read`, agent)).status()).toBe(200);
    expect((await request.put(`${N}/mark-all-read`, agent)).status()).toBe(200);
    expect((await (await request.get(`${N}/unread-count`, agent)).json()).count).toBe(0);
    expect((await (await request.get(`${N}/unread-count`, other)).json()).count, 'other user unaffected').toBe(unreadOther);
    expect((await request.delete(N, agent)).status()).toBe(200);
    expect((await notifications(request, 'agent')).every((x) => !x.isRead)).toBe(true);
    expect((await notifications(request, 'other')).length).toBeGreaterThan(0);
  });

  test('F33-P3 preferences: valid update persists; unknown / hostile keys are 400', async ({ request }) => {
    const agent = await as(request, 'agent');
    const ok = await request.put(`${N}/preferences`, { ...agent, data: { preferences: { admin_broadcast: { inApp: true, email: false } }, muteAllEmails: false } });
    expect(ok.status()).toBe(200);
    const got = await (await request.get(`${N}/preferences`, agent)).json();
    expect(got.preferences.preferences.admin_broadcast.email).toBe(false);
    await request.put(`${N}/preferences`, { ...agent, data: { preferences: { admin_broadcast: { inApp: true, email: true } } } });
    for (const data of [
      { preferences: { 'a.b': { inApp: false } } },
      { preferences: { $where: { inApp: false } } },
      { preferences: { __proto__x: { inApp: false } } },
      { preferences: { not_a_real_type: { inApp: false } } },
      { preferences: { admin_broadcast: { inApp: 'no' } } },
      { preferences: [1, 2] },
      { preferences: 'x' },
      { muteAllEmails: 'yes' }
    ]) {
      const res = await request.put(`${N}/preferences`, { ...agent, data });
      expect(res.status(), JSON.stringify(data)).toBeGreaterThanOrEqual(400);
      expect(res.status(), JSON.stringify(data)).toBeLessThan(500);
    }
    const huge: Record<string, any> = {};
    for (let i = 0; i < 500; i++) huge[`k${i}`] = { inApp: false };
    expect((await request.put(`${N}/preferences`, { ...agent, data: { preferences: huge } })).status(), 'junk keys are not stored').toBeGreaterThanOrEqual(400);
  });

  test('F33-P4 an opted-out type is not delivered in-app', async ({ request }) => {
    const other = await as(request, 'other');
    await request.put(`${N}/preferences`, { ...other, data: { preferences: { admin_broadcast: { inApp: false, email: false } } } });
    const b = await newBroadcast(request);
    expect((await notifications(request, 'other')).filter((n) => n.data?.broadcastId === b._id)).toHaveLength(0);
    await request.put(`${N}/preferences`, { ...other, data: { preferences: { admin_broadcast: { inApp: true, email: true } } } });
  });

  test('F33-Q1 notification list filters: type and unreadOnly, hostile values are safe', async ({ request }) => {
    const agent = await as(request, 'agent');
    for (const q of ['type[$ne]=x', 'type[]=a&type[]=b', 'unreadOnly=maybe', 'type=%00']) {
      expect((await request.get(`${N}?${q}`, agent)).status(), q).toBeLessThan(500);
    }
    const onlyBroadcast = await (await request.get(`${N}?type=admin_broadcast`, agent)).json();
    expect(onlyBroadcast.notifications.every((n: any) => n.type === 'admin_broadcast')).toBe(true);
    const capped = await (await request.get(`${N}?limit=1000000`, agent)).json();
    expect(capped.pagination.limit).toBeLessThanOrEqual(100);
  });
});
