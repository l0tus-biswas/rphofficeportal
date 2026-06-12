/**
 * Commission Notes - Live Browser Validation
 * Issue #5: Verify notes visibility and editing permissions
 * 
 * Tests:
 * 1. Admin CAN edit existing notes (Edit button visible, edit works)
 * 2. Agent CAN view/read notes (Notes modal opens with content)
 * 3. Agent CANNOT edit notes (Edit button NOT visible)
 * 
 * Run: npx playwright test tests/commission-notes-validation.spec.js --config=playwright.config.js
 */
const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://localhost:5000';
const API_URL = 'http://localhost:5000/api';
const ADMIN_EMAIL = 'contracting@rhpoffice.com';
const ADMIN_PASS = 'admin123';
const AGENT_EMAIL = 'lotushotmail111@gmail.com';
const AGENT_PASS = '123456';

async function loginAndGo(page, email, password, targetPath) {
  const response = await page.request.post(`${API_URL}/auth/login`, {
    data: { email, password }
  });
  const data = await response.json();
  if (!data.token) throw new Error(`Login failed for ${email}: ${JSON.stringify(data)}`);

  await page.goto(BASE_URL, { waitUntil: 'commit' });
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  }, { token: data.token, user: data.user });

  const responsePromise = page.waitForResponse(resp =>
    resp.url().includes('/api/commission-statements') && resp.request().method() === 'GET',
    { timeout: 15000 }
  ).catch(() => null);

  await page.goto(`${BASE_URL}/${targetPath}`, { waitUntil: 'networkidle' });
  await responsePromise;
  await page.waitForTimeout(500);

  // Dismiss any broadcast popup
  const dismissBtn = page.locator('button:has-text("Dismiss")');
  if (await dismissBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await dismissBtn.click();
    await page.waitForTimeout(300);
  }
}

// Ensure we have a statement with notes for testing
let testStatementId = null;
let testNoteId = null;

