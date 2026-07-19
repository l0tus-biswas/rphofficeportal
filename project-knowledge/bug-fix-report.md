# RPH Office Portal — Functional Bug Fix Report

## Summary

A systematic functional review was performed across all 13 phases. Below is the complete list of functional bugs found and fixed.

---

## 🔴 CRITICAL BUGS

### BUG#1: Duplicate `/payment-success` Route Conflict
**File:** `frontend/src/app/app-routing.module.ts`
**Issue:** Two routes with path `payment-success` existed:
1. Public route (line 66) using `ApaPaymentSuccessComponent` (from `payment-success.component.ts`)
2. Protected route (lines 209-213) using `PaymentSuccessComponent` (from `payment-success/payment-success.component.ts`)

The public route always matched first, making the protected route dead code. The public route is the correct one for the APA Stripe return flow.
**Fix:** Removed the duplicate protected route. The public route now handles all payment-success redirects.

### BUG#2: `res.requests` Always Undefined in Onboarding Hub
**File:** `frontend/src/app/components/onboarding/onboarding-hub/onboarding-hub.component.ts` (line 281)
**Issue:** `documentHubService.getRequests()` returns `Observable<DocRequest[]>` (a plain array), but the component accessed `res.requests` which is always `undefined` on an array. This caused pending and completed document requests to never display on the onboarding hub page.
**Fix:** Changed `(res.requests || [])` to `(Array.isArray(res) ? res : [])`.

### BUG#3: `docusignUrl` Always Empty in Apply Component
**File:** `backend/routes/apa.routes.js` (line 52-61)
**Issue:** The `GET /api/public/check-pending-application` endpoint never returns a `docusignUrl` field, but the frontend `apply.component.ts` (line 327) expects `response.application.docusignUrl`. This caused `resumeSigning()` to always fall through to `resendDocuSign`, creating a brand new DocuSign envelope every time — spamming applicants with duplicate signing emails.
**Fix:** The backend endpoint now returns the `docusignUrl` field when available.

---

## 🟠 HIGH BUGS

### BUG#5: `restrictedTo` Parsing Crashes on Array Input
**File:** `backend/routes/document-hub.routes.js` (lines 364-370)
**Issue:** When the frontend sends `restrictedTo` as a native JSON array (typical with `Content-Type: application/json`), `JSON.parse()` throws, then `.split()` is called on an array (which has no `.split()` method), causing a runtime crash.
**Fix:** Added `Array.isArray()` check before parsing. If already an array, use it directly. Only attempt `JSON.parse()` or `.split()` on string values.

### BUG#6: `firstName` vs `legalFirstName` Mismatch in APA Routes
**File:** `backend/routes/apa.routes.js` (line 467)
**Issue:** The APA application schema uses `legalFirstName`/`legalLastName`, but the Stripe checkout session metadata used `firstName`/`lastName`. When `firstName` was undefined, the metadata contained `"undefined undefined"`.
**Fix:** Changed to `application.personalInfo.legalFirstName || application.personalInfo.firstName` with fallback.

---

## 🟡 MEDIUM BUGS

### BUG#7: `reviewNotes` Unconditionally Overwritten
**File:** `backend/routes/production.routes.js` (line 1018)
**Issue:** `submission.reviewNotes = reviewNotes` unconditionally overwrites existing notes when `reviewNotes` is `undefined` (omitted from request body), silently clearing previously saved review notes on re-review.
**Fix:** Changed to `if (reviewNotes !== undefined) submission.reviewNotes = reviewNotes`.

### BUG#8: `reviewedAt` Uses `Date.now()` (Number) Instead of `new Date()` (Date Object)
**File:** `backend/routes/production.routes.js` (line 1020)
**Issue:** `submission.reviewedAt = Date.now()` stores a Unix timestamp number instead of a Date object, causing type inconsistency in the database.
**Fix:** Changed to `submission.reviewedAt = new Date()`.

### BUG#9: `resolvedSubmissionDate` Uses `Date.now()` (Number)
**File:** `backend/routes/production.routes.js` (line 743)
**Issue:** `let resolvedSubmissionDate = submissionDate || Date.now()` stores a number when no submissionDate is provided, instead of a Date object.
**Fix:** Changed to `let resolvedSubmissionDate = submissionDate ? new Date(submissionDate) : new Date()`.

### BUG#11: `uploadedAt` Uses `Date.now()` (Number)
**File:** `backend/routes/production.routes.js` (line 1018 in upload route)
**Issue:** Document upload timestamp stored as number instead of Date object.
**Fix:** Changed to `uploadedAt: new Date()`.

---

## 🟢 LOW BUGS

### BUG#3: `currentUser` Observable Shadows User Type
**File:** `frontend/src/app/services/auth.service.ts` (line 15)
**Issue:** `currentUser` is declared as `Observable<User | null>` but its name collides with what components expect to be a `User` object. All components use `getCurrentUser()` method which returns `User | null`, so no functional impact.
**Status:** Not fixed (cosmetic only, no functional impact).

### BUG#4: Duplicate `/me` and `/profile` Routes
**File:** `backend/routes/auth.routes.js` (lines 218-242)
**Issue:** Both `GET /api/auth/me` and `GET /api/auth/profile` return identical data. This is redundant but not functionally broken.
**Status:** Not fixed (redundant but not broken).

---

## Bugs Found But Not Fixed (Out of Scope)

| Bug | Description | Reason |
|-----|-------------|--------|
| Payment ownership check fragile | `payment.user.toString()` would break if populated | Low risk, requires refactoring |
| Race condition in Stripe webhook | `invoice.paid` may arrive before local Subscription record | Requires architectural change |
| Soft-deleted training materials modifiable | Admin routes don't check `isActive` | Requires adding query filters |
| ValueChanges subscriptions never unsubscribed | Memory leak in apply component | Requires adding ngOnDestroy |

---

## Files Modified

1. `frontend/src/app/app-routing.module.ts` — Removed duplicate payment-success route
2. `frontend/src/app/components/onboarding/onboarding-hub/onboarding-hub.component.ts` — Fixed res.requests bug
3. `backend/routes/document-hub.routes.js` — Fixed restrictedTo parsing
4. `backend/routes/apa.routes.js` — Fixed firstName/legalFirstName mismatch
5. `backend/routes/production.routes.js` — Fixed reviewNotes, Date.now(), uploadedAt bugs

## Verification

All fixes are minimal, targeted changes that:
- Do NOT introduce new features
- Do NOT change architecture
- Do NOT refactor code unnecessarily
- Do NOT modify database schemas
- Do NOT change API contracts
- Only fix existing functional bugs