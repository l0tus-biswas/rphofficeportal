# Security Findings — RHP Office E2E

## ✅ Positive results
- **Server-side RBAC enforced.** With a valid *agent* JWT, admin APIs return `403`:
  - `GET /api/admin/stats` → 403 `Role 'agent' is not authorized to access this route`
  - `GET /api/admin/users` (+ paginated) → 403
  Frontend `AuthGuard` also redirects agent → `/dashboard` for `/admin/*` routes. Defense in depth holds.
- **JWT required for protected APIs** and for `/uploads/*` (non-public prefixes) — verified in code (server.js)
  and via the socket handshake (auth token required).
- **Socket.IO auth** — connections without a valid token are rejected by `io.use` middleware.

## Findings / observations
### SEC-001 🟢 Low — Unknown `/api/*` paths return SPA HTML with 200 instead of 404 JSON
- The Express SPA fallback `app.get('*')` (server.js) catches unmatched GETs including bad `/api/*`
  paths, returning `index.html` (HTTP 200). Example: `GET /api/user/me` → 200 + HTML (no such route;
  correct endpoint is `/api/auth/me`).
- **Impact:** Low. Not a data exposure, but API clients can't distinguish "wrong URL" from success;
  masks typos/removed endpoints. Recommend an `/api/*` 404 JSON handler before the SPA fallback.

### SEC-002 🟡 Medium — `/status` monitoring dashboard is publicly accessible (no auth)
- `app.use(statusMonitor)` mounts `express-status-monitor` at `/status` with no auth guard, exposing
  CPU/memory/heap/response-time/RPS metrics to anyone who can reach the host.
- **Impact:** Information disclosure (infra/runtime internals). Recommend protecting `/status` behind
  admin auth or a reverse-proxy basic-auth (the nginx conf already protects `/logs` this way).
- **Status:** Open (observed in code; not exploited).

## Pending
- IDOR checks (agent accessing another agent's records by id).
- Admin-role functional tests.
- Privilege escalation via profile/role fields.
