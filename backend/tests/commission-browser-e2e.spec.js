/**
 * Commission Statements - Live Browser Deep E2E Test (v2)
 * Comprehensive single-flow test from both admin and agent perspectives.
 * Uses token injection + network waiting for reliability with Angular SPAs.
 * 
 * Run: npx playwright test --config=playwright.config.js
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:5000';
const API_URL = 'http://localhost:5000/api';
const ADMIN_EMAIL = 'contracting@rhpoffice.com';
const ADMIN_PASS = 'admin123';
const AGENT_EMAIL = 'lotushotmail111@gmail.com';
const AGENT_PASS = '123456';

// Create test PDF files for upload
const TEST_PDF_DIR = path.join(__dirname, '..', 'uploads');
const TEST_PDF_PATH = path.join(TEST_PDF_DIR, 'test-browser-stmt.pdf');
const TEST_PDF_PATH2 = path.join(TEST_PDF_DIR, 'test-browser-stmt-2.pdf');

test.beforeAll(async () => {
  if (!fs.existsSync(TEST_PDF_DIR)) fs.mkdirSync(TEST_PDF_DIR, { recursive: true });
  fs.writeFileSync(TEST_PDF_PATH, Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF browser-test'));
  fs.writeFileSync(TEST_PDF_PATH2, Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF browser-test-2'));
});

test.afterAll(async () => {
  try { fs.unlinkSync(TEST_PDF_PATH); } catch {}
  try { fs.unlinkSync(TEST_PDF_PATH2); } catch {}
});

/**
 * Login by getting token via API and injecting into localStorage.
 * Then navigates directly to the target page.
 */
async function loginAndGo(page, email, password, targetPath) {
  // Get token via Playwright's API context (bypasses browser)
  const response = await page.request.post(`${API_URL}/auth/login`, {
    data: { email, password }
  });
  const data = await response.json();
  if (!data.token) throw new Error(`Login failed for ${email}: ${JSON.stringify(data)}`);

  // Go to app root to set localStorage on the correct origin
  await page.goto(BASE_URL, { waitUntil: 'commit' });

  // Inject auth state
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  }, { token: data.token, user: data.user });

  // Navigate to target page - wait for the API response that loads data
  const responsePromise = page.waitForResponse(resp => 
    resp.url().includes('/api/commission-statements') && resp.request().method() === 'GET',
    { timeout: 15000 }
  ).catch(() => null); // Don't fail if no matching response

  await page.goto(`${BASE_URL}/${targetPath}`, { waitUntil: 'networkidle' });
  await responsePromise;
  await page.waitForTimeout(500); // Extra settle time for Angular rendering

  // Dismiss any broadcast popup overlay that may appear
  const dismissBtn = page.locator('button:has-text("Dismiss")');
  if (await dismissBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await dismissBtn.click();
    await page.waitForTimeout(300);
  }
}

