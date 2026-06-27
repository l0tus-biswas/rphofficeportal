# User Role Matrix — RHP Office

Two roles exist: **agent** and **admin** (`AuthService.isAgent()` / `isAdmin()`). Admin is a superset.
Route protection: Angular `AuthGuard` + `data.roles`; backend `protect` + `authorize(role)` middleware.

## Role capabilities (high level)

| Area | Agent | Admin |
|------|-------|-------|
| Dashboard | ✅ own stats, promotion tracker, ACA leaderboard (display) | ✅ org-wide stats, ACA mgmt cards |
| My Team / Downline / Recruits | ✅ own downline | ✅ + full hierarchy |
| Onboarding (own) | ✅ upload/status/hub | ✅ |
| Onboarding management (all agents) | ❌ | ✅ `/admin/onboarding`, doc types |
| Training | ✅ view | ✅ manage (`/admin/training`) |
| Licensing | ✅ own | ✅ all agents (`/admin/licensing`) |
| ExamFX | ✅ own + downline | ✅ CSV upload/manage (`/admin/examfx`) |
| Production | ✅ own + team | ✅ |
| Carriers | ✅ view appointments | ✅ manage carriers + appointments |
| Commissions | ✅ own statements | ✅ all statements (`/admin/commission-statements`) |
| Billing | ✅ own transactions/subscription | ✅ all payments (`/admin/payments`) |
| Document Hub (RHP Vault) | ✅ | ✅ |
| Business Cards / Merch | ✅ order | ✅ + Printful config & orders |
| APA Applications | (signs own via public flow) | ✅ review/approve (`/admin/apa-applications`) |
| ACA Client Volume | ✅ own tracker | ✅ management |
| Coupons / Products / Promotions / Branding / Welcome / Broadcast mgmt / System Config / Monitoring | ❌ | ✅ |
| Notifications / Broadcasts (view) / Translation / Profile | ✅ | ✅ |

## Authorization verification (Phase 9)
- ✅ Agent JWT → `GET /api/admin/*` returns **403** (`Role 'agent' is not authorized`).
- ✅ Agent → `/admin/*` Angular routes redirect to `/dashboard`.
- ✅ Socket.IO rejects token-less connections.
- See `security-findings.md` for details (incl. SEC-002 public `/status`).
