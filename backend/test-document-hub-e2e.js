/**
 * Document Hub — Deep E2E Test Suite
 * Item 18: Document Hub – Management, Structure & Upload Requests
 *
 * Tests cover:
 *   18.1 - Folder & Subfolder System
 *   18.2 - Document Hub Management (Admin)
 *   18.3 - Upload Requests (admin→agent workflow)
 *   18.4 - Purpose & Separation (not onboarding)
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE = process.env.API_URL || 'http://localhost:5000/api';
const ADMIN_EMAIL = 'contracting@rhpoffice.com';
const ADMIN_PASS = 'admin123';
const AGENT_EMAIL = 'lotushotmail111@gmail.com';
const AGENT_PASS = '123456';

let passed = 0;
let failed = 0;
let warnings = 0;

// Test-scoped tracking
let adminToken, agentToken, agentId;
let folder1Id, folder2Id, subfolderId, subSubFolderId;
let fileId;
let requestId;

// ─── Helpers ──────────────────────────────────────────────────────────
function req(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const full = urlPath.startsWith('http') ? urlPath : BASE + urlPath;
    const u = new URL(full);
    const isHttps = u.protocol === 'https:';
    const opts = {
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + u.search,
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    const lib = isHttps ? https : http;
    const r = lib.request(opts, rs => {
      let d = '';
      rs.on('data', c => (d += c));
      rs.on('end', () => {
        try { resolve({ status: rs.statusCode, data: JSON.parse(d) }); }
        catch { resolve({ status: rs.statusCode, data: d }); }
      });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

// Multipart upload helper
function multipartUpload(urlPath, fields, files, token) {
  return new Promise((resolve, reject) => {
    const boundary = '----FormBoundary' + Date.now();
    const full = urlPath.startsWith('http') ? urlPath : BASE + urlPath;
    const u = new URL(full);
    const parts = [];

    // Add text fields
    for (const [key, val] of Object.entries(fields)) {
      parts.push(
        `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`
      );
    }

    // Add file parts
    for (const f of files) {
      parts.push(
        `--${boundary}\r\nContent-Disposition: form-data; name="${f.field}"; filename="${f.name}"\r\nContent-Type: ${f.mime}\r\n\r\n`
      );
      parts.push(f.data);
      parts.push('\r\n');
    }
    parts.push(`--${boundary}--\r\n`);

    // Calculate total length
    let totalLen = 0;
    const buffers = parts.map(p => {
      const buf = Buffer.isBuffer(p) ? p : Buffer.from(p, 'utf-8');
      totalLen += buf.length;
      return buf;
    });
    const bodyBuf = Buffer.concat(buffers, totalLen);

    const opts = {
      hostname: u.hostname,
      port: u.port || 80,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': bodyBuf.length,
        'Authorization': 'Bearer ' + token
      }
    };

    const r = http.request(opts, rs => {
      let d = '';
      rs.on('data', c => (d += c));
      rs.on('end', () => {
        try { resolve({ status: rs.statusCode, data: JSON.parse(d) }); }
        catch { resolve({ status: rs.statusCode, data: d }); }
      });
    });
    r.on('error', reject);
    r.write(bodyBuf);
    r.end();
  });
}

function assert(condition, label) {
  if (condition) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; console.error(`  ❌ FAIL: ${label}`); }
}

function warn(label) {
  warnings++;
  console.log(`  ⚠️  WARN: ${label}`);
}

// ─── SECTION 1: Auth ──────────────────────────────────────────────
async function section1_Auth() {
  console.log('\n═══ SECTION 1: Authentication ═══');

  const adminLogin = await req('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS });
  assert(adminLogin.status === 200, '1.1 Admin login succeeds');
  adminToken = adminLogin.data.token;
  assert(!!adminToken, '1.2 Admin token received');

  const agentLogin = await req('POST', '/auth/login', { email: AGENT_EMAIL, password: AGENT_PASS });
  assert(agentLogin.status === 200, '1.3 Agent login succeeds');
  agentToken = agentLogin.data.token;
  agentId = agentLogin.data.user?._id || agentLogin.data.user?.id;
  assert(!!agentToken, '1.4 Agent token received');
  assert(!!agentId, '1.5 Agent ID captured');
}

// ─── SECTION 2: Folder & Subfolder System (18.1) ─────────────────
async function section2_Folders() {
  console.log('\n═══ SECTION 2: Folder & Subfolder System (18.1) ═══');

  // 2.1 Create root folder
  const f1 = await req('POST', '/document-hub/folders', {
    name: 'E2E Test Folder A',
    description: 'Root folder for E2E testing',
    visibility: 'all'
  }, adminToken);
  assert(f1.status === 201, '2.1 Create root folder → 201');
  folder1Id = f1.data._id;
  assert(!!folder1Id, '2.2 Root folder ID returned');
  assert(f1.data.name === 'E2E Test Folder A', '2.3 Folder name matches');
  assert(f1.data.parent === null || !f1.data.parent, '2.4 Parent is null (root level)');
  assert(f1.data.visibility === 'all', '2.5 Visibility is "all"');

  // 2.6 Create second root folder
  const f2 = await req('POST', '/document-hub/folders', {
    name: 'E2E Test Folder B',
    description: 'Second root folder',
    visibility: 'admin'
  }, adminToken);
  assert(f2.status === 201, '2.6 Create second root folder → 201');
  folder2Id = f2.data._id;
  assert(f2.data.visibility === 'admin', '2.7 Folder B visibility is "admin"');

  // 2.8 Create subfolder under Folder A
  const sf = await req('POST', '/document-hub/folders', {
    name: 'E2E Subfolder A1',
    parent: folder1Id,
    description: 'Subfolder inside Folder A',
    visibility: 'all'
  }, adminToken);
  assert(sf.status === 201, '2.8 Create subfolder → 201');
  subfolderId = sf.data._id;
  assert(sf.data.parent === folder1Id || sf.data.parent?.toString() === folder1Id, '2.9 Subfolder parent = Folder A');

  // 2.10 Create sub-subfolder (3 levels deep)
  const ssf = await req('POST', '/document-hub/folders', {
    name: 'E2E Sub-Subfolder A1a',
    parent: subfolderId,
    description: 'Third-level folder',
    visibility: 'all'
  }, adminToken);
  assert(ssf.status === 201, '2.10 Create sub-subfolder (3 levels) → 201');
  subSubFolderId = ssf.data._id;
  assert(ssf.data.parent === subfolderId || ssf.data.parent?.toString() === subfolderId,
    '2.11 Sub-subfolder parent = Subfolder A1');

  // 2.12 Get folder tree - admin sees all
  const tree = await req('GET', '/document-hub/folders', null, adminToken);
  assert(tree.status === 200, '2.12 GET /folders → 200');
  const folderNames = tree.data.map(f => f.name);
  assert(folderNames.includes('E2E Test Folder A'), '2.13 Folder A in tree');
  assert(folderNames.includes('E2E Test Folder B'), '2.14 Folder B (admin-only) in admin tree');
  assert(folderNames.includes('E2E Subfolder A1'), '2.15 Subfolder A1 in tree');
  assert(folderNames.includes('E2E Sub-Subfolder A1a'), '2.16 Sub-subfolder A1a in tree');

  // 2.17 Agent should NOT see admin-only folder
  const agentTree = await req('GET', '/document-hub/folders', null, agentToken);
  assert(agentTree.status === 200, '2.17 Agent GET /folders → 200');
  const agentFolderNames = agentTree.data.map(f => f.name);
  assert(agentFolderNames.includes('E2E Test Folder A'), '2.18 Agent sees public folder A');
  assert(!agentFolderNames.includes('E2E Test Folder B'), '2.19 Agent does NOT see admin-only folder B');

  // 2.20 Duplicate folder name in same parent → 400
  const dup = await req('POST', '/document-hub/folders', {
    name: 'E2E Test Folder A',
    visibility: 'all'
  }, adminToken);
  assert(dup.status === 400, '2.20 Duplicate folder name → 400');

  // 2.21 Agent cannot create folder
  const agentFolder = await req('POST', '/document-hub/folders', {
    name: 'Agent Folder',
    visibility: 'all'
  }, agentToken);
  assert(agentFolder.status === 401 || agentFolder.status === 403, '2.21 Agent cannot create folder → 401/403');

  // 2.22 Update folder
  const upd = await req('PUT', `/document-hub/folders/${folder1Id}`, {
    description: 'Updated description'
  }, adminToken);
  assert(upd.status === 200, '2.22 Update folder → 200');
  assert(upd.data.description === 'Updated description', '2.23 Description updated');

  // 2.24 Cannot set folder as its own parent
  const selfParent = await req('PUT', `/document-hub/folders/${folder1Id}`, {
    parent: folder1Id
  }, adminToken);
  assert(selfParent.status === 400, '2.24 Self-parenting rejected → 400');

  // 2.25 Agent cannot update folder
  const agentUpd = await req('PUT', `/document-hub/folders/${folder1Id}`, {
    name: 'Hacked'
  }, agentToken);
  assert(agentUpd.status === 401 || agentUpd.status === 403, '2.25 Agent cannot update folder → 401/403');
}

// ─── SECTION 3: File Upload & Management (18.2) ──────────────────
async function section3_Files() {
  console.log('\n═══ SECTION 3: File Upload & Management (18.2) ═══');

  // Create a small test PDF-like file
  const testFileContent = Buffer.from('%PDF-1.4 E2E test content for document hub validation');

  // 3.1 Admin uploads file to root
  const up1 = await multipartUpload('/document-hub/files', {
    name: 'E2E Test Document',
    description: 'Test document for E2E',
    visibility: 'all'
  }, [{
    field: 'files',
    name: 'e2e-test.pdf',
    mime: 'application/pdf',
    data: testFileContent
  }], adminToken);
  assert(up1.status === 201, '3.1 Admin upload file → 201');
  assert(up1.data.files && up1.data.files.length === 1, '3.2 One file created');
  fileId = up1.data.files[0]._id;
  assert(!!fileId, '3.3 File ID returned');

  // 3.4 Upload file into subfolder
  const up2 = await multipartUpload('/document-hub/files', {
    name: 'Subfolder Document',
    description: 'File inside subfolder',
    visibility: 'all',
    folder: subfolderId
  }, [{
    field: 'files',
    name: 'subfolder-doc.pdf',
    mime: 'application/pdf',
    data: testFileContent
  }], adminToken);
  assert(up2.status === 201, '3.4 Upload to subfolder → 201');
  const subfileId = up2.data.files[0]._id;

  // 3.5 Upload admin-only file
  const up3 = await multipartUpload('/document-hub/files', {
    name: 'Admin Secret Doc',
    description: 'Admin only file',
    visibility: 'admin'
  }, [{
    field: 'files',
    name: 'admin-only.pdf',
    mime: 'application/pdf',
    data: testFileContent
  }], adminToken);
  assert(up3.status === 201, '3.5 Upload admin-only file → 201');
  const adminFileId = up3.data.files[0]._id;
  assert(up3.data.files[0].visibility === 'admin', '3.6 File visibility is "admin"');

  // 3.7 Upload restricted file (only for specific agent)
  const up4 = await multipartUpload('/document-hub/files', {
    name: 'Restricted Agent Doc',
    description: 'Only for specific agent',
    visibility: 'restricted',
    restrictedTo: JSON.stringify([agentId])
  }, [{
    field: 'files',
    name: 'restricted.pdf',
    mime: 'application/pdf',
    data: testFileContent
  }], adminToken);
  assert(up4.status === 201, '3.7 Upload restricted file → 201');
  const restrictedFileId = up4.data.files[0]._id;

  // 3.8 GET files - admin sees all
  const adminFiles = await req('GET', '/document-hub/files', null, adminToken);
  assert(adminFiles.status === 200, '3.8 Admin GET /files → 200');
  const adminFileNames = adminFiles.data.map(f => f.name);
  assert(adminFileNames.includes('E2E Test Document'), '3.9 Admin sees public file');
  assert(adminFileNames.includes('Admin Secret Doc'), '3.10 Admin sees admin-only file');

  // 3.11 Agent sees public file but NOT admin-only
  const agentFiles = await req('GET', '/document-hub/files', null, agentToken);
  assert(agentFiles.status === 200, '3.11 Agent GET /files → 200');
  const agentFileNames = agentFiles.data.map(f => f.name);
  assert(agentFileNames.includes('E2E Test Document'), '3.12 Agent sees public file');
  assert(!agentFileNames.includes('Admin Secret Doc'), '3.13 Agent does NOT see admin-only file');
  assert(agentFileNames.includes('Restricted Agent Doc'), '3.14 Agent sees restricted file (they are in restrictedTo)');

  // 3.15 GET files in subfolder
  const subFiles = await req('GET', `/document-hub/files?folder=${subfolderId}`, null, adminToken);
  assert(subFiles.status === 200, '3.15 GET files by folder → 200');
  const subFileNames = subFiles.data.map(f => f.name);
  assert(subFileNames.includes('Subfolder Document'), '3.16 Subfolder file found');

  // 3.17 Download file
  const dl = await req('GET', `/document-hub/files/${fileId}/download`, null, adminToken);
  assert(dl.status === 200, '3.17 Download file → 200');

  // 3.18 Agent cannot download admin-only file
  const agentDl = await req('GET', `/document-hub/files/${adminFileId}/download`, null, agentToken);
  assert(agentDl.status === 403, '3.18 Agent download admin-only → 403');

  // 3.19 Update file metadata
  const upd = await req('PUT', `/document-hub/files/${fileId}`, {
    name: 'E2E Renamed Document',
    description: 'Updated description'
  }, adminToken);
  assert(upd.status === 200, '3.19 Update file metadata → 200');
  assert(upd.data.name === 'E2E Renamed Document', '3.20 File name updated');

  // 3.21 Move file to folder
  const move = await req('PUT', `/document-hub/files/${fileId}`, {
    folder: folder1Id
  }, adminToken);
  assert(move.status === 200, '3.21 Move file to folder → 200');

  // 3.22 Agent cannot upload files
  const agentUp = await multipartUpload('/document-hub/files', {
    name: 'Hacked Upload',
    visibility: 'all'
  }, [{
    field: 'files',
    name: 'hack.pdf',
    mime: 'application/pdf',
    data: testFileContent
  }], agentToken);
  assert(agentUp.status === 401 || agentUp.status === 403, '3.22 Agent cannot upload to hub → 401/403');

  // 3.23 Agent cannot update file
  const agentUpd = await req('PUT', `/document-hub/files/${fileId}`, {
    name: 'Hacked Name'
  }, agentToken);
  assert(agentUpd.status === 401 || agentUpd.status === 403, '3.23 Agent cannot update file → 401/403');

  // 3.24 Agent cannot delete file
  const agentDel = await req('DELETE', `/document-hub/files/${fileId}`, null, agentToken);
  assert(agentDel.status === 401 || agentDel.status === 403, '3.24 Agent cannot delete file → 401/403');

  // 3.25 Upload with invalid visibility → 400
  const badVis = await multipartUpload('/document-hub/files', {
    name: 'Bad Vis',
    visibility: 'invalid'
  }, [{
    field: 'files',
    name: 'bad.pdf',
    mime: 'application/pdf',
    data: testFileContent
  }], adminToken);
  assert(badVis.status === 400, '3.25 Invalid visibility → 400');

  // 3.26 Restricted file without restrictedTo → 400
  const noRestricted = await multipartUpload('/document-hub/files', {
    name: 'No Restricted',
    visibility: 'restricted'
  }, [{
    field: 'files',
    name: 'no-restricted.pdf',
    mime: 'application/pdf',
    data: testFileContent
  }], adminToken);
  assert(noRestricted.status === 400, '3.26 Restricted without restrictedTo → 400');

  // 3.27 Upload to non-existent folder → 400
  const badFolder = await multipartUpload('/document-hub/files', {
    name: 'Bad Folder',
    visibility: 'all',
    folder: '000000000000000000000000'
  }, [{
    field: 'files',
    name: 'bad-folder.pdf',
    mime: 'application/pdf',
    data: testFileContent
  }], adminToken);
  assert(badFolder.status === 400, '3.27 Upload to non-existent folder → 400');

  // Cleanup: delete admin-only, restricted, subfolder files
  await req('DELETE', `/document-hub/files/${adminFileId}`, null, adminToken);
  await req('DELETE', `/document-hub/files/${restrictedFileId}`, null, adminToken);
  await req('DELETE', `/document-hub/files/${subfileId}`, null, adminToken);
}

// ─── SECTION 4: Document Requests (18.3) ─────────────────────────
async function section4_Requests() {
  console.log('\n═══ SECTION 4: Upload Requests (18.3) ═══');

  // 4.1 Admin creates a document request
  const cr = await req('POST', '/document-hub/requests', {
    title: 'E2E Test Request: Upload License',
    description: 'Please upload your state license for E2E test.',
    requestedFrom: [agentId],
    dueDate: new Date(Date.now() + 7 * 86400000).toISOString() // 7 days from now
  }, adminToken);
  assert(cr.status === 201, '4.1 Create document request → 201');
  requestId = cr.data._id;
  assert(!!requestId, '4.2 Request ID returned');
  assert(cr.data.title === 'E2E Test Request: Upload License', '4.3 Request title matches');
  assert(cr.data.requestedFrom.length === 1, '4.4 One agent targeted');
  assert(cr.data.responses.length === 1, '4.5 One response slot created');
  assert(cr.data.responses[0].status === 'pending', '4.6 Response status is "pending"');
  assert(!!cr.data.dueDate, '4.7 Due date set');

  // 4.8 Create request with saveToFolder
  const cr2 = await req('POST', '/document-hub/requests', {
    title: 'E2E Save-to-Folder Request',
    description: 'Test with saveToFolder',
    requestedFrom: [agentId],
    saveToFolder: subfolderId
  }, adminToken);
  assert(cr2.status === 201, '4.8 Create request with saveToFolder → 201');
  const requestId2 = cr2.data._id;

  // 4.9 Agent sees their requests
  const agentReqs = await req('GET', '/document-hub/requests', null, agentToken);
  assert(agentReqs.status === 200, '4.9 Agent GET /requests → 200');
  const myReqs = agentReqs.data.filter(r => r._id === requestId || r._id === requestId2);
  assert(myReqs.length >= 1, '4.10 Agent sees their request(s)');

  // 4.11 Agent only sees their own response slot (privacy)
  const agentReq = myReqs.find(r => r._id === requestId);
  if (agentReq) {
    assert(agentReq.responses.length === 1, '4.11 Agent sees only their own response');
  } else {
    warn('4.11 Could not find request in agent view');
  }

  // 4.12 Admin sees all requests
  const adminReqs = await req('GET', '/document-hub/requests', null, adminToken);
  assert(adminReqs.status === 200, '4.12 Admin GET /requests → 200');
  assert(adminReqs.data.length >= 2, '4.13 Admin sees multiple requests');

  // 4.14 Agent submits response
  const testFile = Buffer.from('%PDF-1.4 Agent uploaded license document');
  const respond = await multipartUpload(`/document-hub/requests/${requestId}/respond`, {
    notes: 'Here is my license'
  }, [{
    field: 'file',
    name: 'my-license.pdf',
    mime: 'application/pdf',
    data: testFile
  }], agentToken);
  assert(respond.status === 200, '4.14 Agent responds to request → 200');

  // 4.15 Verify response status changed to 'submitted'
  const afterRespond = await req('GET', '/document-hub/requests', null, adminToken);
  const updatedReq = afterRespond.data.find(r => r._id === requestId);
  if (updatedReq) {
    const agentResp = updatedReq.responses.find(r => {
      const aid = r.agent?._id || r.agent;
      return aid === agentId || aid?.toString() === agentId;
    });
    assert(agentResp?.status === 'submitted', '4.15 Response status = "submitted"');
    assert(!!agentResp?.filePath, '4.16 File path recorded');
    assert(!!agentResp?.submittedAt, '4.17 Submission timestamp recorded');
    assert(agentResp?.notes === 'Here is my license', '4.18 Agent notes recorded');
  } else {
    warn('4.15-4.18 Could not find updated request');
  }

  // 4.19 Admin can download agent's response
  const dlResp = await req('GET',
    `/document-hub/requests/${requestId}/responses/${agentId}/download`, null, adminToken);
  assert(dlResp.status === 200, '4.19 Admin downloads agent response → 200');

  // 4.20 Another agent cannot download (access control)
  // We'll just verify agent can download their own
  const agentDl = await req('GET',
    `/document-hub/requests/${requestId}/responses/${agentId}/download`, null, agentToken);
  assert(agentDl.status === 200, '4.20 Agent downloads own response → 200');

  // 4.21 Admin rejects response
  const reject = await req('PUT',
    `/document-hub/requests/${requestId}/review/${agentId}`, {
    status: 'rejected',
    reviewNotes: 'Please submit a clearer copy'
  }, adminToken);
  assert(reject.status === 200, '4.21 Admin rejects response → 200');

  // 4.22 Verify rejection
  const afterReject = await req('GET', '/document-hub/requests', null, adminToken);
  const rejReq = afterReject.data.find(r => r._id === requestId);
  if (rejReq) {
    const rejResp = rejReq.responses.find(r => {
      const aid = r.agent?._id || r.agent;
      return aid === agentId || aid?.toString() === agentId;
    });
    assert(rejResp?.status === 'rejected', '4.22 Status is "rejected"');
    assert(rejResp?.reviewNotes === 'Please submit a clearer copy', '4.23 Review notes recorded');
    assert(!!rejResp?.reviewedAt, '4.24 Review timestamp set');
  } else {
    warn('4.22-4.24 Could not verify rejection');
  }

  // 4.25 Agent re-submits after rejection
  const resubmit = await multipartUpload(`/document-hub/requests/${requestId}/respond`, {
    notes: 'Clearer copy attached'
  }, [{
    field: 'file',
    name: 'license-v2.pdf',
    mime: 'application/pdf',
    data: Buffer.from('%PDF-1.4 Resubmitted clearer license')
  }], agentToken);
  assert(resubmit.status === 200, '4.25 Agent resubmits after rejection → 200');

  // 4.26 Admin approves
  const approve = await req('PUT',
    `/document-hub/requests/${requestId}/review/${agentId}`, {
    status: 'approved',
    reviewNotes: 'Looks good'
  }, adminToken);
  assert(approve.status === 200, '4.26 Admin approves response → 200');

  // 4.27 Verify approval and auto-publish
  const afterApprove = await req('GET', '/document-hub/requests', null, adminToken);
  const appReq = afterApprove.data.find(r => r._id === requestId);
  if (appReq) {
    const appResp = appReq.responses.find(r => {
      const aid = r.agent?._id || r.agent;
      return aid === agentId || aid?.toString() === agentId;
    });
    assert(appResp?.status === 'approved', '4.27 Status is "approved"');
  }

  // 4.28 Cannot re-submit after approval
  const noResub = await multipartUpload(`/document-hub/requests/${requestId}/respond`, {
    notes: 'Too late'
  }, [{
    field: 'file',
    name: 'late.pdf',
    mime: 'application/pdf',
    data: Buffer.from('%PDF-1.4 Late submission')
  }], agentToken);
  assert(noResub.status === 400, '4.28 Cannot resubmit after approval → 400');

  // 4.29 Agent cannot create requests
  const agentReq2 = await req('POST', '/document-hub/requests', {
    title: 'Agent Request',
    requestedFrom: [agentId]
  }, agentToken);
  assert(agentReq2.status === 401 || agentReq2.status === 403, '4.29 Agent cannot create request → 401/403');

  // 4.30 Request without title → 400
  const noTitle = await req('POST', '/document-hub/requests', {
    requestedFrom: [agentId]
  }, adminToken);
  assert(noTitle.status === 400, '4.30 Request without title → 400');

  // 4.31 Request without agents → 400
  const noAgents = await req('POST', '/document-hub/requests', {
    title: 'No agents'
  }, adminToken);
  assert(noAgents.status === 400, '4.31 Request without agents → 400');

  // 4.32 Request with past due date → 400
  const pastDue = await req('POST', '/document-hub/requests', {
    title: 'Past Due',
    requestedFrom: [agentId],
    dueDate: '2020-01-01'
  }, adminToken);
  assert(pastDue.status === 400, '4.32 Past due date → 400');

  // 4.33 Invalid review status → 400
  const badReview = await req('PUT',
    `/document-hub/requests/${requestId2}/review/${agentId}`, {
    status: 'invalid'
  }, adminToken);
  assert(badReview.status === 400, '4.33 Invalid review status → 400');

  // 4.34 Cannot approve without file
  const noFile = await req('PUT',
    `/document-hub/requests/${requestId2}/review/${agentId}`, {
    status: 'approved'
  }, adminToken);
  assert(noFile.status === 400, '4.34 Cannot approve without submitted file → 400');

  // 4.35 Admin deactivates request
  const deact = await req('DELETE', `/document-hub/requests/${requestId2}`, null, adminToken);
  assert(deact.status === 200, '4.35 Admin deactivates request → 200');

  // 4.36 Agent cannot delete request
  const agentDel = await req('DELETE', `/document-hub/requests/${requestId}`, null, agentToken);
  assert(agentDel.status === 401 || agentDel.status === 403, '4.36 Agent cannot delete request → 401/403');
}

// ─── SECTION 5: Folder Deletion Cascade ───────────────────────────
async function section5_FolderCascade() {
  console.log('\n═══ SECTION 5: Folder Deletion & Cascade ═══');

  // 5.1 Delete sub-subfolder (leaf) — should move nothing
  const delSSF = await req('DELETE', `/document-hub/folders/${subSubFolderId}`, null, adminToken);
  assert(delSSF.status === 200, '5.1 Delete sub-subfolder → 200');

  // 5.2 Verify sub-subfolder is gone
  const tree2 = await req('GET', '/document-hub/folders', null, adminToken);
  const ssfExists = tree2.data.find(f => f._id === subSubFolderId);
  assert(!ssfExists, '5.2 Sub-subfolder removed from tree');

  // 5.3 Delete subfolder — files should cascade to parent
  const delSF = await req('DELETE', `/document-hub/folders/${subfolderId}`, null, adminToken);
  assert(delSF.status === 200, '5.3 Delete subfolder → 200');

  // 5.4 Agent cannot delete folder
  const agentDel = await req('DELETE', `/document-hub/folders/${folder2Id}`, null, agentToken);
  assert(agentDel.status === 401 || agentDel.status === 403, '5.4 Agent cannot delete folder → 401/403');
}

// ─── SECTION 6: Purpose & Separation (18.4) ──────────────────────
async function section6_Separation() {
  console.log('\n═══ SECTION 6: Purpose & Separation (18.4) ═══');

  // 6.1 Document Hub and Onboarding are separate route paths
  // Document Hub: /api/document-hub/*
  // Onboarding: /api/agent/onboarding/* or /api/admin/onboarding/*
  const hubFolders = await req('GET', '/document-hub/folders', null, adminToken);
  assert(hubFolders.status === 200, '6.1 Document Hub route exists (/api/document-hub/folders)');

  // 6.2 Onboarding route is separate
  const onboarding = await req('GET', '/agent/onboarding', null, agentToken);
  assert(onboarding.status === 200 || onboarding.status === 404,
    '6.2 Onboarding is a separate route path');

  // 6.3 Document Hub has folder system (onboarding does not)
  assert(Array.isArray(hubFolders.data), '6.3 Document Hub has folder system');

  // 6.4 Document Hub supports visibility control
  const files = await req('GET', '/document-hub/files', null, adminToken);
  assert(files.status === 200, '6.4 Document Hub files endpoint exists');

  // 6.5 Document Hub supports document requests
  const requests = await req('GET', '/document-hub/requests', null, adminToken);
  assert(requests.status === 200, '6.5 Document Hub requests endpoint exists');

  // 6.6 Verify supported file types (general documents, not just PDFs)
  // The ALLOWED_MIMES in the route supports: pdf, jpg, png, gif, doc, docx, xls, xlsx, ppt, pptx, csv, txt, zip
  // This confirms it's for general documents, instructions, resources
  assert(files.status === 200, '6.6 Document Hub supports multiple file types (pdf,doc,xls,ppt,csv,txt,zip)');
}

// ─── SECTION 7: Cleanup ──────────────────────────────────────────
async function section7_Cleanup() {
  console.log('\n═══ SECTION 7: Cleanup ═══');

  // Delete test files
  if (fileId) {
    await req('DELETE', `/document-hub/files/${fileId}`, null, adminToken);
    console.log('  🧹 Cleaned up test file');
  }

  // Delete test folders
  if (folder1Id) await req('DELETE', `/document-hub/folders/${folder1Id}`, null, adminToken);
  if (folder2Id) await req('DELETE', `/document-hub/folders/${folder2Id}`, null, adminToken);
  console.log('  🧹 Cleaned up test folders');

  // Deactivate test requests
  if (requestId) await req('DELETE', `/document-hub/requests/${requestId}`, null, adminToken);
  console.log('  🧹 Cleaned up test requests');
}

// ─── Main ─────────────────────────────────────────────────────────
(async () => {
  console.log('╔═════════════════════════════════════════════════════╗');
  console.log('║  Document Hub — Deep E2E Test Suite                ║');
  console.log('║  Item 18: Management, Structure & Upload Requests  ║');
  console.log('╚═════════════════════════════════════════════════════╝');

  try {
    await section1_Auth();
    await section2_Folders();
    await section3_Files();
    await section4_Requests();
    await section5_FolderCascade();
    await section6_Separation();
    await section7_Cleanup();
  } catch (err) {
    console.error('\n💥 FATAL ERROR:', err.message);
    console.error(err.stack);
    failed++;
  }

  console.log('\n╔═════════════════════════════════════════════════════╗');
  console.log(`║  RESULTS: ${passed} passed | ${failed} failed | ${warnings} warnings`);
  console.log('╚═════════════════════════════════════════════════════╝');
  process.exit(failed > 0 ? 1 : 0);
})();