// ═══════════════════════════════════════════════════════════════
// ADMIN FULL FLOW TEST
// ═══════════════════════════════════════════════════════════════
test.describe.serial('Admin Commission Statements - Full UI Flow', () => {
  let page;
  let uploadedStatementId = null;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterAll(async () => {
    // Cleanup: delete test statements via API
    const token = (await (await page.request.post(`${API_URL}/auth/login`, {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASS }
    })).json()).token;

    const listResp = await page.request.get(`${API_URL}/commission-statements`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const stmts = await listResp.json();
    for (const s of stmts) {
      if (s.originalFileName?.includes('test-browser-stmt')) {
        await page.request.delete(`${API_URL}/commission-statements/${s._id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
    }
    await page.close();
  });

  test('A1: Page loads with correct layout', async () => {
    await loginAndGo(page, ADMIN_EMAIL, ADMIN_PASS, 'admin/commission-statements');

    // Verify page heading
    await expect(page.locator('h2.mb-0')).toContainText(/Commission Statements/i);

    // Verify Upload Statement button
    await expect(page.locator('button:has-text("Upload Statement")').first()).toBeVisible();

    // Verify filter section
    await expect(page.locator('select[name="filterAgent"]')).toBeVisible();

    // Verify table or empty state
    const hasTable = await page.locator('table').isVisible().catch(() => false);
    const hasEmpty = await page.locator('text=No commission statements found').isVisible().catch(() => false);
    expect(hasTable || hasEmpty).toBeTruthy();
  });

  test('A2: Upload form opens and shows all fields', async () => {
    // Click Upload Statement button
    await page.locator('button:has-text("Upload Statement")').first().click();
    await page.waitForTimeout(300);

    // Verify form section visible
    await expect(page.locator('text=Upload Commission Statement')).toBeVisible();

    // Verify all form fields
    await expect(page.locator('input[placeholder*="Search agent by name"]')).toBeVisible();
    await expect(page.locator('input[placeholder*="Type carrier"]').first()).toBeVisible();
    await expect(page.locator('input[name="uploadPayPeriod"]')).toBeVisible();
    await expect(page.locator('input[type="file"]').first()).toBeVisible();
    await expect(page.locator('input[name="uploadNotes"]')).toBeVisible();
  });

  test('A3: Agent search typeahead with debounce', async () => {
    const agentInput = page.locator('input[placeholder*="Search agent by name"]');
    
    // Clear and type - use pressSequentially for Angular change detection
    await agentInput.click();
    await agentInput.fill('');
    
    // Wait for API response after typing
    const searchPromise = page.waitForResponse(
      resp => resp.url().includes('/agents/search') && resp.status() === 200,
      { timeout: 10000 }
    );
    
    await agentInput.pressSequentially('lotus', { delay: 80 });
    
    // Wait for the search API to respond
    const searchResp = await searchPromise;
    const searchData = await searchResp.json();
    
    // Wait for dropdown to render
    await page.waitForTimeout(500);
    
    // Verify dropdown appeared with results
    const dropdownItems = page.locator('.list-group-item-action');
    const count = await dropdownItems.count();
    expect(count).toBeGreaterThan(0);
    
    // Select first agent
    await dropdownItems.first().click();
    
    // Verify selection confirmed (green checkmark text)
    await expect(page.locator('small.text-success')).toBeVisible();
  });

  test('A4: Multi-carrier tag input', async () => {
    const carrierInput = page.locator('input[placeholder*="Type carrier"]').first();

    // Add first carrier
    await carrierInput.fill('Aetna');
    await carrierInput.press('Enter');
    await page.waitForTimeout(200);

    // Verify badge appeared
    await expect(page.locator('.badge.bg-primary:has-text("Aetna")')).toBeVisible();

    // Add second carrier
    await carrierInput.fill('Humana');
    await carrierInput.press('Enter');
    await page.waitForTimeout(200);

    // Verify second badge
    await expect(page.locator('.badge.bg-primary:has-text("Humana")')).toBeVisible();

    // Verify both badges present
    const badges = page.locator('.badge.bg-primary');
    expect(await badges.count()).toBeGreaterThanOrEqual(2);
  });

  test('A5: Remove carrier tag', async () => {
    const badges = page.locator('.badge.bg-primary');
    const countBefore = await badges.count();

    // Click close on first badge
    await page.locator('.badge.bg-primary .btn-close').first().click();
    await page.waitForTimeout(200);

    // Verify count decreased
    const countAfter = await page.locator('.badge.bg-primary').count();
    expect(countAfter).toBeLessThan(countBefore);
  });

  test('A6: Date picker and file upload', async () => {
    // Set pay period
    const dateInput = page.locator('input[name="uploadPayPeriod"]');
    await dateInput.fill('2026-05-10');
    await expect(dateInput).toHaveValue('2026-05-10');

    // Upload file
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(TEST_PDF_PATH);

    // Verify file preview shows
    await expect(page.locator('text=test-browser-stmt.pdf')).toBeVisible();
  });

  test('A7: Remove file from preview', async () => {
    // Click remove button on file preview (has title="Remove")
    const removeBtn = page.locator('button[title="Remove"]').first();
    if (await removeBtn.isVisible()) {
      await removeBtn.click();
      await page.waitForTimeout(300);
      // Verify the preview item (small element) is removed
      await expect(page.locator('small:has-text("test-browser-stmt.pdf")')).not.toBeVisible();
    }
  });

  test('A8: Complete upload flow', async () => {
    // Re-attach file
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(TEST_PDF_PATH);
    await page.waitForTimeout(300);

    // Add notes
    await page.locator('input[name="uploadNotes"]').fill('Browser E2E test note');

    // Listen for upload API response
    const uploadPromise = page.waitForResponse(
      resp => resp.url().includes('/commission-statements') && resp.request().method() === 'POST' && resp.status() === 201,
      { timeout: 15000 }
    );

    // Click Upload Statement (the action button inside the card)
    const uploadBtn = page.locator('.card-body button.btn-primary:has-text("Upload Statement")');
    await uploadBtn.click();

    // Wait for upload to complete
    const uploadResp = await uploadPromise;
    const uploadData = await uploadResp.json();
    expect(uploadData.statements?.length).toBeGreaterThan(0);
    uploadedStatementId = uploadData.statements[0]._id;

    // Verify success message
    await expect(page.locator('.alert-success')).toBeVisible({ timeout: 5000 });
  });

  test('A9: Uploaded statement appears in table', async () => {
    await page.waitForTimeout(1000);
    await expect(page.locator('table')).toBeVisible();
    
    // Find our test statement row
    const row = page.locator('tr:has-text("test-browser-stmt")');
    await expect(row.first()).toBeVisible();
    
    // Verify carrier badge in row
    const carrierBadge = row.first().locator('.badge');
    await expect(carrierBadge.first()).toBeVisible();
  });

  test('A10: Download statement', async () => {
    const row = page.locator('tr:has-text("test-browser-stmt")').first();
    const downloadBtn = row.locator('button[title="Download"]');

    const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
    await downloadBtn.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBeTruthy();
  });

  test('A11: Notes modal - open and view', async () => {
    const row = page.locator('tr:has-text("test-browser-stmt")').first();
    const notesBtn = row.locator('button:has(.bi-chat-left-text)');
    await notesBtn.click();
    await page.waitForTimeout(500);

    await expect(page.locator('.modal:visible')).toBeVisible();
    await expect(page.locator('.modal-title:has-text("Notes")')).toBeVisible();
    await expect(page.locator('.modal p:has-text("Browser E2E test note")')).toBeVisible();
  });

  test('A12: Notes modal - add note', async () => {
    const noteInput = page.locator('.modal input[placeholder*="Add a note"]');
    await noteInput.fill('Second note from browser');

    const addPromise = page.waitForResponse(
      resp => resp.url().includes('/notes') && resp.request().method() === 'POST',
      { timeout: 10000 }
    );
    await page.locator('.modal button:has-text("Add")').click();
    await addPromise;
    await page.waitForTimeout(500);

    await expect(page.locator('.modal p:has-text("Second note from browser")')).toBeVisible();
  });

  test('A13: Notes modal - delete note', async () => {
    const notesBefore = await page.locator('.modal .border.rounded').count();
    const deleteBtn = page.locator('.modal button[title="Delete note"]').last();
    
    // Handle confirm dialog
    page.once('dialog', dialog => dialog.accept());
    
    const deletePromise = page.waitForResponse(
      resp => resp.url().includes('/notes/') && resp.request().method() === 'DELETE',
      { timeout: 10000 }
    );
    await deleteBtn.click();
    await deletePromise;
    await page.waitForTimeout(500);

    const notesAfter = await page.locator('.modal .border.rounded').count();
    expect(notesAfter).toBeLessThan(notesBefore);
  });

  test('A14: Close notes modal', async () => {
    await page.locator('.modal button:has-text("Close")').click();
    await page.waitForTimeout(300);
    await expect(page.locator('.modal:visible')).not.toBeVisible();
  });

  test('A15: Edit modal - open', async () => {
    const row = page.locator('tr:has-text("test-browser-stmt")').first();
    await row.locator('button[title="Edit"]').click();
    await page.waitForTimeout(500);

    await expect(page.locator('.modal:has-text("Edit Commission Statement")')).toBeVisible();
    await expect(page.locator('.modal input[type="date"]')).toBeVisible();
  });

  test('A16: Edit modal - change carrier and pay period', async () => {
    // Add carrier
    const carrierInput = page.locator('.modal input[placeholder*="Type carrier"]');
    await carrierInput.fill('Cigna');
    await carrierInput.press('Enter');
    await page.waitForTimeout(200);
    await expect(page.locator('.modal .badge:has-text("Cigna")')).toBeVisible();

    // Change date
    const dateInput = page.locator('.modal input[type="date"]');
    await dateInput.fill('2026-06-20');
    await expect(dateInput).toHaveValue('2026-06-20');
  });

  test('A17: Edit modal - save changes', async () => {
    const savePromise = page.waitForResponse(
      resp => resp.url().includes('/commission-statements/') && resp.request().method() === 'PUT',
      { timeout: 15000 }
    );
    await page.locator('.modal button:has-text("Save Changes")').click();
    await savePromise;
    await page.waitForTimeout(1000);

    await expect(page.locator('.modal:has-text("Edit Commission Statement")')).not.toBeVisible();
    await expect(page.locator('.alert-success')).toBeVisible({ timeout: 5000 });
  });

  test('A18: Filter by agent', async () => {
    const select = page.locator('select[name="filterAgent"]');
    const options = await select.locator('option').allTextContents();
    
    if (options.length > 1) {
      await select.selectOption({ index: 1 });
      const filterPromise = page.waitForResponse(
        resp => resp.url().includes('/commission-statements') && resp.request().method() === 'GET',
        { timeout: 10000 }
      );
      await page.locator('button:has-text("Apply")').click();
      await filterPromise;
      await page.waitForTimeout(500);
    }

    // Reset
    await select.selectOption({ value: '' });
    const resetPromise = page.waitForResponse(
      resp => resp.url().includes('/commission-statements') && resp.request().method() === 'GET',
      { timeout: 10000 }
    );
    await page.locator('button:has-text("Apply")').click();
    await resetPromise;
    await page.waitForTimeout(500);
  });

  test('A19: Delete statement', async () => {
    const row = page.locator('tr:has-text("test-browser-stmt")').first();
    
    if (await row.isVisible()) {
      page.once('dialog', async dialog => await dialog.accept());
      const deletePromise = page.waitForResponse(
        resp => resp.url().includes('/commission-statements/') && resp.request().method() === 'DELETE',
        { timeout: 10000 }
      );
      await row.locator('button[title="Delete"]').click();
      await deletePromise;
      await page.waitForTimeout(1000);

      const hasSuccess = await page.locator('.alert-success').isVisible().catch(() => false);
      expect(hasSuccess).toBeTruthy();
    }
  });

  test('A20: Multi-file upload', async () => {
    // Navigate fresh
    const navPromise = page.waitForResponse(
      resp => resp.url().includes('/commission-statements') && resp.request().method() === 'GET',
      { timeout: 15000 }
    ).catch(() => null);
    await page.goto(`${BASE_URL}/admin/commission-statements`, { waitUntil: 'networkidle' });
    await navPromise;
    await page.waitForTimeout(500);

    // Open form
    await page.locator('button:has-text("Upload Statement")').first().click();
    await page.waitForTimeout(300);

    // Select agent
    const agentInput = page.locator('input[placeholder*="Search agent by name"]');
    await agentInput.click();
    const searchPromise = page.waitForResponse(
      resp => resp.url().includes('/agents/search'), { timeout: 10000 }
    );
    await agentInput.pressSequentially('lotus', { delay: 80 });
    await searchPromise;
    await page.waitForTimeout(500);
    const dropdown = page.locator('.list-group-item-action');
    if (await dropdown.first().isVisible()) await dropdown.first().click();

    // Set date
    await page.locator('input[name="uploadPayPeriod"]').fill('2026-05-20');

    // Upload MULTIPLE files
    await page.locator('input[type="file"]').first().setInputFiles([TEST_PDF_PATH, TEST_PDF_PATH2]);
    await page.waitForTimeout(300);
    await expect(page.locator('text=test-browser-stmt.pdf')).toBeVisible();
    await expect(page.locator('text=test-browser-stmt-2.pdf')).toBeVisible();

    // Submit
    const uploadPromise = page.waitForResponse(
      resp => resp.url().includes('/commission-statements') && resp.request().method() === 'POST',
      { timeout: 15000 }
    );
    await page.locator('.card-body button.btn-primary:has-text("Upload Statement")').click();
    const resp = await uploadPromise;
    const data = await resp.json();
    expect(data.statements?.length).toBe(2);
    await expect(page.locator('.alert-success')).toBeVisible({ timeout: 5000 });
  });
});

// ═══════════════════════════════════════════════════════════════
// AGENT VIEW TESTS
// ═══════════════════════════════════════════════════════════════
test.describe.serial('Agent Commission Statements - UI & Access Control', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('B1: Agent page loads with correct layout', async () => {
    await loginAndGo(page, AGENT_EMAIL, AGENT_PASS, 'commissions');
    await expect(page.locator('h2.mb-0')).toContainText(/Commission Statements/i);    expect(await page.locator('button:has-text("Upload Statement")').count()).toBe(0);
  });

  test('B2: Agent sees filter controls', async () => {
    await expect(page.locator('input[placeholder*="Filter by carrier"]')).toBeVisible();
    await expect(page.locator('input[type="date"]').first()).toBeVisible();
    await expect(page.locator('button:has-text("Filter")')).toBeVisible();
  });

  test('B3: Agent sees statements or empty state', async () => {
    const hasTable = await page.locator('table').isVisible().catch(() => false);
    const hasEmpty = await page.locator('text=No commission statements found').isVisible().catch(() => false);
    expect(hasTable || hasEmpty).toBeTruthy();
  });

  test('B4: Agent has NO edit/delete buttons', async () => {
    expect(await page.locator('button[title="Edit"]').count()).toBe(0);
    expect(await page.locator('button[title="Delete"]').count()).toBe(0);
  });

  test('B5: Agent filter by carrier', async () => {
    await page.locator('input[placeholder*="Filter by carrier"]').fill('Humana');
    const filterPromise = page.waitForResponse(
      resp => resp.url().includes('/commission-statements'), { timeout: 10000 }
    );
    await page.locator('button:has-text("Filter")').click();
    await filterPromise;
    await page.waitForTimeout(500);
    expect(await page.locator('.alert-danger').isVisible().catch(() => false)).toBeFalsy();
  });

  test('B6: Agent filter by date range', async () => {
    await page.locator('input[placeholder*="Filter by carrier"]').fill('');
    await page.locator('input[type="date"]').first().fill('2026-01-01');
    await page.locator('input[type="date"]').last().fill('2026-12-31');
    const filterPromise = page.waitForResponse(
      resp => resp.url().includes('/commission-statements'), { timeout: 10000 }
    );
    await page.locator('button:has-text("Filter")').click();
    await filterPromise;
    await page.waitForTimeout(500);
    expect(await page.locator('.alert-danger').isVisible().catch(() => false)).toBeFalsy();
  });

  test('B7: Agent clear filters', async () => {
    const clearBtn = page.locator('button:has(.bi-x)');
    if (await clearBtn.isVisible()) {
      await clearBtn.click();
      await page.waitForTimeout(1000);
    }
    await expect(page.locator('input[placeholder*="Filter by carrier"]')).toHaveValue('');
  });

  test('B8: Agent can download statement', async () => {
    const rowCount = await page.locator('tbody tr').count();
    if (rowCount > 0) {
      const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
      await page.locator('tbody button:has-text("Download")').first().click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBeTruthy();
    }
  });

  test('B9: Agent sees carrier badges', async () => {
    const rowCount = await page.locator('tbody tr').count();
    if (rowCount > 0) {
      expect(await page.locator('tbody .badge').count()).toBeGreaterThan(0);
    }
  });

  test('B10: Agent cannot see upload/edit/delete', async () => {
    expect(await page.locator('button:has-text("Upload Statement")').count()).toBe(0);
    expect(await page.locator('button[title="Edit"]').count()).toBe(0);
    expect(await page.locator('button[title="Delete"]').count()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// LOGIN UI TESTS
// ═══════════════════════════════════════════════════════════════
test.describe('Login UI Tests', () => {
  test('C1: Login page renders', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
    await expect(page.locator('text=Welcome Back')).toBeVisible();
  });

  test('C2: Invalid credentials show error', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.locator('#email').fill('invalid@test.com');
    await page.locator('#password').fill('wrongpass');
    const loginPromise = page.waitForResponse(
      resp => resp.url().includes('/auth/login'), { timeout: 10000 }
    );
    await page.locator('button[type="submit"]').click();
    await loginPromise;
    await page.waitForTimeout(1000);
    await expect(page.locator('.alert-danger')).toBeVisible();
  });

  test('C3: Valid admin login redirects', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.locator('#email').fill(ADMIN_EMAIL);
    await page.locator('#password').fill(ADMIN_PASS);
    const loginPromise = page.waitForResponse(
      resp => resp.url().includes('/auth/login') && resp.status() === 200, { timeout: 10000 }
    );
    await page.locator('button[type="submit"]').click();
    await loginPromise;
    await page.waitForTimeout(2000);
    expect(page.url()).not.toContain('/login');
  });

  test('C4: Valid agent login redirects', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.locator('#email').fill(AGENT_EMAIL);
    await page.locator('#password').fill(AGENT_PASS);
    const loginPromise = page.waitForResponse(
      resp => resp.url().includes('/auth/login') && resp.status() === 200, { timeout: 10000 }
    );
    await page.locator('button[type="submit"]').click();
    await loginPromise;
    await page.waitForTimeout(2000);
    expect(page.url()).not.toContain('/login');
  });
});

// ═══════════════════════════════════════════════════════════════
// CLEANUP
// ═══════════════════════════════════════════════════════════════
test('Z: Final cleanup', async ({ request }) => {
  const loginRes = await request.post(`${API_URL}/auth/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASS }
  });
  const { token } = await loginRes.json();
  const listRes = await request.get(`${API_URL}/commission-statements`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const stmts = await listRes.json();
  let cleaned = 0;
  for (const s of stmts) {
    if (s.originalFileName?.includes('test-browser-stmt')) {
      const del = await request.delete(`${API_URL}/commission-statements/${s._id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (del.ok()) cleaned++;
    }
  }
  console.log(`  Cleaned ${cleaned} browser test statements`);
});
