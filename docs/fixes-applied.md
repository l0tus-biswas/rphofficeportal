# Fixes Applied — RHP Office E2E

## FIX for BUG-002 — Socket.IO duplicate-server conflict
- **Files modified:** `backend/server.js`
- **Change:** Reordered startup so the HTTP server and the single `io = new Server(httpServer, …)`
  instance (plus the shared `corsOriginFn` helpers) are created BEFORE `express-status-monitor`,
  and passed `websocket: io` to the monitor. The monitor now reuses the app's Socket.IO instance
  instead of spawning a second one on the same `/socket.io/` path. Removed the now-duplicate
  CORS-helper and `httpServer`/`io` blocks lower in the file (logic unchanged, only relocated).
- **Validation:** Backend restarts cleanly (MongoDB connected, "Server running on port 5000").
  Raw handshake `GET /socket.io/?EIO=4&transport=polling` now returns only the open packet
  (`pingTimeout:60000` = app io) with no rogue `2:40` auto-connect.
- **Retest outcome:** Browser dashboard console = 0 errors / 0 warnings; `[Socket] Connected: <id>`.
- **Regression check:** App still serves, auth still works (logged-in agent), stats/licensing load.
  Trade-off: the `/status` dashboard's own live charts now connect through the app's auth
  middleware (token-gated) so they may not populate; server-side metric collection is unaffected.
  No regression vs. prior state (where the conflict broke /status too).

## FIX for BUG-001 — Agent ACA leaderboard dead link
- **Files modified:** `frontend/src/app/components/dashboard/dashboard.component.html`
- **Change:** Removed `clickable-card` class and `(click)="navigateTo('/aca-dashboard')"` from the
  two agent ACA Leaderboard cards (Top 5 Personal, Top 5 Team). They are now display-only, matching
  the fact that no agent ACA detail route exists (data is shown inline on the dashboard).
- **Validation:** Pending browser re-verification on the dev server build.
- **Retest outcome:** Pending.
- **Regression check:** Admin ACA cards (→ `/admin/aca-management`) untouched.

<!-- Template:
## FIX for BUG-XXX
- **Files modified:**
- **Change:**
- **Validation:**
- **Retest outcome:**
- **Regression check:**
-->
