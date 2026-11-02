import { test, expect } from '@playwright/test';
import { API, as, carrierId } from './helpers/api';

const uniq = () => `E2E ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function submit(request: any, who: 'agent' | 'other' | 'child', overrides: Record<string, unknown> = {}) {
  const body = {
    clientName: uniq(),
    productSold: 'Term Life',
    carrier: await carrierId(request),
    premiumAmount: 123.45,
    ...overrides
  };
  const res = await request.post(`${API}/production`, { ...(await as(request, who)), data: body });
  return { res, body };
}

test.describe('F03 production submissions', () => {
  test('F03-H1 agent creates a submission and sees it in their list', async ({ request }) => {
    const { res, body } = await submit(request, 'agent');
    expect(res.status()).toBe(201);
    const created = await res.json();
    expect(created.status).toBe('Submitted');
    expect(created.agent.email).toBe('lotushotmail111@gmail.com');
    const list = await (await request.get(`${API}/production`, await as(request, 'agent'))).json();
    const rows = Array.isArray(list) ? list : list.submissions;
    expect(rows.map((r: any) => r.clientName)).toContain(body.clientName);
  });

  test('F03-I1 another agent cannot read, edit or delete my submission', async ({ request }) => {
    const created = await (await submit(request, 'agent')).res.json();
    const other = await as(request, 'other');
    expect((await request.get(`${API}/production/${created._id}`, other)).status()).toBe(403);
    expect((await request.put(`${API}/production/${created._id}`, { ...other, data: { clientName: 'hijack' } })).status()).toBe(403);
    expect((await request.delete(`${API}/production/${created._id}`, other)).status()).toBe(403);
    const mine = await (await request.get(`${API}/production/${created._id}`, await as(request, 'agent'))).json();
    expect(mine.clientName).toBe(created.clientName);
  });

  test('F03-I2 another agent’s list never contains my submission', async ({ request }) => {
    const { body } = await submit(request, 'agent');
    const list = await (await request.get(`${API}/production`, await as(request, 'other'))).json();
    const rows = Array.isArray(list) ? list : list.submissions;
    expect(rows.map((r: any) => r.clientName)).not.toContain(body.clientName);
  });

  test('F03-E1 double submit within 60s creates one record (second is 409)', async ({ request }) => {
    const carrier = await carrierId(request);
    const data = { clientName: uniq(), productSold: 'Term Life', carrier, premiumAmount: 50 };
    const auth = await as(request, 'agent');
    const [a, b] = await Promise.all([
      request.post(`${API}/production`, { ...auth, data }),
      request.post(`${API}/production`, { ...auth, data })
    ]);
    const statuses = [a.status(), b.status()].sort();
    // Sequential duplicates are blocked with 409. A truly simultaneous pair is a race in the guard.
    expect(statuses, 'exactly one 201 and one 409').toEqual([201, 409]);
  });

  test('F03-E2 emoji, accents and long names are stored intact; 501 chars rejected', async ({ request }) => {
    const name = `José Ñandú 😀 ${uniq()}`;
    const { res } = await submit(request, 'agent', { clientName: name });
    expect(res.status()).toBe(201);
    expect((await res.json()).clientName).toBe(name);
    const tooLong = await submit(request, 'agent', { clientName: 'x'.repeat(501) });
    expect(tooLong.res.status()).toBe(400);
  });

  test('F03-N1 invalid input is rejected with 4xx, never 5xx', async ({ request }) => {
    const carrier = await carrierId(request);
    const auth = await as(request, 'agent');
    const bads: Array<[string, Record<string, unknown>]> = [
      ['empty body', {}],
      ['negative premium', { clientName: uniq(), productSold: 'Term Life', carrier, premiumAmount: -1 }],
      ['premium as text', { clientName: uniq(), productSold: 'Term Life', carrier, premiumAmount: 'abc' }],
      ['bad carrier id', { clientName: uniq(), productSold: 'Term Life', carrier: 'zzz', premiumAmount: 1 }],
      ['unknown carrier', { clientName: uniq(), productSold: 'Term Life', carrier: '0'.repeat(24), premiumAmount: 1 }],
      ['bad status', { clientName: uniq(), productSold: 'Term Life', carrier, premiumAmount: 1, status: 'Hacked' }],
      ['Other without description', { clientName: uniq(), productSold: 'Other', carrier, premiumAmount: 1 }],
      ['date > 1y ago', { clientName: uniq(), productSold: 'Term Life', carrier, premiumAmount: 1, submissionDate: '2000-01-01' }],
      ['NoSQL operator in field', { clientName: { $ne: null }, productSold: 'Term Life', carrier, premiumAmount: 1 }]
    ];
    for (const [label, data] of bads) {
      const res = await request.post(`${API}/production`, { ...auth, data });
      expect(res.status(), label).toBeGreaterThanOrEqual(400);
      expect(res.status(), label).toBeLessThan(500);
    }
  });

  test('F03-N2 malformed :id in path gives 4xx not 5xx', async ({ request }) => {
    const res = await request.get(`${API}/production/not-an-object-id`, await as(request, 'agent'));
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('F04 income paid approval', () => {
  async function pending(request: any) {
    const sub = await (await submit(request, 'agent')).res.json();
    const res = await request.post(`${API}/production/income-paid`, {
      ...(await as(request, 'agent')),
      data: { productionSubmissionId: sub._id, amount: 250, datePaidByCarrier: '2026-10-15' }
    });
    expect(res.status()).toBe(201);
    return { sub, entry: (await res.json()).entry };
  }

  test('F04-H1 agent submits, admin approves, agent sees approved', async ({ request }) => {
    const { entry } = await pending(request);
    expect(entry.status).toBe('pending');
    const ok = await request.put(`${API}/production/income-paid/${entry._id}/approve`, { ...(await as(request, 'admin')), data: {} });
    expect(ok.status()).toBe(200);
    const mine = await (await request.get(`${API}/production/income-paid/mine`, await as(request, 'agent'))).json();
    expect(mine.entries.find((e: any) => e._id === entry._id).status).toBe('approved');
  });

  test('F04-I1 cannot attach income to another agent’s submission', async ({ request }) => {
    const sub = await (await submit(request, 'other')).res.json();
    const res = await request.post(`${API}/production/income-paid`, {
      ...(await as(request, 'agent')),
      data: { productionSubmissionId: sub._id, amount: 1, datePaidByCarrier: '2026-10-15' }
    });
    expect(res.status()).toBe(404);
  });

  test('F04-I2 agent cannot approve or reject their own entry', async ({ request }) => {
    const { entry } = await pending(request);
    const agent = await as(request, 'agent');
    expect((await request.put(`${API}/production/income-paid/${entry._id}/approve`, { ...agent, data: {} })).status()).toBe(403);
    expect((await request.put(`${API}/production/income-paid/${entry._id}/reject`, { ...agent, data: {} })).status()).toBe(403);
  });

  test('F04-N1 an already-approved entry cannot be approved again or rejected', async ({ request }) => {
    const { entry } = await pending(request);
    const admin = await as(request, 'admin');
    expect((await request.put(`${API}/production/income-paid/${entry._id}/approve`, { ...admin, data: {} })).status()).toBe(200);
    const again = await request.put(`${API}/production/income-paid/${entry._id}/approve`, { ...admin, data: {} });
    const flip = await request.put(`${API}/production/income-paid/${entry._id}/reject`, { ...admin, data: {} });
    expect(again.status(), 're-approve').toBeGreaterThanOrEqual(400);
    expect(flip.status(), 'approved -> rejected').toBeGreaterThanOrEqual(400);
  });

  test('F04-N2 owner cannot delete an entry once it is approved', async ({ request }) => {
    const { entry } = await pending(request);
    await request.put(`${API}/production/income-paid/${entry._id}/approve`, { ...(await as(request, 'admin')), data: {} });
    const res = await request.delete(`${API}/production/income-paid/${entry._id}`, await as(request, 'agent'));
    expect(res.status()).toBe(403);
  });

  test('F04-N3 other agent cannot delete my pending entry', async ({ request }) => {
    const { entry } = await pending(request);
    const res = await request.delete(`${API}/production/income-paid/${entry._id}`, await as(request, 'other'));
    expect(res.status()).toBe(403);
  });

  test('F04-N4 negative amount and missing date are rejected', async ({ request }) => {
    const sub = await (await submit(request, 'agent')).res.json();
    const auth = await as(request, 'agent');
    for (const data of [
      { productionSubmissionId: sub._id, amount: -5, datePaidByCarrier: '2026-10-15' },
      { productionSubmissionId: sub._id, amount: 5 }
    ]) {
      const res = await request.post(`${API}/production/income-paid`, { ...auth, data });
      expect(res.status()).toBe(400);
    }
  });
});
