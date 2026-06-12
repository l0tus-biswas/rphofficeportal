# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: commission-browser-e2e.spec.js >> Admin Commission Statements - Full UI Flow >> A1: Page loads with correct layout
- Location: tests\commission-browser-e2e.spec.js:105:3

# Error details

```
Error: page.goto: Target page, context or browser has been closed
Call log:
  - navigating to "http://localhost:5000/admin/commission-statements", waiting until "networkidle"

```

# Test source

```ts
  1   | /**
  2   |  * Commission Statements - Live Browser Deep E2E Test (v2)
  3   |  * Comprehensive single-flow test from both admin and agent perspectives.
  4   |  * Uses token injection + network waiting for reliability with Angular SPAs.
  5   |  * 
  6   |  * Run: npx playwright test --config=playwright.config.js
  7   |  */
  8   | const { test, expect } = require('@playwright/test');
  9   | const path = require('path');
  10  | const fs = require('fs');
  11  | 
  12  | const BASE_URL = 'http://localhost:5000';
  13  | const API_URL = 'http://localhost:5000/api';
  14  | const ADMIN_EMAIL = 'contracting@rhpoffice.com';
  15  | const ADMIN_PASS = 'admin123';
  16  | const AGENT_EMAIL = 'lotushotmail111@gmail.com';
  17  | const AGENT_PASS = '123456';
  18  | 
  19  | // Create test PDF files for upload
  20  | const TEST_PDF_DIR = path.join(__dirname, '..', 'uploads');
  21  | const TEST_PDF_PATH = path.join(TEST_PDF_DIR, 'test-browser-stmt.pdf');
  22  | const TEST_PDF_PATH2 = path.join(TEST_PDF_DIR, 'test-browser-stmt-2.pdf');
  23  | 
  24  | test.beforeAll(async () => {
  25  |   if (!fs.existsSync(TEST_PDF_DIR)) fs.mkdirSync(TEST_PDF_DIR, { recursive: true });
  26  |   fs.writeFileSync(TEST_PDF_PATH, Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF browser-test'));
  27  |   fs.writeFileSync(TEST_PDF_PATH2, Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF browser-test-2'));
  28  | });
  29  | 
  30  | test.afterAll(async () => {
  31  |   try { fs.unlinkSync(TEST_PDF_PATH); } catch {}
  32  |   try { fs.unlinkSync(TEST_PDF_PATH2); } catch {}
  33  | });
  34  | 
  35  | /**
  36  |  * Login by getting token via API and injecting into localStorage.
  37  |  * Then navigates directly to the target page.
  38  |  */
  39  | async function loginAndGo(page, email, password, targetPath) {
  40  |   // Get token via Playwright's API context (bypasses browser)
  41  |   const response = await page.request.post(`${API_URL}/auth/login`, {
  42  |     data: { email, password }
  43  |   });
  44  |   const data = await response.json();
  45  |   if (!data.token) throw new Error(`Login failed for ${email}: ${JSON.stringify(data)}`);
  46  | 
  47  |   // Go to app root to set localStorage on the correct origin
  48  |   await page.goto(BASE_URL, { waitUntil: 'commit' });
  49  | 
  50  |   // Inject auth state
  51  |   await page.evaluate(({ token, user }) => {
  52  |     localStorage.setItem('token', token);
  53  |     localStorage.setItem('user', JSON.stringify(user));
  54  |   }, { token: data.token, user: data.user });
  55  | 
  56  |   // Navigate to target page - wait for the API response that loads data
  57  |   const responsePromise = page.waitForResponse(resp => 
  58  |     resp.url().includes('/api/commission-statements') && resp.request().method() === 'GET',
  59  |     { timeout: 15000 }
  60  |   ).catch(() => null); // Don't fail if no matching response
  61  | 
> 62  |   await page.goto(`${BASE_URL}/${targetPath}`, { waitUntil: 'networkidle' });
      |              ^ Error: page.goto: Target page, context or browser has been closed
  63  |   await responsePromise;
  64  |   await page.waitForTimeout(500); // Extra settle time for Angular rendering
  65  | 
  66  |   // Dismiss any broadcast popup overlay that may appear
  67  |   const dismissBtn = page.locator('button:has-text("Dismiss")');
  68  |   if (await dismissBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
  69  |     await dismissBtn.click();
  70  |     await page.waitForTimeout(300);
  71  |   }
  72  | }
  73  | 
  74  | // ═══════════════════════════════════════════════════════════════
  75  | // ADMIN FULL FLOW TEST
  76  | // ═══════════════════════════════════════════════════════════════
  77  | test.describe.serial('Admin Commission Statements - Full UI Flow', () => {
  78  |   let page;
  79  |   let uploadedStatementId = null;
  80  | 
  81  |   test.beforeAll(async ({ browser }) => {
  82  |     page = await browser.newPage();
  83  |   });
  84  | 
  85  |   test.afterAll(async () => {
  86  |     // Cleanup: delete test statements via API
  87  |     const token = (await (await page.request.post(`${API_URL}/auth/login`, {
  88  |       data: { email: ADMIN_EMAIL, password: ADMIN_PASS }
  89  |     })).json()).token;
  90  | 
  91  |     const listResp = await page.request.get(`${API_URL}/commission-statements`, {
  92  |       headers: { Authorization: `Bearer ${token}` }
  93  |     });
  94  |     const stmts = await listResp.json();
  95  |     for (const s of stmts) {
  96  |       if (s.originalFileName?.includes('test-browser-stmt')) {
  97  |         await page.request.delete(`${API_URL}/commission-statements/${s._id}`, {
  98  |           headers: { Authorization: `Bearer ${token}` }
  99  |         });
  100 |       }
  101 |     }
  102 |     await page.close();
  103 |   });
  104 | 
  105 |   test('A1: Page loads with correct layout', async () => {
  106 |     await loginAndGo(page, ADMIN_EMAIL, ADMIN_PASS, 'admin/commission-statements');
  107 | 
  108 |     // Verify page heading
  109 |     await expect(page.locator('h2.mb-0')).toContainText(/Commission Statements/i);
  110 | 
  111 |     // Verify Upload Statement button
  112 |     await expect(page.locator('button:has-text("Upload Statement")').first()).toBeVisible();
  113 | 
  114 |     // Verify filter section
  115 |     await expect(page.locator('select[name="filterAgent"]')).toBeVisible();
  116 | 
  117 |     // Verify table or empty state
  118 |     const hasTable = await page.locator('table').isVisible().catch(() => false);
  119 |     const hasEmpty = await page.locator('text=No commission statements found').isVisible().catch(() => false);
  120 |     expect(hasTable || hasEmpty).toBeTruthy();
  121 |   });
  122 | 
  123 |   test('A2: Upload form opens and shows all fields', async () => {
  124 |     // Click Upload Statement button
  125 |     await page.locator('button:has-text("Upload Statement")').first().click();
  126 |     await page.waitForTimeout(300);
  127 | 
  128 |     // Verify form section visible
  129 |     await expect(page.locator('text=Upload Commission Statement')).toBeVisible();
  130 | 
  131 |     // Verify all form fields
  132 |     await expect(page.locator('input[placeholder*="Search agent by name"]')).toBeVisible();
  133 |     await expect(page.locator('input[placeholder*="Type carrier"]').first()).toBeVisible();
  134 |     await expect(page.locator('input[name="uploadPayPeriod"]')).toBeVisible();
  135 |     await expect(page.locator('input[type="file"]').first()).toBeVisible();
  136 |     await expect(page.locator('input[name="uploadNotes"]')).toBeVisible();
  137 |   });
  138 | 
  139 |   test('A3: Agent search typeahead with debounce', async () => {
  140 |     const agentInput = page.locator('input[placeholder*="Search agent by name"]');
  141 |     
  142 |     // Clear and type - use pressSequentially for Angular change detection
  143 |     await agentInput.click();
  144 |     await agentInput.fill('');
  145 |     
  146 |     // Wait for API response after typing
  147 |     const searchPromise = page.waitForResponse(
  148 |       resp => resp.url().includes('/agents/search') && resp.status() === 200,
  149 |       { timeout: 10000 }
  150 |     );
  151 |     
  152 |     await agentInput.pressSequentially('lotus', { delay: 80 });
  153 |     
  154 |     // Wait for the search API to respond
  155 |     const searchResp = await searchPromise;
  156 |     const searchData = await searchResp.json();
  157 |     
  158 |     // Wait for dropdown to render
  159 |     await page.waitForTimeout(500);
  160 |     
  161 |     // Verify dropdown appeared with results
  162 |     const dropdownItems = page.locator('.list-group-item-action');
```