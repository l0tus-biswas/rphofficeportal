# RHP Office Issues Tracking - June 2026 Review

## Status Legend
- ✅ Completed & Validated
- 🔄 In Progress
- ❌ Not Started
- ⚠️ Blocked / Needs Clarification

---

## Issue #1: Announcements / Welcome Popup
**Status:** ✅ Completed
**Problem:** New agents see old announcements as if they were new onboarding messages.
**Root Cause:** Broadcast GET endpoint returns ALL active broadcasts regardless of when the agent account was created.
**Fix:** Added `createdAt >= user.createdAt` filter to GET / and GET /unread-count in broadcast.routes.js.

---

## Issue #2: Dashboard / Licensing Logic
**Status:** ✅ Completed
**Problem:** Licensed agents still see "Study on ExamFX" and "Get your insurance license" prompts.
**Root Cause:** Dashboard checklist only checked LicensingProgress.isLicensed, missing APA and metadata sources.
**Fix:** Added 3-tier licensing check: LicensingProgress → APAApplication.licensingStatus → user.metadata.currentlyLicensed.

---

## Issue #3: Announcements / Live Notifications
**Status:** ✅ Completed
**Problem:** Links hidden behind "View Details" button in broadcast popup.
**Root Cause:** Link only shown inside expanded view; WebSocket real-time delivery was already working.
**Fix:** Added direct link display in broadcast-popup.component.html before action buttons.

---

## Issue #4: ACA Dashboard Leaderboard
**Status:** ✅ Completed
**Problem:** Top 5 Personal/Team leaderboard not visible on agent dashboard.
**Root Cause:** Leaderboard data was only returned in admin stats, not agent stats.
**Fix:** Added ACA leaderboard aggregation to GET /api/agent/stats; added leaderboard cards to agent dashboard HTML.

---

## Issue #5: Commission Notes Visibility/Editing
**Status:** ✅ Completed
**Problem:** Cannot edit existing notes; agents cannot view/read notes.
**Fix:** Added PUT /:id/notes/:noteId (edit) and GET /:id/notes (agent view) endpoints. Added frontend modal for viewing notes.

---

## Issue #6: Business Cards (Printful)
**Status:** ✅ Completed
**Problem:** Business card photo personalization workflow missing upload endpoint.
**Fix:** Added POST /api/business-cards/upload-photo endpoint with multer for headshot upload (JPG/PNG, 5MB max).

---

## Issue #7: Production / Promotion Tracking
**Status:** ✅ Completed (Round 2 - Deep Fix)
**Problem:** Multiple sub-issues: promotion categories, In-Force date, duplicates, filters, priority.
**Original Fix:**
- Changed qualifying categories to Life Insurance + Supplemental Insurance only
- Added inForceDate field (auto-set on status change to "In Force")
- Added priority field (Low/Medium/High/Urgent) with filter support
- Added GET /stats/filtered endpoint for date-filtered stats
- Used $ifNull for inForceDate in promotion aggregation
- Added duplicate submission prevention (saving flag + disabled button)

**Round 2 Fixes (June 2026):**
1. **Stats/totals now update with filters** — Frontend `loadStats()` now calls `/stats/filtered` with ALL active filters (status, product, carrier, priority, dates, agent) instead of just date/agent via `/stats/summary`. Stats cards updated to show: Total Submissions, Total Premium, In Force count, In-Force Premium.
2. **Priority filter added to UI** — New "Priority" dropdown (Low/Medium/High/Urgent) in filter section. Backend queries both `priority` field AND `customFields.priority` via `$or` since existing data stores priority in custom fields.
3. **Promotion tracker extended to 12 months** — Window options expanded from max 6 months to full 12 months (30-365 days).
4. **In-Force Date field added to edit form** — Shows conditionally when status = "In Force". Displays in table as dedicated column. Auto-set to now() if left blank when marking In Force.
5. **Status change via edit form now triggers promotion sync** — Previously only the dedicated "Review" endpoint triggered `checkAndNotifyPromotion()`. Now the general PUT /:id update also triggers promotion check for agent + entire upline chain when status changes to "In Force".

**Files Modified:**
- `frontend/src/app/services/production.service.ts` — Added priority to filters interface, inForceDate to submission interface, changed stats endpoint to /stats/filtered with all params
- `frontend/src/app/components/production/production.component.ts` — loadStats() passes all filters, clearFilters includes priority, team report URL includes priority
- `frontend/src/app/components/production/production.component.html` — Added Priority filter dropdown, In-Force Date field (conditional), In-Force Date column in table, updated stats cards (4 cards: total, premium, in-force count, in-force premium)
- `frontend/src/app/components/dashboard/promotion-tracker/promotion-tracker.component.ts` — Extended windowOptions to 12 months
- `backend/routes/production.routes.js` — Priority filter uses $or for both native and customFields, PUT /:id triggers promotion sync on status change to "In Force"

---

## Issue #8: Document Hub / Request Documents
**Status:** ✅ Completed
**Problem:** "Request Document" not visible in Onboarding Docs section where agents expect it.
**Fix:** Added pending document requests section to onboarding-hub component showing admin-requested documents with upload link.

---

## Issue #9: Billing & Payments
**Status:** ✅ Completed
**Problem:** Payment status logic needed review for billing-exempt users.
**Fix:** Payment status endpoint now returns early with full access for billing-exempt users. Guards added to prevent exempt users from creating unnecessary payment intents.

---

## Issue #10: Coupon / Free Access Users
**Status:** ✅ Completed
**Problem:** No way to give users free access without billing.
**Fix:**
- Added billingExempt, billingExemptReason, billingExemptSetBy, billingExemptSetAt fields to User model
- Added PUT /api/admin/users/:userId/billing-exempt endpoint
- Exempt users auto-get paymentAccessEnabled=true
- Payment status returns 'exempt' subscription status

---

## Issue #11: APA / DocuSign Documentation
**Status:** ⚠️ Documentation Task
**Problem:** Need documentation on DocuSign template management.
**Notes:** DocuSign integration exists in backend/routes/apa.routes.js and utils/docusign.js. Template fields documented in backend/fetch-template-fields.js. Requires admin access to DocuSign account for template management.

---

## Issue #12: Pending Integrations Status
**Status:** ⚠️ Documentation Task
**Problem:** Need status update on QuickBooks, ExamFX, Business Cards.
**Notes:**
- **Printful (Business Cards):** Fully integrated - product listing, mockup generation, order placement, payment via Stripe
- **ExamFX:** CSV upload for agent progress tracking implemented (test-examfx-csv-upload-e2e.js validates)
- **QuickBooks:** Not yet integrated - no routes or utilities found in codebase
- **DocuSign:** Fully integrated for APA agreement signing

---

## Issue #13: Welcome Message for New Recruits
**Status:** ✅ Completed
**Problem:** New feature request for admin-configurable welcome popup on first login.
**Fix:**
- Added welcomeMessageSeenAt field to User model
- Added GET /api/agent/welcome-message (returns message if not dismissed)
- Added POST /api/agent/welcome-message/dismiss (marks as seen)
- Added GET/PUT /api/admin/welcome-message (configure message: title, body, videoUrl, enabled)
- Added POST /api/admin/welcome-message/reset-users (reset all users to see message again)
- Uses SystemConfig with key 'welcome_message'

---
