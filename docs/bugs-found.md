# Bugs Found — RHP Office E2E

Severity: 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low

---

## BUG-001 🟡 Medium — Agent dashboard ACA Leaderboard cards link to non-existent `/aca-dashboard` (404)
- **Area:** Dashboard (agent view) → ACA Leaderboard
- **Role:** Agent
- **Description:** The "Top 5 Personal" and "Top 5 Team" ACA leaderboard cards on the agent
  dashboard are styled `clickable-card` and call `navigateTo('/aca-dashboard')`. No `/aca-dashboard`
  route is registered in `app-routing.module.ts`, so clicking falls through to the `**` wildcard →
  NotFoundComponent (404). Agents also cannot reach the admin equivalent `/admin/aca-management`.
- **Repro steps:** Log in as agent → Dashboard → click either ACA Leaderboard card (or navigate to
  `/aca-dashboard` directly).
- **Expected:** Either a valid ACA detail page, or non-clickable display cards.
- **Actual:** 404 "Page Not Found".
- **Root cause:** Dead route reference. Admin cards correctly use `/admin/aca-management`
  (dashboard.component.html:517,540); the agent cards (lines 269, 288) used a route that was never
  created. Agent ACA data is already displayed inline on the dashboard (ACA Client Volume Tracker),
  so no drill-down page exists.
- **Status:** Fixed (made agent cards non-clickable — removed `clickable-card` + dead `(click)`).
  Pending browser re-verification.

## BUG-002 🟡 Medium — Socket.IO connection fails repeatedly ("server error") on every authenticated page
- **Area:** Real-time (Socket.IO) — notifications, broadcasts, live updates
- **Role:** Agent (observed; likely all roles)
- **Description:** On every authenticated page the console logs repeated
  `[Socket] Connection error: server error` followed by `Falling back to polling if available`.
  Real-time delivery degrades; the errors also flood the console.
- **Repro steps:** Log in → open dev console → observe repeated socket connection errors.
- **Expected:** Socket connects (or fails gracefully without error spam).
- **Actual:** Handshake fails with generic "server error", retries continuously.
- **Root cause:** `express-status-monitor` (the `/status` dashboard, server.js) calls
  `socketIo(server)` internally (`src/helpers/socket-io-init.js`) and was NOT given the app's
  existing Socket.IO instance, so it attached a **second** Socket.IO/Engine.IO server to the same
  HTTP server on the same default `/socket.io/` path. Two Engine.IO servers on one path corrupt
  every handshake — sessions created by one are "Session ID unknown" to the other, and the
  monitor's no-auth server auto-accepted connections (the rogue `2:40` packet observed in the
  open handshake). Verified: pre-fix handshake reported `pingTimeout:20000` (status-monitor's
  default io); post-fix it reports `pingTimeout:60000` (the app's io) with no rogue connect packet.
- **Status:** ✅ Fixed & verified — browser console now 0 errors, `[Socket] Connected` succeeds.

## BUG-003 🟢 Low — `favicon.ico` returns 404 on every page
- **Area:** Static assets. **Role:** all.
- **Description:** `GET /favicon.ico` → 404 on every page load (console error). No favicon configured.
- **Status:** Open (cosmetic). Fix: add a favicon and `<link rel="icon">` in index.html.

## BUG-004 🟢 Low — Angular template lint warnings (NG8107) flood the dev build
- **Area:** `admin/printful-orders/printful-orders.component.html` (~22 occurrences),
  `business-cards/business-cards.component.html:471`.
- **Description:** Optional-chaining (`?.`) used on values the template type-checker considers
  non-nullable → NG8107 "can be replaced with `.`". Compile-time warnings only, no runtime impact.
- **Status:** Open (code quality). Fix: replace `?.` with `.` where the left side is non-null, or
  type the fields as optional.

## UX-001 🟡 Minor — Onboarding Docs progress wording ambiguous
- **Area:** `/onboarding-hub`. **Description:** Header reads "1 approved, 5 submitted of 5 required",
  which is hard to parse (does "5 submitted of 5" include the approved one?). Suggest clearer phrasing,
  e.g. "5 of 5 submitted · 1 approved".
- **Status:** Open (low-priority UX).

## BUG-005 🟠 High — Cannot create a coupon without "Max Discount Amount" (optional field rejected as null)
- **Area:** Admin → Coupon Management → Create/Edit Coupon. **Role:** Admin.
- **Description:** "Max Discount Amount" is presented as **optional** in the UI (no asterisk, empty
  allowed), but submitting with it blank fails server-side validation with
  `"maxDiscountAmount" must be a number`, returning HTTP 400. The coupon is not created. Same applies
  to the update schema. By contrast `usageLimit` (also optional) correctly allowed null.
- **Repro:** Admin → Coupon Management → Create Coupon → fill required fields, leave Max Discount
  Amount blank → Create. Result: 400 "Validation error".
- **Root cause:** `backend/middleware/validation.middleware.js` — `coupon` and `updateCoupon` schemas
  had `maxDiscountAmount: Joi.number().min(0).optional()` (allows the key to be absent, but the
  frontend always sends `maxDiscountAmount: null` when blank → Joi rejects null). `usageLimit` already
  used `.allow(null)`; `maxDiscountAmount` did not.
- **Fix:** Added `.allow(null)` to `maxDiscountAmount` in both schemas (lines 115, 130).
- **Status:** ✅ Fixed & verified — POST with `maxDiscountAmount: null` now returns 201 Created.

<!-- New bugs appended below. Template:
## BUG-XXX [severity] Title
- **Area:**
- **Role:**
- **Description:**
- **Repro steps:**
- **Expected:**
- **Actual:**
- **Root cause:**
- **Status:** Open | Fixed | Won't fix
-->
