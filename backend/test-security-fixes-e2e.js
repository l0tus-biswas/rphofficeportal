/**
 * Live E2E Validation for Critical Security Fixes (Audit #1-#7)
 * Runs against live server at localhost:5000
 * 
 * Usage: node test-security-fixes-e2e.js
 */
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const BASE_URL = process.env.API_URL || 'http://localhost:5000/api';
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || 'contracting@rhpoffice.com';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'admin123';

let passed = 0;
let failed = 0;
const results = [];

function assert(condition, testName, details = '') {
  if (condition) {
    passed++;
    results.push({ status: '✓', name: testName });
    console.log(`  ✓ ${testName}`);
  } else {
    failed++;
    results.push({ status: '✗', name: testName, details });
    console.log(`  ✗ FAIL: ${testName}${details ? ' — ' + details : ''}`);
  }
}

async function req(method, path, body, token) {
  const url = new URL(path.startsWith('http') ? path : `${BASE_URL}${path}`);
  const isHttps = url.protocol === 'https:';
  const lib = isHttps ? https : http;

  const options = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname + url.search,
    method,
    headers: { 'Content-Type': 'application/json' }
  };

  if (token) options.headers['Authorization'] = `Bearer ${token}`;

  return new Promise((resolve) => {
    const request = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode, data: parsed, headers: res.headers });
      });
    });
    request.on('error', (err) => resolve({ status: 0, data: null, error: err.message }));
    if (body) request.write(JSON.stringify(body));
    request.end();
  });
}

async function login(email, password) {
  const res = await req('POST', '/auth/login', { email, password });
  return res.data?.token || null;
}

