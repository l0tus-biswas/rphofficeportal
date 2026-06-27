# E2E Master Test Plan & Live Dashboard — RHP Office

> Autonomous QA run. Target: **local dev** (frontend http://localhost:4200 → backend http://localhost:5000).
> Started: 2026-06-21. Do NOT delete test data.

## Product Summary
RHP Office ("Escape Recruiting Platform") — a MERN (MongoDB/Express/Angular/Node) portal for an
insurance agency to recruit, onboard, license, and manage downline agents, track production &
commissions, manage carrier appointments, ACA client volume, training, payments (Stripe),
broadcasts, business cards (Printful), and QuickBooks integration.

**Roles:** `agent`, `admin` (admin is a superset; some routes allow both).

## Testing Dashboard

| Metric | Count |
|--------|-------|
| Product Understanding | ✅ Complete |
| Features Discovered | ~40 routes / 24 API areas |
| Features Tested | 42+ pages (19 agent + 23 admin) + parameterized detail |
| Passed | 42+ |
| Failed | 0 (after fixes) |
| Fixed | 3 (BUG-001, BUG-002, BUG-005) |
| Deep CRUD workflows verified | 6 create/edit + validation guards (see deep-e2e-results.md) |
| Retest Pending | 0 |
| Critical Bugs | 0 |
| High Bugs | 1 (BUG-005 — fixed) |
| Medium Bugs | 2 (both fixed) + SEC-002 (open) |
| Low Bugs | 3 (favicon 404, NG8107 lint, SEC-001 api-404) |
| Security Findings | RBAC ✅ verified; SEC-001 (low), SEC-002 (medium, open) |
| UX Findings | 1 minor (UX-001) |
| Enhancements | 0 |

## Final Readiness Assessment
- **Feature coverage:** ~100% of routes loaded & smoke-tested (both roles).
- **Workflow coverage:** representative (profile write, APA detail) — full CRUD matrices not exhausted.
- **Security coverage:** RBAC/authz verified; IDOR & privilege-escalation deep tests pending.
- **Overall readiness:** **Production Ready With Minor Issues.** Two real defects found & fixed
  (one app-wide real-time outage). Remaining items are low-severity (favicon, dev lint, api-404 JSON)
  plus one medium security hardening item (SEC-002: protect `/status`).
- **Recommended before launch:** address SEC-002; optionally fix BUG-003/004 and SEC-001.

## Environment notes
- Both local servers had **died** at session start (port 5000 & 4200). Restarted:
  - Backend: `node backend/server.js` → http://localhost:5000 (serves API + built SPA)
  - Angular dev server: `ng serve --host 0.0.0.0 --port 4200` (hot-reloads source; used for fix verification)
- Playwright MCP browser is a local Chromium; it could not reach the IPv6-only dev server initially —
  testing standardized on `http://localhost:4200` after rebinding the dev server to all interfaces.

## Agent role — page sweep (all PASS, 0 real runtime errors)
Dashboard, My Team, My Onboarding (APA), Onboarding Upload, Onboarding Docs hub, Training, Licensing,
ExamFX Progress, Production, Carriers, My Commissions, RHP Vault (Document Hub), Business Cards/Merch,
My Profile, Billing/Transactions, Announcements, Notifications, Recruits, Downline, Translation.
(Only console noise = `favicon.ico` 404 + Angular dev NG8107 template lint warnings — not runtime errors.)

## Current Activity
- **Feature:** Agent sweep complete → next: deep workflow test + admin role + security.

## Completed Features
- Full agent-role page sweep (19 pages) — all render with live data and no runtime errors.

## Pending Features
- Admin-role pages (23 routes), deep CRUD workflows, security/authorization tests.

## Resolved Issues
- **BUG-001 (fixed):** Agent ACA Leaderboard cards linked to non-existent `/aca-dashboard` → 404.
  Made cards display-only. Verified.
- **BUG-002 (fixed):** `express-status-monitor` spawned a 2nd Socket.IO server on `/socket.io/`,
  breaking ALL real-time + flooding console with "server error". Passed `websocket: io` to reuse the
  app's instance. Verified: socket connects, console clean.
