# RHP Office — Project Knowledge

> Internal knowledge base for the **RHP Office** platform (a.k.a. "Escape Recruiting Platform").
> A full-stack recruiting, onboarding, licensing, and commission-management portal for an
> insurance agency with a multi-level (genealogy/downline) agent structure.

---

## 1. Architecture Overview

RHP Office is a **MEAN-style monolith** deployed as a single Node process that serves both the
REST API and the compiled Angular single-page app.

```
                          ┌─────────────────────────────────────────┐
                          │            Browser (SPA client)           │
                          │   Angular 17 + Bootstrap 5 + Socket.IO    │
                          └───────────────┬───────────────┬──────────┘
                                  HTTPS / REST        WebSocket
                                          │               │
        ┌─────────────────────────────────▼───────────────▼──────────────────────┐
        │                       Node.js / Express (backend/server.js)             │
        │  helmet · CORS · morgan→winston · JWT auth · rate-limit · multer uploads │
        │                                                                          │
        │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │
        │   │  25 route     │  │ middleware    │  │  utils /      │  │ Socket.IO  │  │
        │   │  modules      │──│ (auth, audit, │──│  integrations │  │ (per-user  │  │
        │   │  /api/*       │  │  validation)  │  │  services)    │  │  rooms)    │  │
        │   └──────┬───────┘  └──────────────┘  └──────┬───────┘  └────────────┘  │
        └──────────┼────────────────────────────────────┼────────────────────────┘
                   │ Mongoose ODM                        │ external HTTPS
        ┌──────────▼──────────┐         ┌────────────────▼─────────────────────────┐
        │  MongoDB (Atlas/     │         │ Stripe · DocuSign · QuickBooks Online ·    │
        │  self-hosted)        │         │ Neuzmail · ExamFX · Printful · Google Tr.  │
        │  ~30 collections     │         └────────────────────────────────────────────┘
        └─────────────────────┘
```

**Key characteristics**

| Aspect | Detail |
|---|---|
| Frontend | Angular 17 (NgModule-based, not standalone), Bootstrap 5, ngx-translate i18n, Stripe.js, socket.io-client |
| Backend | Express 4, Mongoose 8, Socket.IO 4, JWT auth, Joi validation, Winston logging |
| Database | MongoDB via Mongoose (~30 models), soft-delete + audit-trail pattern |
| Real-time | Socket.IO with JWT-authenticated sockets, per-user rooms (`user:<id>`) |
| Deployment | Single Node process behind nginx reverse proxy, managed by PM2 (`ecosystem.config.json`), GitHub Actions SSH deploy |
| Serving model | Express serves `/api/*` **and** the built Angular bundle (`frontend/dist`) with SPA fallback |
| Timezone | Forced to `America/New_York`, overridable via `SystemConfig.app_timezone` |

The backend refuses to boot without a valid `JWT_SECRET` (≥16 chars). A `/status` live
dashboard (express-status-monitor) and `/health` + `/health/ping` endpoints expose runtime health.

---

## 2. Folder Structure

```
rphoffice/
├── index.js                      # Tiny root launcher → backend/server.js
├── package.json                  # Root scripts: build, deploy, dev, claude:* tooling
├── ecosystem.config.json         # PM2 process config
├── nginx.conf / deploy.sh        # Reverse-proxy + deployment scripts
├── netlify.toml                  # (frontend static hosting option)
│
├── backend/
│   ├── server.js                 # App entry: middleware, route mounting, Socket.IO, health
│   ├── .env / .env.example       # Secrets & integration config
│   ├── routes/                   # 25 Express routers (one per business domain)
│   ├── models/                   # ~30 Mongoose schemas
│   ├── middleware/               # auth, audit, validation, rateLimiter, payment, upload
│   ├── utils/                    # Integration clients & helpers (stripe, docusign,
│   │                             #   quickbooks, neuzmail, examfx.service, encryption,
│   │                             #   storage, logger, email, helpers)
│   ├── config/                   # docusign_private.key (JWT-grant RSA key)
│   ├── email-templates/          # Email HTML templates
│   ├── uploads/                  # User-uploaded files (onboarding docs, statements, branding)
│   ├── logs/                     # Winston daily-rotate log files
│   ├── scripts/                  # Maintenance scripts (reconstruct-users, backfill, etc.)
│   └── tests/ + test-*.js        # Jest unit/integration + Playwright E2E suites
│
├── frontend/
│   ├── src/app/
│   │   ├── app.module.ts         # Root NgModule
│   │   ├── app-routing.module.ts # All client routes + AuthGuard role gating
│   │   ├── components/           # Feature components (admin/, apply/, dashboard/, etc.)
│   │   ├── services/             # ~27 HTTP service clients (one per domain)
│   │   ├── guards/               # AuthGuard, LoginRedirectGuard
│   │   ├── interceptors/         # auth.interceptor (JWT inject + 401/503 handling),
│   │   │                         #   payment.interceptor
│   │   ├── models/               # TypeScript interfaces (user, onboarding)
│   │   ├── pipes/                # Custom pipes
│   │   └── assets/i18n/          # Translation JSON
│   ├── environments/             # API base URL per env
│   └── dist/                     # Built bundle served by Express
│
├── postman/                      # API collections
├── history/                      # Auto-generated change history
└── *.md                          # Audit / QA / issues / business-rules reports
```