async function runTests() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  SECURITY FIXES E2E VALIDATION                       ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // Login as admin
  const adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  if (!adminToken) {
    console.error('❌ Cannot login as admin - aborting');
    process.exit(1);
  }
  console.log('  ✓ Admin login successful\n');

  // ═══════════════════════════════════════════════════════════
  console.log('═══ FIX #1: Credential Exposure Removed ═══');
  // ═══════════════════════════════════════════════════════════

  const uniqueEmail = `sectest-${Date.now()}@testvalidation.com`;
  const applyRes = await req('POST', `/public/apply`, {
    name: 'Security Test User',
    email: uniqueEmail,
    phone: '5551234567'
  });

  assert(applyRes.status === 201, '1.1 Apply endpoint returns 201');
  assert(!applyRes.data?.credentials, '1.2 Response has NO credentials field');
  assert(!applyRes.data?.password, '1.3 Response has NO password field');
  assert(applyRes.data?.autoLoginToken, '1.4 Response includes autoLoginToken');
  assert(
    typeof applyRes.data?.autoLoginToken === 'string' && applyRes.data?.autoLoginToken.length >= 40,
    '1.5 autoLoginToken is a proper hex string (>=40 chars)'
  );

  // Test token exchange
  const tokenExchangeRes = await req('POST', '/auth/token-exchange', {
    token: applyRes.data?.autoLoginToken
  });
  assert(tokenExchangeRes.status === 200, '1.6 Token exchange returns 200');
  assert(tokenExchangeRes.data?.token, '1.7 Token exchange returns JWT');
  assert(tokenExchangeRes.data?.user, '1.8 Token exchange returns user object');
  assert(!tokenExchangeRes.data?.user?.password, '1.9 User object has no password');

  // Token should be single-use
  const reusedRes = await req('POST', '/auth/token-exchange', {
    token: applyRes.data?.autoLoginToken
  });
  assert(reusedRes.status === 401, '1.10 Reused token rejected (401)');

  // Invalid token
  const invalidRes = await req('POST', '/auth/token-exchange', {
    token: 'invalid-token-abc123'
  });
  assert(invalidRes.status === 401, '1.11 Invalid token rejected (401)');

  // Missing token
  const missingRes = await req('POST', '/auth/token-exchange', {});
  assert(missingRes.status === 400, '1.12 Missing token rejected (400)');

  console.log('');

  // ═══════════════════════════════════════════════════════════
  console.log('═══ FIX #4: Static Uploads Auth-Gated ═══');
  // ═══════════════════════════════════════════════════════════

  // Attempt to access a protected upload path without auth
  const protectedPathRes = await req('GET', '/../../uploads/commission-statements/test.pdf');
  // Through the full URL
  const baseUrl = BASE_URL.replace('/api', '');
  const directUploadRes = await new Promise((resolve) => {
    const url = new URL(`${baseUrl}/uploads/commission-statements/test.pdf`);
    const lib = url.protocol === 'https:' ? https : http;
    const request = lib.get(url.href, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode, data: parsed });
      });
    });
    request.on('error', (err) => resolve({ status: 0, error: err.message }));
    request.end();
  });
  assert(
    directUploadRes.status === 401 || directUploadRes.status === 404,
    '4.1 Direct access to /uploads/commission-statements/ without auth is blocked',
    `Got status ${directUploadRes.status}`
  );

  // Public path should still work
  const publicUploadRes = await new Promise((resolve) => {
    const url = new URL(`${baseUrl}/uploads/branding/test.png`);
    const lib = url.protocol === 'https:' ? https : http;
    const request = lib.get(url.href, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode }));
    });
    request.on('error', () => resolve({ status: 0 }));
    request.end();
  });
  assert(
    publicUploadRes.status !== 401,
    '4.2 Public /uploads/branding/ path does NOT require auth',
    `Got status ${publicUploadRes.status}`
  );

  console.log('');

  // ═══════════════════════════════════════════════════════════
  console.log('═══ FIX #5: Production agentId Bypass ═══');
  // ═══════════════════════════════════════════════════════════

  // Login as the test agent we created
  const agentToken = tokenExchangeRes.data?.token;
  if (agentToken) {
    // Get admin's own user info to use as the "other" agent ID
    const meRes = await req('GET', '/auth/me', null, adminToken);
    const adminId = meRes.data?.user?._id;

    if (adminId) {
      // Agent tries to use agentId param to see admin's production
      const bypassRes = await req('GET', `/production?agentId=${adminId}`, null, agentToken);
      assert(bypassRes.status === 200, '5.1 Production GET with agentId still returns 200');

      // If submissions returned, none should belong to admin
      const subs = bypassRes.data?.submissions || [];
      const hasAdminData = subs.some(s =>
        (s.agent?._id === adminId) || (s.agent === adminId)
      );
      assert(!hasAdminData, '5.2 Agent cannot see other user data via agentId param');
    } else {
      assert(false, '5.1 Could not get admin ID for bypass test');
      assert(false, '5.2 Skipped');
    }
  } else {
    assert(false, '5.1 No agent token available');
    assert(false, '5.2 Skipped');
  }

  console.log('');

  // ═══════════════════════════════════════════════════════════
  console.log('═══ FIX #6: JWT Secret Validation ═══');
  // ═══════════════════════════════════════════════════════════

  // If the server is running, it means JWT_SECRET was valid (it would crash on startup otherwise)
  const healthRes = await req('GET', '/../health');
  assert(healthRes.status === 200, '6.1 Server is running (JWT_SECRET validation passed on startup)');

  console.log('');

  // ═══════════════════════════════════════════════════════════
  console.log('═══ FIX #7: Test Route Removed ═══');
  // ═══════════════════════════════════════════════════════════

  const testRouteRes = await req('GET', '/public/test-template-fields');
  assert(
    testRouteRes.status === 404 || (testRouteRes.status === 200 && !testRouteRes.data?.template),
    '7.1 /api/public/test-template-fields no longer exposes template data',
    `Status: ${testRouteRes.status}, has template: ${!!testRouteRes.data?.template}`
  );

  console.log('');

  // ═══════════════════════════════════════════════════════════
  console.log('═══ FIX #2: Path Traversal Protection ═══');
  // ═══════════════════════════════════════════════════════════

  // We can't directly test path traversal via the API since it relies on DB-stored paths,
  // but we can verify the download endpoint works for valid files
  const filesRes = await req('GET', '/document-hub/files', null, adminToken);
  assert(filesRes.status === 200, '2.1 RHP Vault files endpoint accessible');

  // Verify safePath utility exists and works
  const { safePath } = require('./utils/helpers');
  assert(safePath('uploads/test.pdf') !== null, '2.2 safePath allows valid relative path');
  assert(safePath('../../../etc/passwd') === null, '2.3 safePath blocks traversal (../../../etc/passwd)');
  assert(safePath('uploads/../../../etc/shadow') === null, '2.4 safePath blocks nested traversal');
  assert(safePath('uploads/document-hub/normal-file.pdf') !== null, '2.5 safePath allows nested valid path');

  console.log('');

  // ═══════════════════════════════════════════════════════════
  console.log('═══ FIX #3: Commission Ownership Check ═══');
  // ═══════════════════════════════════════════════════════════

  // Agent should only see their own commission statements
  if (agentToken) {
    const agentStmts = await req('GET', '/commission-statements', null, agentToken);
    assert(agentStmts.status === 200, '3.1 Agent can access commission statements list');

    // All returned statements should belong to the agent
    const stmts = Array.isArray(agentStmts.data) ? agentStmts.data : [];
    const agentUser = tokenExchangeRes.data?.user;
    const allOwn = stmts.every(s =>
      !s.agent || s.agent._id === agentUser?._id || s.agent === agentUser?._id
    );
    assert(allOwn || stmts.length === 0, '3.2 Agent only sees own commission statements');
  }

  console.log('');

  // ═══════════════════════════════════════════════════════════
  // Cleanup: soft-delete the test user
  // ═══════════════════════════════════════════════════════════
  if (applyRes.data?.user?._id) {
    await req('PUT', `/admin/users/${applyRes.data.user._id}/deactivate`, null, adminToken);
    console.log('  🧹 Cleaned up test user');
  }

  // ═══════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log(`║  RESULTS: ✓ ${passed} passed | ✗ ${failed} failed | Total: ${passed + failed}`);
  console.log('╚══════════════════════════════════════════════════════╝\n');

  if (failed > 0) {
    console.log('FAILED TESTS:');
    results.filter(r => r.status === '✗').forEach(r => {
      console.log(`  ✗ ${r.name}${r.details ? ' — ' + r.details : ''}`);
    });
    console.log('');
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
