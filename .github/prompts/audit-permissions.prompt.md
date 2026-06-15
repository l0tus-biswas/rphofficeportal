---
mode: agent
description: "Deep audit of role-based access control across all routes and UI components"
---

# Permission & Access Control Audit

## Objective
Find EVERY endpoint and UI element where role enforcement is missing, inconsistent, or too permissive. Catch issues like:
- Agent can perform admin-only actions (edit, delete, create)
- Frontend shows action buttons (Edit, Delete, Add) that the backend would reject — or worse, wouldn't reject
- Backend allows access but the intent is to restrict it
- Inconsistent CRUD permissions (e.g., can't create but CAN edit the same resource)

## Methodology

### Step 1: Extract the Permission Matrix
For EVERY route file in `backend/routes/`, build a table:

| Endpoint | Method | Middleware | Who Can Access | Intent |
|----------|--------|------------|----------------|--------|

Check each route for:
- `authorize('admin')` middleware — marks admin-only
- `authenticate` only — means any logged-in user
- Custom access control logic inside the handler (e.g., ownership checks)

Flag any route where:
- A CRUD set is inconsistent (POST is admin-only but PUT is not)
- Comments say one thing but code does another
- Ownership checks let agents modify admin-created resources

### Step 2: Audit Frontend UI Against Backend
For each component that calls a restricted API:
1. Does the template hide the action button/form for unauthorized roles?
2. Is the role check using `authService.isAdmin()` or equivalent?
3. Could an agent reach the action through any UI path (modal, inline edit, keyboard shortcut)?

Flag any UI element that:
- Shows an action button without `*ngIf` role guard
- Has an edit/delete mode accessible to all roles
- Calls a restricted API without checking role first

### Step 3: Cross-Reference E2E Tests
For every restricted endpoint found in Step 1, verify the test suite has:
- A POSITIVE test (admin CAN do the action)
- A NEGATIVE test (agent CANNOT do the action → expects 403)

Flag any endpoint missing the negative test case.

### Step 4: Report Format
Output a table of findings:

| Severity | Location | Issue | Fix |
|----------|----------|-------|-----|
| HIGH | `routes/x.js:42` | Agent can edit admin resource | Add `authorize('admin')` |
| MEDIUM | `component.html:89` | Edit button visible to agents | Add `*ngIf="authService.isAdmin()"` |
| LOW | `test-e2e.js` | Missing negative test for PUT /x/:id | Add agent-denied test |

## Key Patterns to Watch

1. **The "ownership loophole"**: `if (role !== 'admin' && resource.owner !== userId)` — this lets the owner do anything, even if the action should be admin-only
2. **Frontend-only guards**: UI hides a button but backend doesn't enforce — attacker can still call API directly
3. **Backend-only guards**: Backend blocks but UI shows the button — confusing UX, user sees errors
4. **Inconsistent CRUD**: POST requires admin, but PUT/PATCH doesn't (or vice versa)
5. **Shared components**: A component used in both admin and agent views without conditional rendering

## Run This Audit On
- `backend/routes/*.routes.js` — all route files
- `frontend/src/app/components/**/*.html` — all templates with action buttons
- `backend/test-*-e2e.js` — all E2E test files for coverage gaps