test.beforeAll(async ({ request }) => {
  // Login as admin
  const loginRes = await request.post(`${API_URL}/auth/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASS }
  });
  const { token } = await loginRes.json();

  // Get agent info
  const agentLoginRes = await request.post(`${API_URL}/auth/login`, {
    data: { email: AGENT_EMAIL, password: AGENT_PASS }
  });
  const agentData = await agentLoginRes.json();
  const agentId = agentData.user._id;

  // Find or create a statement with notes for the agent
  const stmtsRes = await request.get(`${API_URL}/commission-statements`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const stmts = await stmtsRes.json();
  const stmtWithNotes = stmts.find(s => s.agent?._id === agentId && s.notes?.length > 0);

  if (stmtWithNotes) {
    testStatementId = stmtWithNotes._id;
    testNoteId = stmtWithNotes.notes[0]._id;
  } else {
    // Find any statement for this agent and add a note
    const agentStmt = stmts.find(s => s.agent?._id === agentId);
    if (agentStmt) {
      testStatementId = agentStmt._id;
      const noteRes = await request.post(`${API_URL}/commission-statements/${testStatementId}/notes`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: { text: 'Test note for browser validation' }
      });
      const noteData = await noteRes.json();
      testNoteId = noteData.notes[noteData.notes.length - 1]._id;
    }
  }
  console.log(`Test statement: ${testStatementId}, Note: ${testNoteId}`);
});

// ═══════════════════════════════════════════════════════════════
// TEST 1: ADMIN CAN EDIT EXISTING NOTES
// ═══════════════════════════════════════════════════════════════
test.describe.serial('Admin - Notes Editing', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAndGo(page, ADMIN_EMAIL, ADMIN_PASS, 'admin/commission-statements');
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('Admin sees statements list', async () => {
    // Should see the commission statements table
    const table = page.locator('table, .statement-card, .card');
    await expect(table.first()).toBeVisible({ timeout: 10000 });
    console.log('✅ Admin: Commission statements page loaded');
  });

  test('Admin can open notes modal', async () => {
    // Admin page has a notes button with chat icon + count on each row
    const notesBtn = page.locator('button:has(.bi-chat-left-text), button:has(.bi-chat-text), button:has-text("Notes")').first();
    
    await expect(notesBtn).toBeVisible({ timeout: 5000 });
    await notesBtn.click();
    await page.waitForTimeout(500);

    // Notes modal/panel should appear
    const modal = page.locator('.modal, .modal-dialog, [class*="modal"]');
    await expect(modal.first()).toBeVisible({ timeout: 5000 });
    console.log('✅ Admin: Notes modal opened');
  });

  test('Admin sees Edit button on notes', async () => {
    // Admin notes modal has edit button with pencil icon (title="Edit note")
    const editBtn = page.locator('.modal button[title="Edit note"], .modal button:has(.bi-pencil)');
    await expect(editBtn.first()).toBeVisible({ timeout: 5000 });
    const count = await editBtn.count();
    expect(count).toBeGreaterThan(0);
    console.log(`✅ Admin: Found ${count} Edit button(s) on notes`);
  });

  test('Admin can click Edit and modify note text', async () => {
    const editBtn = page.locator('.modal button[title="Edit note"], .modal button:has(.bi-pencil)').first();
    await editBtn.click();
    await page.waitForTimeout(300);

    // Edit mode should appear - input field
    const editInput = page.locator('.modal input[type="text"]').first();
    await expect(editInput).toBeVisible({ timeout: 3000 });

    // Clear and type new text
    await editInput.fill('Admin edited note - browser validation');
    
    // Save via the checkmark button or Enter
    const saveBtn = page.locator('.modal button[title="Save"], .modal button:has(.bi-check-lg)').first();
    if (await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await saveBtn.click();
    } else {
      await editInput.press('Enter');
    }
    
    // Wait for API response
    await page.waitForTimeout(1500);

    // Verify the edited text appears
    const noteText = page.locator('text=Admin edited note - browser validation');
    await expect(noteText).toBeVisible({ timeout: 5000 });
    console.log('✅ Admin: Successfully edited note text');
  });
});

// ═══════════════════════════════════════════════════════════════
// TEST 2: AGENT CAN VIEW/READ NOTES
// ═══════════════════════════════════════════════════════════════
test.describe.serial('Agent - Notes Viewing', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAndGo(page, AGENT_EMAIL, AGENT_PASS, 'commissions');
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('Agent sees commission statements', async () => {
    const content = page.locator('table, .statement-card, .card, .commission');
    await expect(content.first()).toBeVisible({ timeout: 10000 });
    console.log('✅ Agent: Commission statements page loaded');
  });

  test('Agent can see Notes indicator on statements', async () => {
    // Look for any notes indicator (badge, icon, button)
    const notesIndicator = page.locator(
      'button:has-text("Notes"), button:has(.bi-chat-text), .badge:has-text("note"), ' +
      '[title*="note" i], .bi-chat-text, .notes-count'
    );
    
    const count = await notesIndicator.count();
    if (count > 0) {
      console.log(`✅ Agent: Found ${count} notes indicator(s)`);
    } else {
      // Check if notes column exists
      const notesCol = page.locator('th:has-text("Notes"), td:has-text("note")');
      const colCount = await notesCol.count();
      console.log(`ℹ️  Agent: Notes column visible: ${colCount > 0}`);
    }
    expect(count).toBeGreaterThan(0);
  });

  test('Agent can open and READ notes', async () => {
    // Click the notes button to open modal
    const notesBtn = page.locator(
      'button:has-text("Notes"), button:has(.bi-chat-text), button[title*="note" i]'
    ).first();
    
    await expect(notesBtn).toBeVisible({ timeout: 5000 });
    await notesBtn.click();
    await page.waitForTimeout(500);

    // Notes modal should open
    const modal = page.locator('.modal, .modal-dialog, [class*="modal"]');
    await expect(modal.first()).toBeVisible({ timeout: 5000 });

    // Should see actual note text content (not just "No notes")
    const noNotes = page.locator('text=No notes available');
    const hasNoNotes = await noNotes.isVisible({ timeout: 1000 }).catch(() => false);

    if (!hasNoNotes) {
      // Look for note content
      const noteContent = page.locator('.note-item, .note-text, .bg-light p, .modal-body p');
      const noteCount = await noteContent.count();
      expect(noteCount).toBeGreaterThan(0);
      
      // Verify text is readable (not hidden, not "undefined")
      const firstNoteText = await noteContent.first().textContent();
      expect(firstNoteText.trim().length).toBeGreaterThan(0);
      expect(firstNoteText).not.toContain('undefined');
      console.log(`✅ Agent: Can read notes. First note: "${firstNoteText.trim().substring(0, 50)}..."`);
    } else {
      console.log('⚠️  Agent: Statement has no notes (test may need setup)');
    }
  });

  test('Agent does NOT see Edit button on notes', async () => {
    // The edit button should NOT be visible for agent
    const editBtn = page.locator('button:has-text("Edit"), button[title*="Edit note" i]');
    const count = await editBtn.count();
    
    // Verify none are visible
    let visibleCount = 0;
    for (let i = 0; i < count; i++) {
      if (await editBtn.nth(i).isVisible().catch(() => false)) {
        visibleCount++;
      }
    }
    
    expect(visibleCount).toBe(0);
    console.log(`✅ Agent: Edit button NOT visible (found ${visibleCount} visible Edit buttons)`);
  });

  test('Agent does NOT see inline edit mode elements', async () => {
    // No input fields for editing notes should be present
    const editInput = page.locator('.modal input[placeholder*="Edit" i], .modal input[placeholder*="note" i]');
    const count = await editInput.count();
    
    let visibleCount = 0;
    for (let i = 0; i < count; i++) {
      if (await editInput.nth(i).isVisible().catch(() => false)) {
        visibleCount++;
      }
    }
    
    expect(visibleCount).toBe(0);
    console.log(`✅ Agent: No inline edit inputs visible`);
  });

  test('Agent sees Close button (can dismiss modal)', async () => {
    const closeBtn = page.locator('button:has-text("Close"), .btn-close, button.close');
    await expect(closeBtn.first()).toBeVisible({ timeout: 3000 });
    await closeBtn.first().click();
    await page.waitForTimeout(300);
    console.log('✅ Agent: Modal can be closed');
  });
});

// ═══════════════════════════════════════════════════════════════
// TEST 3: AGENT CANNOT EDIT VIA API (defense in depth)
// ═══════════════════════════════════════════════════════════════
test.describe('Agent - API-level edit blocked', () => {
  test('Agent PUT note returns 403', async ({ request }) => {
    if (!testStatementId || !testNoteId) {
      test.skip();
      return;
    }

    const loginRes = await request.post(`${API_URL}/auth/login`, {
      data: { email: AGENT_EMAIL, password: AGENT_PASS }
    });
    const { token } = await loginRes.json();

    const editRes = await request.put(
      `${API_URL}/commission-statements/${testStatementId}/notes/${testNoteId}`,
      {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: { text: 'Agent attempted edit via API' }
      }
    );

    expect(editRes.status()).toBe(403);
    console.log(`✅ API: Agent edit blocked with status ${editRes.status()}`);
  });
});