**Convention:** each business domain has a matching trio — a backend `routes/<x>.routes.js`,
one or more `models/`, and a frontend `services/<x>.service.ts` + `components/<x>/`.

---

## 3. Request Flow

### REST request lifecycle
```
Browser → Angular service (HttpClient)
   └─ auth.interceptor: attaches `Authorization: Bearer <JWT>` from localStorage
        ↓ HTTPS
Express (server.js) global pipeline:
   1. express-status-monitor      (metrics)
   2. helmet                      (CSP / security headers)
   3. cors                        (APP_URL allow-list, credentials)
   4. express.json / urlencoded   (body parsing)
   5. morgan → winston            (structured request logging)
   6. express.static              (Angular bundle + guarded /uploads)
        ↓
   7. Route match  app.use('/api/<domain>', router)
        ↓
   8. Per-route middleware chain (typical):
        rateLimiter → protect (JWT verify + load req.user) →
        authorize('admin') / admin → validateRequest(Joi schema) →
        [audit.middleware logAction] → controller handler
        ↓
   9. Mongoose query → MongoDB
        ↓
  10. Response via helpers.sendResponse / errorResponse
        ↓
  11. Central error handler (server.js) logs + returns sanitized JSON
        ↓
Angular service → component. 401 → interceptor clears token & redirects to /login;
503 + maintenanceMode → non-admins bounced to /login with a maintenance message.
```

### Non-API requests
Any non-`/api` path falls through to `app.get('*')` and returns the Angular `index.html`
(SPA fallback). If the frontend isn't built, returns `503` with a build hint.

### Real-time flow
On login the client opens a Socket.IO connection passing the JWT in `handshake.auth.token`.
`io.use(...)` verifies the token, checks the user is active/not-deleted and (for non-admins)
that maintenance mode is off, then joins room `user:<id>`. Routes push live updates
(notifications, broadcasts) via `app.locals.io.to('user:<id>').emit(...)`.

---

## 4. Database Flow

**ODM:** Mongoose 8. Connection is established once in `connectDatabase()` (reused if already
open), reading `MONGODB_URI`. After connect, the app loads `SystemConfig.app_timezone`.

### Cross-cutting data patterns
- **Soft delete:** records carry `deletedAt` / `deletedBy` instead of being removed. Queries
  filter `deletedAt: null`. `User.softDelete()` runs in a **transaction**, cancels Stripe
  subscriptions, and **cascades** the soft-delete to ~10 related collections
  (Payment, Subscription, Notification, LicensingProgress, ProductionSubmission,
  OnboardingDocument, AgentCarrierStatus, ExamFXProgress, NotificationPreference, Onboarding,
  APAApplication) and removes the user from its parent's `children` cache. `User.restore()`
  reverses it (matching the same `deletedAt` timestamp).
- **Audit trail:** `AuditLog` model + `audit.middleware.logAction` record sensitive actions.
- **Denormalization caches:** `User.children[]` caches direct downline; `getDownlineTree()` /
  `getFullHierarchy()` rebuild the genealogy tree with breadth-first descendant fetching to
  avoid N+1 queries. ACA records denormalize agent name/email and resync on User save via
  a post-save hook (`ACAClientRecord.syncAgentInfo`).
- **System configuration:** `SystemConfig` is a key/value collection driving runtime behavior
  (timezone, maintenance mode `site_access_enabled`/`site_access_message`, branding, OAuth
  tokens, integration API keys/template fields). The auth middleware caches maintenance state
  for 30s to avoid per-request DB hits.

### Core models (~30)
`User`, `Onboarding`, `OnboardingDocument`, `OnboardingDocType`, `DocumentFolder`,
`DocumentHubFile`, `DocumentRequest`, `APAApplication`, `Payment`, `Subscription`, `Coupon`,
`Carrier`, `AgentCarrierStatus`, `ProductionSubmission`, `ProductType`, `PromotionLevel`,
`CommissionStatement`, `LicensingProgress`, `ExamFXProgress`, `ACAClientRecord`,
`AcaTierConfig`, `TrainingCategory`/`TrainingFolder`/`TrainingMaterial`, `Broadcast`,
`Notification`, `NotificationPreference`, `PrintfulOrder`, `AuditLog`, `SystemConfig`.

