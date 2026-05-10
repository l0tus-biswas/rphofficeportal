/**
 * Deep E2E Commission Statements Test Suite
 * Tests EVERY scenario from both admin and agent perspectives:
 *   - Upload (single & multi-file), edit, delete
 *   - Notes (add, delete, agent cannot)
 *   - Filters (agent, carrier, date range)
 *   - Download / access control
 *   - Agent search (6.4)
 *   - Multi-carrier support (6.2)
 *   - Privacy (agent sees only own; admin sees all)
 *   - Edge cases (XSS, large notes, empty fields, bad IDs, concurrent)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:5000/api';
const ADMIN_EMAIL = 'contracting@rhpoffice.com';
const ADMIN_PASS = 'admin123';
const AGENT_EMAIL = 'lotushotmail111@gmail.com';
const AGENT_PASS = '123456';

let adminToken = '';
let agentToken = '';
let adminId = '';
let agentId = '';
let createdIds = [];
let passed = 0;
let failed = 0;
let failures = [];

// ─── HTTP helpers ─────────────────────────────────────────────
function request(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath.startsWith('http') ? urlPath : `${BASE}${urlPath}`);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers }); }
        catch { resolve({ status: res.statusCode, data, headers: res.headers }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/** multipart/form-data upload helper */
function uploadFiles(urlPath, fields, files, token) {
  return new Promise((resolve, reject) => {
    const boundary = '----FormBoundary' + Date.now();
    const url = new URL(`${BASE}${urlPath}`);
    let body = '';

    // String fields
    for (const [key, val] of Object.entries(fields)) {
      body += `--${boundary}\r\n`;
      body += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
      body += `${val}\r\n`;
    }

    // File fields
    const fileBuffers = [];
    for (const file of files) {
      const fileHeader = `--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.name}"\r\nContent-Type: ${file.mime}\r\n\r\n`;
      fileBuffers.push(Buffer.from(fileHeader));
      fileBuffers.push(file.buffer);
      fileBuffers.push(Buffer.from('\r\n'));
    }

    const ending = `--${boundary}--\r\n`;
    const bodyBuffer = Buffer.concat([
      Buffer.from(body),
      ...fileBuffers,
      Buffer.from(ending)
    ]);

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': bodyBuffer.length,
        'Authorization': `Bearer ${token}`
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers }); }
        catch { resolve({ status: res.statusCode, data, headers: res.headers }); }
      });
    });
    req.on('error', reject);
    req.write(bodyBuffer);
    req.end();
  });
}

/** multipart PUT helper (for edit) */
function uploadFilePut(urlPath, fields, file, token) {
  return new Promise((resolve, reject) => {
    const boundary = '----FormBoundary' + Date.now();
    const url = new URL(`${BASE}${urlPath}`);
    let body = '';

    for (const [key, val] of Object.entries(fields)) {
      body += `--${boundary}\r\n`;
      body += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
      body += `${val}\r\n`;
    }

    const fileBuffers = [];
    if (file) {
      const fileHeader = `--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.name}"\r\nContent-Type: ${file.mime}\r\n\r\n`;
      fileBuffers.push(Buffer.from(fileHeader));
      fileBuffers.push(file.buffer);
      fileBuffers.push(Buffer.from('\r\n'));
    }

    const ending = `--${boundary}--\r\n`;
    const bodyBuffer = Buffer.concat([
      Buffer.from(body),
      ...fileBuffers,
      Buffer.from(ending)
    ]);

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'PUT',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': bodyBuffer.length,
        'Authorization': `Bearer ${token}`
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers }); }
        catch { resolve({ status: res.statusCode, data, headers: res.headers }); }
      });
    });
    req.on('error', reject);
    req.write(bodyBuffer);
    req.end();
  });
}

function assert(condition, testName, detail = '') {
  if (condition) { console.log(`  ✅ ${testName}`); passed++; }
  else { console.log(`  ❌ ${testName}${detail ? ' — ' + detail : ''}`); failed++; failures.push(`${testName}: ${detail}`); }
}

