import { test, expect, APIRequestContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { API, as } from './helpers/api';

const { USERS } = require('./helpers/users');
const OB = `${API}/onboarding`;
const ROOT = path.join(__dirname, '../backend/uploads/onboarding');
const PDF = Buffer.from('%PDF-1.4\n%%EOF\n');
const pdf = (name = 'doc.pdf') => ({ name, mimeType: 'application/pdf', buffer: PDF });
const ids: Record<string, string> = {};

async function userId(request: APIRequestContext, key: keyof typeof USERS) {
  if (ids[key]) return ids[key];
  const list = await (await request.get(`${API}/admin/users`, await as(request, 'admin'))).json();
  return (ids[key] = (Array.isArray(list) ? list : list.users).find((u: any) => u.email === USERS[key].email)._id);
}
const countFiles = () => (fs.existsSync(ROOT) ? fs.readdirSync(ROOT).reduce((n, d) => n + (fs.statSync(path.join(ROOT, d)).isDirectory() ? fs.readdirSync(path.join(ROOT, d)).length : 1), 0) : 0);

test.describe('F13 onboarding steps (agent PDF upload and admin review)', () => {
  test('F13-H1 agent uploads two documents and can download them back', async ({ request }) => {
    const res = await request.post(`${OB}/me/upload`, { ...(await as(request, 'agent')), multipart: { stateLicense: pdf('lic.pdf'), driversLicense: pdf('dl.pdf') } });
    expect(res.status()).toBe(200);
    expect((await res.json()).updatedSteps.sort()).toEqual(['driversLicense', 'stateLicense']);
    const dl = await request.get(`${OB}/me/files/stateLicense`, await as(request, 'agent'));
    expect(dl.status()).toBe(200);
    expect(Buffer.compare(await dl.body(), PDF)).toBe(0);
  });

  test('F13-H2 admin uploads on behalf of an agent; admin and agent can both download it', async ({ request }) => {
    const agentId = await userId(request, 'child');
    const up = await request.post(`${OB}/users/${agentId}/upload`, { ...(await as(request, 'admin')), multipart: { cmsCertificate: pdf('cms.pdf') } });
    expect(up.status()).toBe(200);
    const byAdmin = await request.get(`${OB}/users/${agentId}/files/cmsCertificate`, await as(request, 'admin'));
    expect(byAdmin.status(), 'admin downloads what they uploaded for the agent').toBe(200);
    const byAgent = await request.get(`${OB}/me/files/cmsCertificate`, await as(request, 'child'));
    expect(byAgent.status(), 'agent downloads the file uploaded for them').toBe(200);
    expect(Buffer.compare(await byAgent.body(), PDF)).toBe(0);
  });

  test('F13-I1 an agent only ever sees their own files; admin routes are closed to agents', async ({ request }) => {
    await request.post(`${OB}/me/upload`, { ...(await as(request, 'agent')), multipart: { fingerprintBackground: pdf() } });
    expect((await request.get(`${OB}/me/files/fingerprintBackground`, await as(request, 'other'))).status(), 'other agent has no such file').toBe(404);
    const agentId = await userId(request, 'agent');
    const other = await as(request, 'other');
    expect((await request.get(`${OB}/users/${agentId}`, other)).status()).toBe(403);
    expect((await request.get(`${OB}/users/${agentId}/files/fingerprintBackground`, other)).status()).toBe(403);
    expect((await request.post(`${OB}/users/${agentId}/upload`, { ...other, multipart: { stateLicense: pdf() } })).status()).toBe(403);
    expect((await request.patch(`${OB}/users/${agentId}/steps/stateLicense/status`, { ...other, data: { status: 'approved' } })).status()).toBe(403);
  });

  test('F13-N1 invalid uploads answer 4xx, never 5xx', async ({ request }) => {
    const agent = await as(request, 'agent');
    const cases: Array<[string, Record<string, any>, number[]]> = [
      ['no files', {}, [400]],
      ['image instead of pdf', { stateLicense: { name: 'a.png', mimeType: 'image/png', buffer: Buffer.from('x') } }, [400, 415]],
      ['html declared as pdf', { stateLicense: { name: 'page.html', mimeType: 'application/pdf', buffer: Buffer.from('<script>1</script>') } }, [400, 415]],
      ['unknown field', { somethingElse: pdf() }, [400]]
    ];
    for (const [label, multipart, expected] of cases) {
      const res = await request.post(`${OB}/me/upload`, { ...agent, multipart });
      expect(expected, `${label} -> ${res.status()}`).toContain(res.status());
    }
  });

  test('F13-N2 oversize file (11 MB) is rejected with a 4xx', async ({ request }) => {
    const res = await request.post(`${OB}/me/upload`, { ...(await as(request, 'agent')), multipart: { stateLicense: { name: 'big.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(11 * 1024 * 1024, 1) } } });
    expect([400, 413]).toContain(res.status());
  });

  test('F13-N3 uploading for a user that does not exist is refused and stores nothing', async ({ request }) => {
    const before = countFiles();
    const res = await request.post(`${OB}/users/${'0'.repeat(24)}/upload`, { ...(await as(request, 'admin')), multipart: { stateLicense: pdf() } });
    expect([400, 404]).toContain(res.status());
    expect(countFiles()).toBe(before);
  });

  test('F13-N4 step review: validation and permissions', async ({ request }) => {
    const agentId = await userId(request, 'agent');
    await request.post(`${OB}/me/upload`, { ...(await as(request, 'agent')), multipart: { stateLicense: pdf() } });
    const admin = await as(request, 'admin');
    const patch = (step: string, data: any, who = admin) => request.patch(`${OB}/users/${agentId}/steps/${step}/status`, { ...who, data });
    expect((await patch('stateLicense', { status: 'bogus' })).status()).toBe(400);
    expect((await patch('stateLicense', {})).status()).toBe(400);
    expect((await patch('notAStep', { status: 'approved' })).status()).toBe(400);
    expect((await patch('stateLicense', { status: 'approved' }, await as(request, 'agent'))).status()).toBe(403);
    const ok = await patch('stateLicense', { status: 'approved', comment: 'ok' });
    expect(ok.status()).toBe(200);
    const mine = await (await request.get(`${OB}/me`, await as(request, 'agent'))).json();
    expect(mine.onboarding.steps.stateLicense.status).toBe('approved');
  });

  test('F13-N5 notes: empty rejected, agents cannot add', async ({ request }) => {
    const agentId = await userId(request, 'agent');
    expect((await request.post(`${OB}/users/${agentId}/notes`, { ...(await as(request, 'admin')), data: { message: '   ' } })).status()).toBe(400);
    expect((await request.post(`${OB}/users/${agentId}/notes`, { ...(await as(request, 'agent')), data: { message: 'x' } })).status()).toBe(403);
  });
});