### Genealogy / MLM data model
The `User` collection is self-referential: `referredBy` (parent), `children[]` (cached direct
reports), `referralCode` (auto-generated, unique), `level`, `promotedAt`/`promotedBy`,
`transferredAt`. This forms the recruiting downline tree that powers My Team, Downline,
promotions, and commission roll-ups.

---

## 5. External Integrations

All integration clients live in `backend/utils/`; secrets in `backend/.env`
(see `.env.example`). Most also read live config/keys from `SystemConfig`.

| Integration | Module | Purpose |
|---|---|---|
| **Stripe** | `utils/stripe.js` | One-time fees + monthly subscriptions, customers, payment intents, webhooks. Used by `payment.routes`, APA payment, business-card orders. Guarded init (disables gracefully if key absent). |
| **DocuSign** | `utils/docusign.js` | E-signature of the **APA Agreement** via JWT-grant auth (`config/docusign_private.key`). Sends envelopes from a template (`DOCUSIGN_TEMPLATE_ID`) and processes signing webhooks (HMAC secret). Drives the APA onboarding flow. |
| **QuickBooks Online** | `utils/quickbooks.js` + `quickbooks.routes` | OAuth2 (intuit-oauth) employee sync. Tokens persisted in `SystemConfig` across restarts. Syncs approved agents (`qboEmployeeId`/`qboSyncedAt`). |
| **Neuzmail** | `utils/neuzmail.js` | Primary transactional email (template-based REST API): welcome/set-password, password reset, APA confirmation, payment link, account activated, generic notification. Rate-limited (5 req/60s) — broadcasts batch 4 emails then pause 61s. |
| **Nodemailer (SMTP)** | `utils/email.js` | Legacy SMTP email path, kept for fallback/reference. |
| **ExamFX** | `utils/examfx.service.js` + `examfx.routes` | Licensing-exam progress tracking. Supports REST API, webhook receiver, and CSV-upload / manual sync (ExamFX lacks a public API). |
| **Printful** | `business-cards.routes.js` | Business-card print-on-demand (`api.printful.com`); orders stored in `PrintfulOrder`, paid via Stripe. |
| **Google Translate** | frontend (CSP allow-listed) | On-page translation widget. |

`utils/encryption.js` provides AES-256-GCM encryption (key from `ENCRYPTION_KEY`) for
sensitive stored values (e.g. OAuth tokens / secrets).

---

## 6. Authentication Flow

**Scheme:** stateless JWT (HS256, `JWT_SECRET`, default 7-day expiry). Passwords hashed with
bcrypt (salt rounds 10) via a `User` pre-save hook. Roles: **`admin`** and **`agent`**.

### Login
```
POST /api/auth/login  (authLimiter rate-limited, Joi-validated)
  → find user by lowercased email (+password)
  → reject if deletedAt / inactive / bad password (generic "Invalid credentials")
  → non-admins blocked if maintenance mode (site_access_enabled=false) → 503
  → update lastLogin; on FIRST login mark pre-existing broadcasts as read
  → generateToken(user) → return { token, user }
Client stores token + user in localStorage.
```

### Authenticated requests
`auth.middleware.protect`:
1. Extract `Bearer` token → `jwt.verify`.
2. Load `req.user` (minus password); reject if missing / `deletedAt` / `!isActive`.
3. Admins bypass remaining checks.
4. Non-admins: enforce maintenance mode (30s-cached `SystemConfig` lookup) → 503 if disabled.
5. (Payment-gating code exists but is **currently disabled** — agents access without payment.)

**Authorization helpers:** `authorize(...roles)` and `admin` guard role-restricted routes.
`optionalAuth` attaches `req.user` if a valid token is present but never blocks.

### Other auth paths
- **Forgot/Reset password:** `forgot-password` issues a SHA-256-hashed reset token (10-min TTL,
  emailed via Neuzmail; always returns a generic message to prevent email enumeration);
  `reset-password/:token` validates and updates.
- **Auto-login / token-exchange:** post-registration one-time token (SHA-256 hashed, 5-min TTL)
  exchanged at `POST /api/auth/token-exchange` for a JWT — used to seamlessly log a new agent
  in after applying.
- **Change password:** `POST /api/auth/change-password` (verifies current password).
- **Socket auth:** JWT verified in `io.use()`; non-admins blocked during maintenance.

### Frontend enforcement
- `auth.interceptor.ts` injects the token and globally handles **401** (clear storage →
  `/login`) and **503 maintenanceMode** (bounce non-admins to `/login` with message).
- `AuthGuard` gates routes by login state and `route.data.roles`; `LoginRedirectGuard` keeps
  logged-in users off `/login`.
- **Public routes (no guard):** `/login`, `/apply`, `/application-success`, `/forgot-password`,
  `/reset-password`, `/sign-apa`, `/apa-payment`, `/payment-success`.

