import { test, expect, APIRequestContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { API, as } from './helpers/api';

const { USERS } = require('./helpers/users');
const L = `${API}/licensing`;
const DIR = path.join(__dirname, '../backend/uploads/licensing');
const PDF = Buffer.from('%PDF-1.4\n%%EOF\n');
const ids: Record<string, string> = {};
const fileCount = () => (fs.existsSync(DIR) ? fs.readdirSync(DIR).length : 0);

async function userId(request: APIRequestContext, key: keyof typeof USERS) {
  if (ids[key]) return ids[key];
  const list = await (await request.get(`${API}/admin/users`, await as(request, 'admin'))).json();
  return (ids[key] = (Array.isArray(list) ? list : list.users).find((u: any) => u.email === USERS[key].email)._id);
}

test.describe('F20 licensing', () => {
  test('F20-I1 agents cannot read or change another agent\'s licensing, nor their own approval', async ({ request }) => {
    const [agentId, childId, otherId] = [await userId(request, 'agent'), await userId(request, 'child'), await userId(request, 'other')];
    const agent = await as(request, 'agent');
    const child = await as(request, 'child');
    const body = { checklistItem: 'stateAppointment', data: { approved: true } };

    expect((await request.get(`${L}/${otherId}`, agent)).status(), 'peer progress').toBe(403);
    expect((await request.get(`${L}/${agentId}`, child)).status(), 'downline reading upline').toBe(403);
    expect((await request.put(`${L}/${agentId}/checklist`, { ...agent, data: body })).status(), 'self approval').toBe(403);
    expect((await request.put(`${L}/${agentId}/checklist`, { ...child, data: body })).status(), 'downline editing upline').toBe(403);
    expect((await request.put(`${L}/${otherId}/notes`, { ...agent, data: { adminNotes: 'x' } })).status()).toBe(403);
    expect((await request.post(`${L}/${childId}`, agent)).status(), 'create is admin only').toBe(403);
    expect((await request.get(`${L}/countdown/all`, agent)).status()).toBe(403);
    // an upline CAN manage the downline
    expect((await request.get(`${L}/${childId}`, agent)).status()).toBe(200);
  });

  test('F20-I2 the downline list only ever contains the requester\'s downline', async ({ request }) => {
    const res = await request.get(`${L}/downline`, await as(request, 'agent'));
    expect(res.status()).toBe(200);
    const text = JSON.stringify(await res.json());
    expect(text).toContain(USERS.child.email);
    expect(text).not.toContain(USERS.other.email);
    expect(text).not.toContain(USERS.agent.email);
  });

  test('F20-N1 checklist update with a missing or hostile body answers 4xx, never 5xx', async ({ request }) => {
    const admin = await as(request, 'admin');
    const id = await userId(request, 'other');
    const put = (data: any) => request.put(`${L}/${id}/checklist`, { ...admin, data });
    for (const item of ['preLicenseCourse', 'stateExam', 'fingerprinting', 'diceApplication', 'stateAppointment']) {
      const res = await put({ checklistItem: item });
      expect(res.status(), `${item} without data`).toBeLessThan(500);
    }
    const cases: Array<[string, any]> = [
      ['data is a string', { checklistItem: 'preLicenseCourse', data: 'x' }],
      ['data is an array', { checklistItem: 'preLicenseCourse', data: [1] }],
      ['operator object as flag', { checklistItem: 'stateAppointment', data: { approved: { $ne: 1 } } }],
      ['invalid date', { checklistItem: 'stateExam', data: { scheduled: true, scheduledDate: 'not a date' } }],
      ['prototype checklistItem', { checklistItem: '__proto__', data: { a: 1 } }],
      ['function-named checklistItem', { checklistItem: 'toString', data: { a: 1 } }],
      ['bad reschedule outcome', { checklistItem: 'stateExam', action: 'addReschedule', data: { outcome: 'Hacked' } }],
      ['bad reschedule date', { checklistItem: 'stateExam', action: 'addReschedule', data: { date: 'nope' } }]
    ];
    for (const [label, data] of cases) {
      const res = await put(data);
      expect(res.status(), `${label} -> ${res.status()}`).toBeLessThan(500);
    }
    expect((await request.put(`${L}/zzz/checklist`, { ...admin, data: {} })).status()).toBeLessThan(500);
    expect((await request.put(`${L}/${'0'.repeat(24)}/checklist`, { ...admin, data: {} })).status()).toBe(404);
  });

  test('F20-N2 an unknown checklist item must not corrupt or crash', async ({ request }) => {
    const admin = await as(request, 'admin');
    const id = await userId(request, 'other');
    const res = await request.put(`${L}/${id}/checklist`, { ...admin, data: { checklistItem: 'toString', data: { x: 1 } } });
    expect(res.status()).toBeLessThan(500);
    const after = await (await request.get(`${L}/${id}`, admin)).json();
    expect(after.checklist).toBeTruthy();
  });

  test('F20-N3 notes: non-string value is a 400', async ({ request }) => {
    const admin = await as(request, 'admin');
    const id = await userId(request, 'other');
    expect((await request.put(`${L}/${id}/notes`, { ...admin, data: { adminNotes: { $ne: 1 } } })).status()).toBe(400);
    expect((await request.put(`${L}/${id}/notes`, { ...admin, data: { adminNotes: 'ok ✓ ünï' } })).status()).toBe(200);
  });

  test('F20-N4 create: validation and double submit', async ({ request }) => {
    const admin = await as(request, 'admin');
    const id = await userId(request, 'inactive');
    expect((await request.post(`${L}/${id}`, { ...admin, data: { enrollmentDate: 'garbage' } })).status()).toBe(400);
    const first = await request.post(`${L}/${id}`, { ...admin, data: {} });
    expect([201, 400]).toContain(first.status());
    expect((await request.post(`${L}/${id}`, { ...admin, data: {} })).status(), 'second create is refused').toBe(400);
    expect((await request.post(`${L}/zzz`, { ...admin, data: {} })).status()).toBe(400);
  });

  test('F20-H1 reschedule history: attempts follow the history, edits and deletes keep them in sync', async ({ request }) => {
    const admin = await as(request, 'admin');
    const id = await userId(request, 'other');
    const add = (data: any) => request.put(`${L}/${id}/checklist`, { ...admin, data: { checklistItem: 'fingerprinting', action: 'addReschedule', data } });
    const a = await (await add({ date: '2026-03-01', outcome: 'Scheduled' })).json();
    const before = a.checklist.fingerprinting.scheduleHistory.length;
    const b = await (await add({ date: '2026-03-08', outcome: 'Rescheduled' })).json();
    expect(b.checklist.fingerprinting.attempts).toBe(before + 1);
    const entry = b.checklist.fingerprinting.scheduleHistory.slice(-1)[0];
    const hist = `${L}/${id}/checklist/fingerprinting/history/${entry._id}`;
    expect((await request.put(hist, { ...admin, data: { outcome: 'Hacked' } })).status()).toBe(400);
    expect((await request.put(`${L}/${id}/checklist/bogus/history/${entry._id}`, { ...admin, data: {} })).status()).toBe(400);
    expect((await request.put(`${L}/${id}/checklist/fingerprinting/history/zzz`, { ...admin, data: {} })).status()).toBeLessThan(500);
    const del = await (await request.delete(hist, admin)).json();
    expect(del.checklist.fingerprinting.attempts).toBe(before);
    expect((await request.delete(hist, admin)).status(), 'second delete').toBe(404);
  });

  test('F20-H2 final approval licenses the agent once; unchecking reverts', async ({ request }) => {
    const admin = await as(request, 'admin');
    const id = await userId(request, 'other');
    const put = (approved: boolean) => request.put(`${L}/${id}/checklist`, { ...admin, data: { checklistItem: 'stateAppointment', data: { approved } } });
    const on = await (await put(true)).json();
    expect(on.isLicensed).toBe(true);
    expect((await (await put(true)).json()).isLicensed).toBe(true);
    const off = await (await put(false)).json();
    expect(off.isLicensed).toBe(false);
    expect(off.licenseObtainedDate).toBeNull();
  });

  test('F20-U1 upload: type and size rules answer 4xx and leave no file behind', async ({ request }) => {
    const admin = await as(request, 'admin');
    const id = await userId(request, 'other');
    const url = (item = 'preLicenseCourse') => `${L}/${id}/upload/${item}`;
    const up = (file: any, item?: string) => request.post(url(item), { ...admin, multipart: { document: file } });
    const before = fileCount();

    expect((await request.post(url(), { ...admin, multipart: { note: 'x' } })).status(), 'no file').toBe(400);
    for (const [label, file] of Object.entries({
      exe: { name: 'x.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') },
      html: { name: 'x.html', mimeType: 'text/html', buffer: Buffer.from('<script>1</script>') },
      pdfx: { name: 'x.pdfx', mimeType: 'application/pdf', buffer: PDF },
      docm: { name: 'x.docm', mimeType: 'application/vnd.ms-word.document.macroenabled.12', buffer: PDF },
      big: { name: 'big.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(11 * 1024 * 1024, 1) }
    }) as Array<[string, any]>) {
      const res = await up(file);
      expect(res.status(), `${label} -> ${res.status()}`).toBeGreaterThanOrEqual(400);
      expect(res.status(), `${label} must not be a 5xx`).toBeLessThan(500);
    }
    expect(fileCount(), 'rejected uploads leave no file').toBe(before);

    const ok = await up({ name: 'Licencia “2026” 😀.pdf', mimeType: 'application/pdf', buffer: PDF });
    expect(ok.status()).toBe(200);
    const doc = (await ok.json()).document;
    expect(doc.filename).toBe('Licencia “2026” 😀.pdf');
    expect(fileCount()).toBe(before + 1);
  });

  test('F20-U2 upload to an invalid item or unknown agent leaves no orphan file', async ({ request }) => {
    const admin = await as(request, 'admin');
    const id = await userId(request, 'other');
    const before = fileCount();
    const file = { name: 'a.pdf', mimeType: 'application/pdf', buffer: PDF };
    for (const item of ['bogus', 'toString', 'constructor']) {
      const res = await request.post(`${L}/${id}/upload/${item}`, { ...admin, multipart: { document: file } });
      expect(res.status(), item).toBe(400);
    }
    const res = await request.post(`${L}/${'0'.repeat(24)}/upload/preLicenseCourse`, { ...admin, multipart: { document: file } });
    expect(res.status()).toBe(404);
    expect(fileCount(), 'rejected requests must not leave files on disk').toBe(before);
  });

  test('F20-U3 agents cannot upload for themselves, peers or uplines', async ({ request }) => {
    const file = { name: 'a.pdf', mimeType: 'application/pdf', buffer: PDF };
    const before = fileCount();
    for (const [who, target] of [['agent', 'agent'], ['agent', 'other'], ['child', 'agent']] as const) {
      const res = await request.post(`${L}/${await userId(request, target)}/upload/preLicenseCourse`, { ...(await as(request, who)), multipart: { document: file } });
      expect(res.status(), `${who} -> ${target}`).toBe(403);
    }
    expect(fileCount()).toBe(before);
  });

  test('F20-D1 list filters tolerate hostile query strings', async ({ request }) => {
    const admin = await as(request, 'admin');
    for (const q of ['isLicensed[$ne]=x', 'isLicensed=%00', 'isLicensed[]=true&isLicensed[]=false']) {
      expect((await request.get(`${L}?${q}`, admin)).status(), q).toBeLessThan(500);
      expect((await request.get(`${L}/downline?${q}`, admin)).status(), q).toBeLessThan(500);
    }
  });
});