// Create a fake PDF buffer (minimal valid PDF)
function makeFakePdf(label = 'test') {
  return Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF ${label}`);
}

// ─── Setup ────────────────────────────────────────────────────
async function setup() {
  console.log('\n═══ SETUP ═══\n');
  const admin = await request('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS });
  if (admin.status !== 200) { console.log('❌ Cannot login as admin'); process.exit(1); }
  adminToken = admin.data.token;
  adminId = admin.data.user._id || admin.data.user.id;

  const agent = await request('POST', '/auth/login', { email: AGENT_EMAIL, password: AGENT_PASS });
  if (agent.status !== 200) { console.log('❌ Cannot login as agent'); process.exit(1); }
  agentToken = agent.data.token;
  agentId = agent.data.user._id || agent.data.user.id;

  console.log(`  Admin: ${adminId}`);
  console.log(`  Agent: ${agentId} (${AGENT_EMAIL})`);
}

// ═══════════════════════════════════════════════════════════════
// SECTION 1: ADMIN UPLOAD (single & multi-file)
// ═══════════════════════════════════════════════════════════════
async function testAdminUpload() {
  console.log('\n═══ SECTION 1: ADMIN UPLOAD ═══\n');

  // 1.1 Upload single PDF
  const r1 = await uploadFiles('/commission-statements', {
    agentId: agentId,
    carriers: JSON.stringify(['Aetna']),
    payPeriod: '2026-05-01',
    notes: 'First upload test'
  }, [{
    field: 'statementFile',
    name: 'statement-may-2026.pdf',
    mime: 'application/pdf',
    buffer: makeFakePdf('single')
  }], adminToken);
  assert(r1.status === 201, '1.1 Upload single PDF → 201');
  assert(r1.data.statements?.length === 1, '1.1a One statement created');
  assert(r1.data.statements[0].carriers?.includes('Aetna'), '1.1b Carrier "Aetna" stored');
  assert(r1.data.statements[0].originalFileName === 'statement-may-2026.pdf', '1.1c Original filename preserved');
  assert(r1.data.statements[0].notes?.length === 1, '1.1d Initial note attached');
  assert(r1.data.statements[0].notes[0]?.text === 'First upload test', '1.1e Note text correct');
  if (r1.data.statements?.[0]?._id) createdIds.push(r1.data.statements[0]._id);

  // 1.2 Upload multiple files at once
  const r2 = await uploadFiles('/commission-statements', {
    agentId: agentId,
    carriers: JSON.stringify(['Mutual of Omaha', 'Foresters']),
    payPeriod: '2026-04-15'
  }, [
    { field: 'statementFile', name: 'april-stmt-1.pdf', mime: 'application/pdf', buffer: makeFakePdf('multi1') },
    { field: 'statementFile', name: 'april-stmt-2.pdf', mime: 'application/pdf', buffer: makeFakePdf('multi2') }
  ], adminToken);
  assert(r2.status === 201, '1.2 Upload multi-file → 201');
  assert(r2.data.statements?.length === 2, '1.2a Two statements created', `got: ${r2.data.statements?.length}`);
  assert(r2.data.statements[0].carriers?.length === 2, '1.2b Multiple carriers preserved');
  if (r2.data.statements) r2.data.statements.forEach(s => createdIds.push(s._id));

  // 1.3 Upload without file — should fail
  const r3 = await uploadFiles('/commission-statements', {
    agentId: agentId,
    carriers: JSON.stringify(['Test']),
    payPeriod: '2026-04-01'
  }, [], adminToken);
  assert(r3.status === 400, '1.3 Upload without file → 400', `got: ${r3.status}`);

  // 1.4 Upload without agentId — should fail
  const r4 = await uploadFiles('/commission-statements', {
    carriers: JSON.stringify(['Test']),
    payPeriod: '2026-04-01'
  }, [{
    field: 'statementFile', name: 'test.pdf', mime: 'application/pdf', buffer: makeFakePdf('noagent')
  }], adminToken);
  assert(r4.status === 400, '1.4 Upload without agentId → 400', `got: ${r4.status}`);

  // 1.5 Upload without payPeriod — should fail
  const r5 = await uploadFiles('/commission-statements', {
    agentId: agentId,
    carriers: JSON.stringify(['Test'])
  }, [{
    field: 'statementFile', name: 'test.pdf', mime: 'application/pdf', buffer: makeFakePdf('nopay')
  }], adminToken);
  assert(r5.status === 400, '1.5 Upload without payPeriod → 400', `got: ${r5.status}`);

  // 1.6 Upload with invalid agentId — should fail
  const r6 = await uploadFiles('/commission-statements', {
    agentId: '000000000000000000000000',
    carriers: JSON.stringify(['Test']),
    payPeriod: '2026-03-01'
  }, [{
    field: 'statementFile', name: 'test.pdf', mime: 'application/pdf', buffer: makeFakePdf('badagent')
  }], adminToken);
  assert(r6.status === 404, '1.6 Upload with invalid agentId → 404', `got: ${r6.status}`);

  // 1.7 Agent cannot upload (403)
  const r7 = await uploadFiles('/commission-statements', {
    agentId: agentId,
    carriers: JSON.stringify(['Test']),
    payPeriod: '2026-03-01'
  }, [{
    field: 'statementFile', name: 'test.pdf', mime: 'application/pdf', buffer: makeFakePdf('agentup')
  }], agentToken);
  assert(r7.status === 403, '1.7 Agent upload → 403', `got: ${r7.status}`);

  // 1.8 Upload with no carriers (edge case — should still succeed)
  const r8 = await uploadFiles('/commission-statements', {
    agentId: agentId,
    carriers: JSON.stringify([]),
    payPeriod: '2026-02-28'
  }, [{
    field: 'statementFile', name: 'no-carrier.pdf', mime: 'application/pdf', buffer: makeFakePdf('nocarr')
  }], adminToken);
  assert(r8.status === 201, '1.8 Upload with empty carriers → 201');
  assert(r8.data.statements[0].carriers?.length === 0, '1.8a carriers is empty array');
  if (r8.data.statements?.[0]?._id) createdIds.push(r8.data.statements[0]._id);

  // 1.9 Upload with legacy comma-separated carrier field
  const r9 = await uploadFiles('/commission-statements', {
    agentId: agentId,
    carrier: 'BlueCross, United Health',
    payPeriod: '2026-02-15'
  }, [{
    field: 'statementFile', name: 'legacy-carrier.pdf', mime: 'application/pdf', buffer: makeFakePdf('legacy')
  }], adminToken);
  assert(r9.status === 201, '1.9 Upload with legacy carrier string → 201');
  assert(r9.data.statements[0].carriers?.includes('BlueCross'), '1.9a "BlueCross" parsed from CSV');
  assert(r9.data.statements[0].carriers?.includes('United Health'), '1.9b "United Health" parsed from CSV');
  if (r9.data.statements?.[0]?._id) createdIds.push(r9.data.statements[0]._id);
}

// ═══════════════════════════════════════════════════════════════
// SECTION 2: LIST / FILTER
// ═══════════════════════════════════════════════════════════════
async function testListFilter() {
  console.log('\n═══ SECTION 2: LIST / FILTER ═══\n');

  // 2.1 Admin list all
  const r1 = await request('GET', '/commission-statements', null, adminToken);
  assert(r1.status === 200, '2.1 Admin list all → 200');
  assert(Array.isArray(r1.data), '2.1a Returns array');
  assert(r1.data.length >= createdIds.length, '2.1b Has at least test statements', `got: ${r1.data.length}`);
  // Check populated fields
  const first = r1.data.find(s => createdIds.includes(s._id));
  assert(first?.agent?.name != null, '2.1c agent.name populated');
  assert(first?.agent?.email != null, '2.1d agent.email populated');
  console.log(`    → Total statements: ${r1.data.length}`);

  // 2.2 Admin filter by agentId
  const r2 = await request('GET', `/commission-statements?agentId=${agentId}`, null, adminToken);
  assert(r2.status === 200, '2.2 Admin filter by agentId');
  const allMatchAgent = r2.data.every(s => (s.agent?._id || s.agent) === agentId);
  assert(allMatchAgent, '2.2a All results belong to agent');

  // 2.3 Admin filter by carrier
  const r3 = await request('GET', `/commission-statements?carrier=Aetna`, null, adminToken);
  assert(r3.status === 200, '2.3 Filter by carrier');
  const allHaveCarrier = r3.data.every(s => (s.carrier || '').toLowerCase().includes('aetna'));
  assert(allHaveCarrier || r3.data.length === 0, '2.3a Results match carrier filter');

  // 2.4 Admin filter by date range
  const r4 = await request('GET', `/commission-statements?from=2026-04-01&to=2026-05-31`, null, adminToken);
  assert(r4.status === 200, '2.4 Filter by date range');
  const allInRange = r4.data.every(s => {
    const d = new Date(s.payPeriod);
    return d >= new Date('2026-04-01') && d <= new Date('2026-05-31');
  });
  assert(allInRange, '2.4a All results within date range');

  // 2.5 Agent list — sees only own
  const r5 = await request('GET', '/commission-statements', null, agentToken);
  assert(r5.status === 200, '2.5 Agent list → 200');
  const allOwn = r5.data.every(s => (s.agent?._id || s.agent) === agentId);
  assert(allOwn, '2.5a Agent sees only own statements');
  console.log(`    → Agent statements: ${r5.data.length}`);

  // 2.6 Agent cannot filter by other agentId (param ignored, still sees own)
  const r6 = await request('GET', `/commission-statements?agentId=${adminId}`, null, agentToken);
  assert(r6.status === 200, '2.6 Agent filter by other agentId ignored');
  const stillOwn = r6.data.every(s => (s.agent?._id || s.agent) === agentId);
  assert(stillOwn, '2.6a Still sees only own data');

  // 2.7 Agent filter by carrier
  const r7 = await request('GET', '/commission-statements?carrier=Aetna', null, agentToken);
  assert(r7.status === 200, '2.7 Agent filter by carrier');

  // 2.8 Agent filter by date
  const r8 = await request('GET', '/commission-statements?from=2026-05-01&to=2026-05-31', null, agentToken);
  assert(r8.status === 200, '2.8 Agent filter by date');

  // 2.9 Sort order (should be payPeriod desc)
  if (r1.data.length >= 2) {
    const dates = r1.data.map(s => new Date(s.payPeriod).getTime());
    let isSorted = true;
    for (let i = 1; i < dates.length; i++) {
      if (dates[i] > dates[i - 1]) { isSorted = false; break; }
    }
    assert(isSorted, '2.9 Results sorted by payPeriod descending');
  } else {
    assert(true, '2.9 Skip sort check (not enough data)');
  }
}

// ═══════════════════════════════════════════════════════════════
// SECTION 3: DOWNLOAD / ACCESS CONTROL
// ═══════════════════════════════════════════════════════════════
async function testDownload() {
  console.log('\n═══ SECTION 3: DOWNLOAD & ACCESS CONTROL ═══\n');

  const stmtId = createdIds[0];

  // 3.1 Admin download
  const r1 = await request('GET', `/commission-statements/${stmtId}/download`, null, adminToken);
  assert(r1.status === 200, '3.1 Admin download → 200');
  assert(r1.headers['content-type']?.includes('pdf') || r1.headers['content-type']?.includes('octet'), '3.1a Content-Type is PDF');
  assert(r1.headers['content-disposition']?.includes('attachment'), '3.1b Has Content-Disposition attachment');

  // 3.2 Agent download own
  const r2 = await request('GET', `/commission-statements/${stmtId}/download`, null, agentToken);
  assert(r2.status === 200, '3.2 Agent download own → 200');

  // 3.3 Non-existent ID
  const r3 = await request('GET', '/commission-statements/000000000000000000000000/download', null, adminToken);
  assert(r3.status === 404, '3.3 Non-existent ID → 404', `got: ${r3.status}`);

  // 3.4 No auth → 401
  const r4 = await request('GET', `/commission-statements/${stmtId}/download`, null, null);
  assert(r4.status === 401, '3.4 No auth → 401', `got: ${r4.status}`);
}

// ═══════════════════════════════════════════════════════════════
// SECTION 4: NOTES (6.3)
// ═══════════════════════════════════════════════════════════════
async function testNotes() {
  console.log('\n═══ SECTION 4: NOTES ═══\n');

  const stmtId = createdIds[0];

  // 4.1 Admin add note
  const r1 = await request('POST', `/commission-statements/${stmtId}/notes`, { text: 'Admin note #1' }, adminToken);
  assert(r1.status === 200, '4.1 Admin add note → 200');
  assert(r1.data.notes?.length >= 2, '4.1a Has 2+ notes (1 from upload + this one)', `got: ${r1.data.notes?.length}`);
  const addedNote = r1.data.notes.find(n => n.text === 'Admin note #1');
  assert(addedNote != null, '4.1b Note text saved correctly');
  assert(addedNote?.addedBy?.name != null, '4.1c addedBy populated');

  // 4.2 Admin add another note
  const r2 = await request('POST', `/commission-statements/${stmtId}/notes`, { text: 'Second note' }, adminToken);
  assert(r2.status === 200, '4.2 Admin add second note');
  assert(r2.data.notes?.length >= 3, '4.2a 3+ notes total');

  // 4.3 Empty note text → 400
  const r3 = await request('POST', `/commission-statements/${stmtId}/notes`, { text: '' }, adminToken);
  assert(r3.status === 400, '4.3 Empty note text → 400', `got: ${r3.status}`);

  // 4.4 Note with only whitespace → 400
  const r4 = await request('POST', `/commission-statements/${stmtId}/notes`, { text: '   ' }, adminToken);
  assert(r4.status === 400, '4.4 Whitespace-only note → 400', `got: ${r4.status}`);

  // 4.5 Agent cannot add note (403)
  const r5 = await request('POST', `/commission-statements/${stmtId}/notes`, { text: 'Agent note' }, agentToken);
  assert(r5.status === 403, '4.5 Agent cannot add note → 403', `got: ${r5.status}`);

  // 4.6 Delete note (admin)
  const noteToDelete = r2.data.notes[r2.data.notes.length - 1]._id;
  const r6 = await request('DELETE', `/commission-statements/${stmtId}/notes/${noteToDelete}`, null, adminToken);
  assert(r6.status === 200, '4.6 Admin delete note → 200');
  const deletedExists = r6.data.notes?.find(n => n._id === noteToDelete);
  assert(!deletedExists, '4.6a Note removed from array');

  // 4.7 Agent cannot delete note (403)
  const remainingNote = r6.data.notes[0]?._id;
  if (remainingNote) {
    const r7 = await request('DELETE', `/commission-statements/${stmtId}/notes/${remainingNote}`, null, agentToken);
    assert(r7.status === 403, '4.7 Agent cannot delete note → 403', `got: ${r7.status}`);
  } else {
    assert(true, '4.7 Skip (no notes remaining)');
  }

  // 4.8 Add note on non-existent statement
  const r8 = await request('POST', '/commission-statements/000000000000000000000000/notes', { text: 'Ghost' }, adminToken);
  assert(r8.status === 404, '4.8 Note on non-existent → 404', `got: ${r8.status}`);

  // 4.9 XSS in note text (stored but Angular sanitizes)
  const xss = '<script>alert("xss")</script>';
  const r9 = await request('POST', `/commission-statements/${stmtId}/notes`, { text: xss }, adminToken);
  assert(r9.status === 200, '4.9 XSS note accepted (Angular sanitizes output)');
  const xssNote = r9.data.notes.find(n => n.text === xss);
  assert(xssNote != null, '4.9a XSS text stored as-is');
}

// ═══════════════════════════════════════════════════════════════
// SECTION 5: EDIT (Admin PUT)
// ═══════════════════════════════════════════════════════════════
async function testEdit() {
  console.log('\n═══ SECTION 5: EDIT ═══\n');

  const stmtId = createdIds[0];

  // 5.1 Edit carriers
  const r1 = await uploadFilePut(`/commission-statements/${stmtId}`, {
    carriers: JSON.stringify(['Aetna', 'Humana', 'Cigna'])
  }, null, adminToken);
  assert(r1.status === 200, '5.1 Edit carriers → 200');
  assert(r1.data.statement?.carriers?.length === 3, '5.1a 3 carriers saved', `got: ${r1.data.statement?.carriers?.length}`);
  assert(r1.data.statement?.carrier === 'Aetna, Humana, Cigna', '5.1b Legacy carrier field synced');

  // 5.2 Edit payPeriod
  const r2 = await uploadFilePut(`/commission-statements/${stmtId}`, {
    payPeriod: '2026-06-01'
  }, null, adminToken);
  assert(r2.status === 200, '5.2 Edit payPeriod → 200');
  assert(new Date(r2.data.statement.payPeriod).toISOString().startsWith('2026-06-01'), '5.2a payPeriod updated');

  // 5.3 Edit with new note via PUT
  const r3 = await uploadFilePut(`/commission-statements/${stmtId}`, {
    notes: 'Edit-added note'
  }, null, adminToken);
  assert(r3.status === 200, '5.3 Edit with note → 200');
  const editNote = r3.data.statement?.notes?.find(n => n.text === 'Edit-added note');
  assert(editNote != null, '5.3a Note added via edit');

  // 5.4 Edit with file replacement
  const r4 = await uploadFilePut(`/commission-statements/${stmtId}`, {
    carriers: JSON.stringify(['Aetna'])
  }, {
    field: 'statementFile',
    name: 'replacement.pdf',
    mime: 'application/pdf',
    buffer: makeFakePdf('replaced')
  }, adminToken);
  assert(r4.status === 200, '5.4 Edit with file replacement → 200');
  assert(r4.data.statement?.originalFileName === 'replacement.pdf', '5.4a New filename stored');

  // 5.5 Edit reassign to different agent (admin is also valid agent target)
  const r5 = await uploadFilePut(`/commission-statements/${stmtId}`, {
    agentId: agentId // reassign back to agent (same in this case)
  }, null, adminToken);
  assert(r5.status === 200, '5.5 Edit reassign agent → 200');

  // 5.6 Agent cannot edit (403)
  const r6 = await uploadFilePut(`/commission-statements/${stmtId}`, {
    carriers: JSON.stringify(['Hacked'])
  }, null, agentToken);
  assert(r6.status === 403, '5.6 Agent cannot edit → 403', `got: ${r6.status}`);

  // 5.7 Edit non-existent statement
  const r7 = await uploadFilePut('/commission-statements/000000000000000000000000', {
    carriers: JSON.stringify(['X'])
  }, null, adminToken);
  assert(r7.status === 404, '5.7 Edit non-existent → 404', `got: ${r7.status}`);
}

// ═══════════════════════════════════════════════════════════════
// SECTION 6: DELETE (Admin only)
// ═══════════════════════════════════════════════════════════════
async function testDelete() {
  console.log('\n═══ SECTION 6: DELETE ═══\n');

  // Create temp statement to delete
  const temp = await uploadFiles('/commission-statements', {
    agentId: agentId,
    carriers: JSON.stringify(['DeleteTest']),
    payPeriod: '2026-01-01'
  }, [{
    field: 'statementFile', name: 'delete-me.pdf', mime: 'application/pdf', buffer: makeFakePdf('delme')
  }], adminToken);
  const delId = temp.data.statements?.[0]?._id;

  // 6.1 Agent cannot delete (403)
  const r1 = await request('DELETE', `/commission-statements/${delId}`, null, agentToken);
  assert(r1.status === 403, '6.1 Agent cannot delete → 403', `got: ${r1.status}`);

  // 6.2 Admin delete
  const r2 = await request('DELETE', `/commission-statements/${delId}`, null, adminToken);
  assert(r2.status === 200, '6.2 Admin delete → 200');

  // 6.3 Delete already deleted (should 404)
  const r3 = await request('DELETE', `/commission-statements/${delId}`, null, adminToken);
  assert(r3.status === 404, '6.3 Delete already deleted → 404', `got: ${r3.status}`);

  // 6.4 Delete non-existent
  const r4 = await request('DELETE', '/commission-statements/000000000000000000000000', null, adminToken);
  assert(r4.status === 404, '6.4 Delete non-existent → 404', `got: ${r4.status}`);
}

// ═══════════════════════════════════════════════════════════════
// SECTION 7: AGENT SEARCH (6.4)
// ═══════════════════════════════════════════════════════════════
async function testAgentSearch() {
  console.log('\n═══ SECTION 7: AGENT SEARCH ═══\n');

  // 7.1 Admin search by name
  const r1 = await request('GET', '/commission-statements/agents/search?q=lotus', null, adminToken);
  assert(r1.status === 200, '7.1 Agent search → 200');
  assert(r1.data.agents?.length > 0, '7.1a Found agents', `got: ${r1.data.agents?.length}`);
  assert(r1.data.agents[0].name != null, '7.1b Has name field');
  assert(r1.data.agents[0].email != null, '7.1c Has email field');

  // 7.2 Search with empty query — returns all agents
  const r2 = await request('GET', '/commission-statements/agents/search?q=', null, adminToken);
  assert(r2.status === 200, '7.2 Empty query → returns agents');
  assert(r2.data.agents?.length > 0, '7.2a Has results');

  // 7.3 Search with no match
  const r3 = await request('GET', '/commission-statements/agents/search?q=zzzznonexistent99999', null, adminToken);
  assert(r3.status === 200, '7.3 No match → 200 with empty array');
  assert(r3.data.agents?.length === 0, '7.3a Empty array');

  // 7.4 Agent cannot access search (403)
  const r4 = await request('GET', '/commission-statements/agents/search?q=lotus', null, agentToken);
  assert(r4.status === 403, '7.4 Agent cannot search → 403', `got: ${r4.status}`);

  // 7.5 No auth → 401
  const r5 = await request('GET', '/commission-statements/agents/search?q=lotus', null, null);
  assert(r5.status === 401, '7.5 No auth → 401', `got: ${r5.status}`);

  // 7.6 Search with special regex chars (should not crash)
  const r6 = await request('GET', '/commission-statements/agents/search?q=a(b)c.*', null, adminToken);
  assert(r6.status === 200, '7.6 Special chars in query → 200 (escaped safely)');

  // 7.7 Max 50 results
  const r7 = await request('GET', '/commission-statements/agents/search?q=', null, adminToken);
  assert(r7.data.agents?.length <= 50, '7.7 Results limited to 50');
}

// ═══════════════════════════════════════════════════════════════
// SECTION 8: EDGE CASES & BUSINESS LOGIC
// ═══════════════════════════════════════════════════════════════
async function testEdgeCases() {
  console.log('\n═══ SECTION 8: EDGE CASES & BUSINESS LOGIC ═══\n');

  // 8.1 Carrier virtual (carrierList) works
  const list = await request('GET', '/commission-statements', null, adminToken);
  const testStmt = list.data.find(s => createdIds.includes(s._id));
  if (testStmt) {
    assert(Array.isArray(testStmt.carrierList), '8.1 carrierList virtual present');
    assert(testStmt.carrierList.length > 0, '8.1a carrierList has values');
  } else {
    assert(true, '8.1 Skip (no test statement found)');
  }

  // 8.2 payPeriod stored as Date (not string)
  if (testStmt) {
    const pp = new Date(testStmt.payPeriod);
    assert(!isNaN(pp.getTime()), '8.2 payPeriod is valid date');
  }

  // 8.3 Very long note text
  const longNote = 'A'.repeat(5000);
  const r3 = await request('POST', `/commission-statements/${createdIds[0]}/notes`, { text: longNote }, adminToken);
  assert(r3.status === 200, '8.3 Long note (5000 chars) accepted');
  const longSaved = r3.data.notes?.find(n => n.text?.length === 5000);
  assert(longSaved != null, '8.3a Full text preserved');

  // 8.4 Upload with future payPeriod
  const futureRes = await uploadFiles('/commission-statements', {
    agentId: agentId,
    carriers: JSON.stringify(['FutureCarrier']),
    payPeriod: '2027-12-31'
  }, [{
    field: 'statementFile', name: 'future.pdf', mime: 'application/pdf', buffer: makeFakePdf('future')
  }], adminToken);
  assert(futureRes.status === 201, '8.4 Future payPeriod accepted');
  if (futureRes.data.statements?.[0]?._id) createdIds.push(futureRes.data.statements[0]._id);

  // 8.5 Upload with very old payPeriod
  const oldRes = await uploadFiles('/commission-statements', {
    agentId: agentId,
    carriers: JSON.stringify(['OldCarrier']),
    payPeriod: '2020-01-01'
  }, [{
    field: 'statementFile', name: 'old.pdf', mime: 'application/pdf', buffer: makeFakePdf('old')
  }], adminToken);
  assert(oldRes.status === 201, '8.5 Old payPeriod (2020) accepted');
  if (oldRes.data.statements?.[0]?._id) createdIds.push(oldRes.data.statements[0]._id);

  // 8.6 Notes visible in list response
  const freshList = await request('GET', `/commission-statements?agentId=${agentId}`, null, adminToken);
  const withNotes = freshList.data.find(s => s._id === createdIds[0]);
  assert(withNotes?.notes?.length > 0, '8.6 Notes populated in list response', `notes: ${withNotes?.notes?.length}`);
  assert(withNotes?.notes?.[0]?.addedBy?.name != null, '8.6a notes.addedBy populated');

  // 8.7 Carrier with special characters
  const specialRes = await uploadFiles('/commission-statements', {
    agentId: agentId,
    carriers: JSON.stringify(["O'Brien & Associates", "Café Health"]),
    payPeriod: '2026-03-15'
  }, [{
    field: 'statementFile', name: 'special.pdf', mime: 'application/pdf', buffer: makeFakePdf('special')
  }], adminToken);
  assert(specialRes.status === 201, '8.7 Special chars in carrier name accepted');
  assert(specialRes.data.statements[0].carriers.includes("O'Brien & Associates"), '8.7a Special carrier preserved');
  if (specialRes.data.statements?.[0]?._id) createdIds.push(specialRes.data.statements[0]._id);

  // 8.8 Concurrent downloads (data integrity)
  const ids = createdIds.filter(id => id);
  if (ids.length >= 2) {
    const [d1, d2] = await Promise.all([
      request('GET', `/commission-statements/${ids[0]}/download`, null, adminToken),
      request('GET', `/commission-statements/${ids[1]}/download`, null, adminToken)
    ]);
    assert(d1.status === 200 && d2.status === 200, '8.8 Concurrent downloads succeed');
  }
}

// ═══════════════════════════════════════════════════════════════
// SECTION 9: DATA INTEGRITY & CONSISTENCY
// ═══════════════════════════════════════════════════════════════
async function testDataIntegrity() {
  console.log('\n═══ SECTION 9: DATA INTEGRITY ═══\n');

  // 9.1 Admin count matches actual
  const all = await request('GET', '/commission-statements', null, adminToken);
  const agentAll = await request('GET', '/commission-statements', null, agentToken);

  // 9.2 Agent count is subset of admin count
  assert(agentAll.data.length <= all.data.length, '9.1 Agent count <= admin count',
    `agent=${agentAll.data.length}, admin=${all.data.length}`);

  // 9.3 Every agent statement exists in admin list
  const adminIds = new Set(all.data.map(s => s._id));
  const allAgentInAdmin = agentAll.data.every(s => adminIds.has(s._id));
  assert(allAgentInAdmin, '9.2 All agent statements in admin list');

  // 9.4 uploadedBy is always populated for admin-uploaded statements
  const allHaveUploader = all.data.filter(s => createdIds.includes(s._id)).every(s => s.uploadedBy?.name != null);
  assert(allHaveUploader, '9.3 uploadedBy populated on test statements');

  // 9.5 payPeriod filter consistency
  const filtered = await request('GET', '/commission-statements?from=2026-04-01&to=2026-04-30', null, adminToken);
  const unfiltered = await request('GET', '/commission-statements', null, adminToken);
  assert(filtered.data.length <= unfiltered.data.length, '9.4 Filtered count <= total count');
}

// ═══════════════════════════════════════════════════════════════
// CLEANUP
// ═══════════════════════════════════════════════════════════════
async function cleanup() {
  console.log('\n═══ CLEANUP ═══\n');
  let cleaned = 0;
  for (const id of createdIds) {
    try {
      const r = await request('DELETE', `/commission-statements/${id}`, null, adminToken);
      if (r.status === 200) cleaned++;
    } catch {}
  }
  console.log(`  Cleaned ${cleaned}/${createdIds.length} test statements`);
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║  DEEP E2E COMMISSION STATEMENTS - ALL SCENARIOS          ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');

  await setup();
  await testAdminUpload();
  await testListFilter();
  await testDownload();
  await testNotes();
  await testEdit();
  await testDelete();
  await testAgentSearch();
  await testEdgeCases();
  await testDataIntegrity();
  await cleanup();

  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log(`║  RESULTS: ✅ ${passed} passed | ❌ ${failed} failed | Total: ${passed + failed}`);
  console.log('╚═══════════════════════════════════════════════════════════╝');

  if (failures.length > 0) {
    console.log('\nFailed tests:');
    failures.forEach(f => console.log(`  • ${f}`));
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error('Test error:', err); process.exit(1); });