### File access control
`/uploads/branding`, `/uploads/welcome`, `/uploads/broadcast-images` are public; **all other
uploads require a valid JWT** (verified inline in `server.js` before `express.static`).

---

## 7. Key Business Modules

| Module | Backend route(s) | Frontend | What it does |
|---|---|---|---|
| **Recruiting & Application (APA)** | `apa.routes`, `admin-apa.routes`, `public.routes` | `apply/`, `sign-apa/`, `admin/admin-apa-*` | Public applicant intake → DocuSign **APA Agreement** signing → Stripe payment → account creation + auto-login. Admins review applications. |
| **Onboarding** | `onboarding.routes`, `onboarding-hub.routes` | `onboarding/`, `admin/onboarding-management` | Document upload/collection per `OnboardingDocType`; status workflow (`not-started→pending→approved/rejected/missing`); admin review & approval; QBO employee sync on approval. |
| **Document Hub ("RHP Vault")** | `document-hub.routes` | `document-hub/` | Foldered file repository (`DocumentFolder`/`DocumentHubFile`) + document **requests** from admins to agents, with email notifications. |
| **Genealogy / Team** | `agent.routes`, `user.routes` | `recruits/`, `downline/`, `my-team/`, `admin/hierarchy` | Referral-based downline tree, recruit lists, full org hierarchy (admin). Built on `User.referredBy`/`children`. |
| **Licensing & ExamFX** | `licensing.routes`, `examfx.routes` | `licensing/`, `examfx-progress/`, `admin/examfx` | Track pre-licensing exam progress (`LicensingProgress`, `ExamFXProgress`) via ExamFX API / CSV upload; agent + downline visibility. |
| **Production** | `production.routes` | `production/` | Agents submit sold policies (`ProductionSubmission`) by carrier/product/category (Life, Health/ACA, Medicare, Supplemental, Retirement). Feeds promotions & ACA volume. |
| **Promotions** | `promotion.routes` | `admin/promotion-levels` | Rank advancement (`PromotionLevel`) computed from qualifying premium volume (Life + Supplemental only) over rolling windows, respecting agent transfer dates. |
| **Commissions** | `commission-statements.routes` | `commissions/`, `admin/commission-statements` | Admin uploads commission statement PDFs; agents view their statements. |
| **Carriers & Appointments** | `carrier.routes` | `carriers/`, `admin/carriers`, `admin/carrier-appointments` | Carrier directory + per-agent appointment/contract status (`AgentCarrierStatus`); supplemental level guides. |
| **ACA Client Volume** | `aca.routes` | `admin/aca-management` | Admin imports ACA client records (CSV/XLSX) into `ACAClientRecord`; tiered counting via `AcaTierConfig`; agent info denormalized & auto-synced. |
| **Payments & Subscriptions** | `payment.routes`, `coupon.routes` | `payment/`, `transactions/`, `admin/payments` | Stripe customers, one-time fees, monthly subscriptions, coupons; billing-exempt flag; admin payment management. (Access-gating currently disabled.) |
| **Business Cards** | `business-cards.routes` | `business-cards/`, `admin/printful-orders`, `admin/vistaprint-config` | Order branded business cards via Printful, pay via Stripe, track in `PrintfulOrder`. |
| **Broadcasts & Notifications** | `broadcast.routes`, `notification.routes` | `broadcasts/`, `user/notifications`, `admin/broadcast-management` | Admin announcements (role-targeted, batched email) + per-user real-time notifications over Socket.IO with `NotificationPreference`. |
| **Training** | `training.routes` | `training/`, `admin/training-management` | Categorized training materials/folders (`TrainingCategory`/`TrainingFolder`/`TrainingMaterial`). |
| **Admin & System Config** | `admin.routes`, `config.routes`, `admin-products.routes` | `admin/system-config`, `admin/branding`, `admin/welcome-message`, `admin/monitoring`, `admin/products` | User management, branding, welcome message, product catalog (`ProductType`), system monitoring dashboard, maintenance mode toggle. |
| **QuickBooks** | `quickbooks.routes` | (admin config) | OAuth2 connect + employee/agent sync to QBO. |

---

## Quick Reference

- **Run dev:** `cd backend && npm run dev` (nodemon) + `cd frontend && npm start` (ng serve :4200)
- **Build + serve prod:** `npm run build` then `node index.js` (Express serves API + bundle on :5000)
- **Tests:** backend `npm test` (Jest unit/integration + Playwright E2E); frontend `ng test` (Karma)
- **Health:** `GET /health` (detailed), `GET /health/ping` (fast), `/status` (live dashboard)
- **Required env:** `JWT_SECRET` (≥16 chars), `MONGODB_URI`; integrations need their respective
  keys (Stripe, DocuSign, QBO, Neuzmail, ExamFX, Printful) — see `backend/.env.example`.
