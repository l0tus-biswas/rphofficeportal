import { test, expect, APIRequestContext } from '@playwright/test';
import { API, as } from './helpers/api';

const { USERS } = require('./helpers/users');
const X = `${API}/examfx`;
const ids: Record<string, string> = {};

async function userId(request: APIRequestContext, key: keyof typeof USERS) {
  if (ids[key]) return ids[key];
  const list = await (await request.get(`${API}/admin/users`, await as(request, 'admin'))).json();
  return (ids[key] = (Array.isArray(list) ? list : list.users).find((u: any) => u.email === USERS[key].email)._id);
}

const HEAD = 'Candidate,Email,Course,Status,Chapter Progress,Certificate Status,Total Hours,Registration,First Activity Date';
const csv = (...rows: string[]) => Buffer.from([HEAD, ...rows].join('\n'), 'utf-8');
const upload = async (request: APIRequestContext, file: any, who: 'admin' | 'agent' = 'admin') =>
  request.post(`${X}/upload-csv`, { ...(await as(request, who)), multipart: { file } });
const f = (buffer: Buffer, name = 'export.csv', mimeType = 'text/csv') => ({ name, mimeType, buffer });

test.describe('F21 ExamFX', () => {
  test('F21-I1 agents cannot use admin actions', async ({ request }) => {
    const agent = await as(request, 'agent');
    const id = await userId(request, 'child');
    expect((await request.put(`${X}/${id}`, { ...agent, data: { overallPercentComplete: 100 } })).status()).toBe(403);
    expect((await request.post(`${X}/${id}/link`, { ...agent, data: { examfxUserId: 'x' } })).status()).toBe(403);
    expect((await request.post(`${X}/${id}/sync`, agent)).status()).toBe(403);
    expect((await request.post(`${X}/sync/all`, agent)).status()).toBe(403);
    expect((await request.delete(`${X}/${id}`, agent)).status()).toBe(403);
    expect((await upload(request, f(csv('A,a@b.c,Course,Active,10%,,1 hr,,')), 'agent')).status()).toBe(403);
    expect((await request.get(`${X}/import-history`, agent)).status()).toBe(403);
    expect((await request.get(`${X}/config-status`, agent)).status()).toBe(403);
  });

  test('F21-I2 progress visibility follows the hierarchy', async ({ request }) => {
    const [agentId, childId, otherId] = [await userId(request, 'agent'), await userId(request, 'child'), await userId(request, 'other')];
    const agent = await as(request, 'agent');
    const child = await as(request, 'child');
    expect((await request.get(`${X}/${otherId}`, agent)).status(), 'peer').toBe(403);
    expect((await request.get(`${X}/${agentId}`, child)).status(), 'downline reading upline').toBe(403);
    expect((await request.get(`${X}/${childId}`, agent)).status(), 'upline reading downline').toBe(200);
    expect((await request.get(`${X}/${agentId}`, agent)).status(), 'self').toBe(200);

    for (const who of [agent, child]) {
      const list = JSON.stringify(await (await request.get(X, who)).json());
      expect(list, 'list never includes the other team').not.toContain(otherId);
      const summary = JSON.stringify(await (await request.get(`${X}/summary`, who)).json());
      expect(summary).not.toContain(otherId);
    }
  });

  test('F21-N1 malformed ids and bodies answer 4xx, never 5xx', async ({ request }) => {
    const admin = await as(request, 'admin');
    const id = await userId(request, 'other');
    for (const bad of ['zzz', '0'.repeat(24), '%00']) {
      for (const [m, p, data] of [['get', bad], ['put', bad, {}], ['post', `${bad}/link`, { examfxUserId: 'x' }], ['delete', bad]] as any[]) {
        const res = await (request as any)[m](`${X}/${p}`, { ...admin, ...(data ? { data } : {}) });
        expect(res.status(), `${m} ${bad}`).toBeLessThan(500);
      }
    }
    const put = (data: any) => request.put(`${X}/${id}`, { ...admin, data });
    for (const data of [
      { overallPercentComplete: 500 }, { overallPercentComplete: -1 }, { overallPercentComplete: 'abc' },
      { enrollmentStatus: 'hacked' }, { courses: 'x' }, { courses: [null] }, { courses: [{ courseName: 'x' }] },
      { practiceExams: 5 }, { enrollmentDate: 'garbage' }, { adminNotes: { $ne: 1 } }, { examfxUserId: { $ne: 1 } }
    ]) {
      const res = await put(data);
      expect(res.status(), JSON.stringify(data)).toBe(400);
    }
    expect((await request.post(`${X}/${id}/link`, { ...admin, data: {} })).status()).toBe(400);
    expect((await request.post(`${X}/${id}/link`, { ...admin, data: { examfxUserId: { $ne: 1 } } })).status()).toBe(400);
    expect((await request.post(`${X}/${id}/link`, { ...admin, data: { examfxEmail: ['a', 'b'] } })).status()).toBeLessThan(500);
  });

  test('F21-N2 one ExamFX account cannot be linked to two agents', async ({ request }) => {
    const admin = await as(request, 'admin');
    const stamp = `EFX-${Date.now()}`;
    const a = await request.post(`${X}/${await userId(request, 'other')}/link`, { ...admin, data: { examfxUserId: stamp } });
    expect(a.status()).toBe(200);
    const b = await request.post(`${X}/${await userId(request, 'child')}/link`, { ...admin, data: { examfxUserId: stamp } });
    expect(b.status(), 'webhooks and syncs would hit the wrong agent').toBe(409);
  });

  test('F21-W1 the webhook rejects unsigned requests and cannot be steered with operator objects', async ({ request }) => {
    const admin = await as(request, 'admin');
    const id = await userId(request, 'inactive');
    await request.delete(`${X}/${id}`, admin);
    await request.post(`${X}/${id}/link`, { ...admin, data: { examfxEmail: USERS.inactive.email } });

    const res = await request.post(`${X}/webhook`, { data: { event: 'student.completed', data: { email: USERS.inactive.email } } });
    expect([401, 403, 503], 'unsigned webhook must not be processed').toContain(res.status());
    const rec = await (await request.get(`${X}/${id}`, admin)).json();
    expect(rec.enrollmentStatus, 'record must be untouched').not.toBe('completed');

    const inj = await request.post(`${X}/webhook`, { data: { event: 'student.completed', data: { userId: { $ne: null } } } });
    expect(inj.status()).toBeLessThan(500);
    for (const body of [{}, { event: 'x' }, { event: 'x', data: 'str' }, [1, 2]]) {
      expect((await request.post(`${X}/webhook`, { data: body })).status(), JSON.stringify(body)).toBeLessThan(500);
    }
    const bad = await request.post(`${X}/webhook`, { headers: { 'x-examfx-signature': 'short' }, data: { event: 'student.completed', data: { email: USERS.inactive.email } } });
    expect(bad.status(), 'wrong signature').toBeLessThan(500);
  });

  test('F21-C1 CSV upload: rejects wrong type, empty, header-only, missing columns, oversize, with 4xx', async ({ request }) => {
    const cases: Array<[string, any]> = [
      ['exe', f(Buffer.from('MZ'), 'x.exe', 'application/x-msdownload')],
      ['html', f(Buffer.from('<b>'), 'x.html', 'text/html')],
      ['empty', f(Buffer.alloc(0))],
      ['header only', f(Buffer.from(HEAD))],
      ['missing columns', f(Buffer.from('Name,Foo\nA,B'))],
      ['binary junk', f(Buffer.from([0, 1, 2, 255, 254, 0, 10, 34, 34, 34]))],
      ['oversize', f(Buffer.alloc(11 * 1024 * 1024, 65))]
    ];
    for (const [label, file] of cases) {
      const res = await upload(request, file);
      expect(res.status(), `${label} -> ${res.status()}`).toBeGreaterThanOrEqual(400);
      expect(res.status(), `${label} must not be 5xx`).toBeLessThan(500);
    }
    const none = await request.post(`${X}/upload-csv`, { ...(await as(request, 'admin')), multipart: { note: 'x' } });
    expect(none.status()).toBe(400);
  });

  test('F21-C2 CSV import is idempotent, handles unicode, bad values and reports unmatched rows', async ({ request }) => {
    const admin = await as(request, 'admin');
    const id = await userId(request, 'other');
    const mail = USERS.other.email;
    const body = csv(
      `Zoë Ñandú 😀,${mail.toUpperCase()},Pre-Licensing Life “2026”,Active,45%,,2 hr 30 min,01-15-2026,02-30-2026`,
      `Nobody,nobody-${Date.now()}@example.com,Course,Active,1%,,,,`,
      `NoEmail,,Course,Active,1%,,,,`,
      `Dup,${mail},Pre-Licensing Life “2026”,Active,60%,,3 hr,01-15-2026,`
    );
    const first = await (await upload(request, f(body))).json();
    expect(first.unmatched.length).toBe(1);
    expect(first.errors.length).toBe(1);
    expect(first.matched).toBe(2);
    expect(first.created + first.updated, 'counters match saved rows').toBe(first.matched);

    const again = await (await upload(request, f(body))).json();
    expect(again.created).toBe(0);
    const rec = await (await request.get(`${X}/${id}`, admin)).json();
    expect(rec.courses.length, 'same course is upserted, not duplicated').toBe(1);
    expect(rec.courses[0].percentComplete).toBe(60);
    expect(rec.courses[0].courseName).toBe('Pre-Licensing Life “2026”');
  });

  test('F21-C3 invalid numbers in a row fail only that row and do not inflate the counters', async ({ request }) => {
    const mail = USERS.child.email;
    const res = await upload(request, f(csv(`C,${mail},Bad Course,Active,150%,,,,`, `C,${mail},,Active,5%,,,,`)));
    expect(res.status()).toBe(200);
    const out = await res.json();
    expect(out.errors.length).toBe(2);
    expect(out.created + out.updated, 'rows that failed to save are not counted as created/updated').toBe(0);
  });

  test('F21-S1 sync endpoints: 503 when unconfigured, 4xx for bad ids', async ({ request }) => {
    const admin = await as(request, 'admin');
    expect((await request.post(`${X}/${await userId(request, 'other')}/sync`, admin)).status()).toBe(503);
    expect((await request.post(`${X}/sync/all`, admin)).status()).toBe(503);
    const cfg = await (await request.get(`${X}/config-status`, admin)).json();
    expect(JSON.stringify(cfg)).not.toMatch(/secret|key/i.source === '' ? '' : /sk_|whsec/);
  });
});
