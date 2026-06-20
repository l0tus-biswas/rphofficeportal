# RHP Office — Full-System Engineering Audit

> **Scope:** Complete reverse-engineering and multi-disciplinary review of the RHP Office platform (backend + frontend + DevOps).
> **Method:** Seven parallel investigation agents (Architecture, Security, Performance, Database, Integration/DevOps, QA/Bug, Product) following the 11-phase audit protocol in `.ruflo/prompts/full-system-audit.md`. All findings are evidence-based with `file:line` citations.
> **Audit date:** 2026-06-16
> **Codebase:** MEAN stack — Angular 17 frontend (63 components, 27 services), Express/Mongoose backend (~40k LOC, 24 route files, 30 models), MongoDB.

Each finding carries: **Category · Evidence · Impact · Recommendation · Effort (S/M/L) · Priority (P1–P4)**.

---

## Table of Contents
1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Product Understanding](#3-product-understanding)
4. [Security Findings](#4-security-findings)
5. [Performance Findings](#5-performance-findings)
6. [Integration Findings](#6-integration-findings)
7. [Bug Findings](#7-bug-findings)
8. [Database & Data-Model Findings](#8-database--data-model-findings)
9. [Technical Debt Findings](#9-technical-debt-findings)
10. [Missing Features](#10-missing-features--product-gaps)
11. [Testing Gaps](#11-testing-gaps)
12. [DevOps & Observability Gaps](#12-devops--observability-gaps)
13. [Documentation Gaps](#13-documentation-gaps)
14. [Top 20 Highest-Value Improvements](#14-top-20-highest-value-improvements)

---

## 1. Executive Summary

RHP Office is a production insurance-agency platform that digitizes the full agent lifecycle: recruit application → DocuSign agreement → Stripe payment → onboarding/compliance → licensing & ExamFX training → carrier appointments → production reporting → commissions → downline/promotion management. It is a feature-rich monolith (Express API + Angular SPA served from one process) integrating Stripe, DocuSign, QuickBooks Online, Neuzmail, ExamFX, Printful, and Socket.io.

The platform is functional and broad, but the audit surfaced **a cluster of critical issues that should block the next production release** and a large body of high-value remediation work. The most urgent themes:

- **Secrets exposure.** A live DocuSign RSA private key (`backend/config/docusign_private.key`) is committed to the repository and not git-ignored. Combined with PII-rich console logging and SSN stored in plaintext, this is the single highest-risk area.
- **Authentication & access-control gaps.** JWT expiry silently disables when `JWT_EXPIRE` is unset; the DocuSign webhook signature check is intentionally bypassed; payment-access enforcement middleware is fully commented out; the `/status` operational dashboard is publicly exposed.
- **Financial-data integrity risks.** Money is stored inconsistently (cents vs. dollars across models), coupon usage increments are non-atomic (over-redemption), and a concurrent payment-verification path can create duplicate users/subscriptions.
- **Scalability cliffs.** Several core endpoints (admin hierarchy, ACA tracker, promotion checks) use recursive N+1 query patterns and unbounded collection loads that degrade sharply with org size; one recursive tree walk has no cycle guard and can crash the dashboard.
- **Thin test coverage on critical paths.** Stripe webhooks, APA payment verification, and promotion calculations — the most financially consequential code — have effectively no functional tests; several "tests" hit a live server with hardcoded credentials and cannot run in CI.

**Overall posture:** capable product, **fragile foundations**. With a focused remediation sprint on the P1 items (secrets rotation, auth hardening, money standardization, the highest-impact N+1 fixes, and webhook integrity), the platform's risk profile improves dramatically. None of the P1 fixes are individually large; the value-to-effort ratio is excellent.

### Severity Snapshot

| Area | Critical/P1 | High/P2 | Medium/P3 | Low/P4 |
|---|---|---|---|---|
| Security | 3 | 6 | 5 | 3 |
| Performance | 3 | 5 | 7 | 2 |
| Integration / DevOps | 3 | 8 | 6 | 3 |
| Bugs | 3 | 6 | 3 | — |
| Database | 4 | 5 | 6 | — |
| Tech Debt | 5 | 7 | — | 3 |
| Product Gaps | 4 | 9 | 5 | — |

---

## 2. Architecture Overview

The system is a **monolithic MEAN application** deployed as a single Node/Express process that serves both the REST API (`/api/*`) and the compiled Angular 17 SPA from `dist/`. `backend/server.js` registers 21 routers, configures Helmet/CORS/Morgan globally, mounts Socket.io on the same HTTP server, and provides an SPA catch-all fallback. There is no API gateway, BFF, or service decomposition; all 24 route files load eagerly at startup against a single MongoDB connection.

**Business logic is not separated into a service layer.** Every route handler is a self-contained async function that imports Mongoose models directly, queries the DB, calls third-party SDKs, sends email, emits Socket.io events, and formats the HTTP response — all in one place. The five largest route files are effectively miniature applications: `admin.routes.js` (1,412 LOC), `apa.routes.js` (1,291), `business-cards.routes.js` (1,106), `production.routes.js` (1,066), `examfx.routes.js` (957). Cross-cutting concerns are partially extracted but inconsistently applied: Multer upload config is duplicated across 12 route files, the downline-tree traversal is implemented **four** different ways, and route files `require()` each other at call time (`admin.routes.js:1213` requires `payment.routes`; `production.routes.js:870` requires `promotion.routes`), creating implicit circular dependencies.

**Configuration** comes from `.env` (read at startup, only `JWT_SECRET` validated) plus a `SystemConfig` MongoDB collection used as an untyped key-value store mixing feature flags, branding/content, and **third-party credentials** (Printful API key, QBO tokens) — some encrypted, some not.

**Frontend** is a single monolithic `AppModule` declaring all 63 components with **no lazy loading** (`app-routing.module.ts` uses `component:` everywhere, no `loadChildren`/`loadComponent`), so every user downloads the entire bundle. State is ad-hoc `BehaviorSubject`-per-service rather than a unified store. The JWT and full serialized user object are stored in `localStorage`; role checks (`isAdmin()`, `isAgent()`) derive from that local copy and are duplicated across guards, interceptors, and template `*ngIf`. Of 293 `.subscribe()` calls across 60 components, only 16 files implement cleanup, indicating widespread subscription leaks.

**Request flow (typical write):** Angular service → `AuthInterceptor` attaches `Bearer` token → Express `protect` middleware verifies JWT + DB-loads the user on every request → role middleware → route handler (validation via Joi on a subset of routes) → Mongoose → response. Real-time events (broadcasts, notifications) push over Socket.io.

---

## 3. Product Understanding

### Business Purpose
RHP Office is a full-stack **insurance agent recruiting and lifecycle management platform** for an insurance agency (brand configurable via `branding.appName`). It digitizes and automates the entire agent pipeline: prospect submission, agreement signing, payment, onboarding compliance, licensing, carrier appointments, production reporting, commission distribution, and team-hierarchy management.

### Target Users
- **Recruits** — complete the APA application via referral link, sign documents, pay setup fees.
- **Licensed agents** — submit production, track commissions, manage downline, request carrier appointments, access training.
- **Admins/managers** — oversee user lifecycle, document review, commission uploads, ACA data, analytics, promotions, QuickBooks sync, broadcasts, system config.

### Core Workflows & User Journeys (evidence-based)
- **Recruit onboarding** (`apa.routes.js`, `apply.component.html`): visit `/apply?ref=AGENTCODE` (bilingual EN/ES, 5-section auto-saving form) → DocuSign envelope sent & signed → Stripe payment (~$179 setup + ~$25/mo) → admin activation → welcome email with credentials.
- **Agent lifecycle**: dashboard (licensing countdown, promotion tracker, ACA volume tracker, referral link) → Onboarding Hub (document upload, admin comments, banking/direct-deposit) → ExamFX pre-license tracking (admin CSV upload) → licensing checklist → carrier appointments (request/approve, level guides) → production submissions (multi-product, CSV export, ranking) → commission statements (admin uploads PDFs) → My Team / downline tree → broadcasts/notifications (Socket.io + email) → ACA client tracking (CSV/XLSX, leaderboards, tier config) → promotion levels (premium thresholds, auto-trigger on In Force).
- **Admin capabilities** (`admin.routes.js`): user CRUD + activate/deactivate/soft-delete/restore/transfer/billing-exempt; hierarchy & stats; APA review; training management; commission upload; QuickBooks sync; welcome message; system monitoring; coupons; maintenance mode; branding; promotion levels; Printful orders; onboarding doc types; Document Hub ("RHP Vault"); ACA management.

### Confirmed Integrations
DocuSign (envelope + webhook), Stripe (checkout/subscriptions/webhook), QuickBooks Online, Socket.io (real-time), Neuzmail/SMTP (email), ExamFX (CSV import), Printful (business cards).

---

## 4. Security Findings

### Authentication & Authorization Flow
Auth is JWT-based. `POST /api/auth/login` validates credentials with bcrypt, then `generateToken()` (`backend/utils/helpers.js:17-19`) issues `jwt.sign({ id }, JWT_SECRET, { expiresIn: JWT_EXPIRE })`. Every request runs `exports.protect` (`auth.middleware.js:33-122`), which verifies the token and re-loads the user from the DB (`User.findById(decoded.id).select('-password')`). Roles are enforced via `authorize(...roles)` and `admin` middleware at route-group level. **There is no token revocation, refresh-token mechanism, or blacklist**; payment-access enforcement is fully commented out in both `auth.middleware.js:90-107` and `payment.middleware.js`.

---

**SEC-1. Committed DocuSign RSA Private Key** — **Critical / P1**
- Category: Secrets Management / Credential Exposure
- Evidence: `backend/config/docusign_private.key` (contains `-----BEGIN RSA PRIVATE KEY-----`); referenced in `README.md:149`; confirmed NOT in `.gitignore` and present in git history.
- Impact: Full DocuSign account compromise — an attacker can create/send/retrieve envelopes as the application and access all signed APA agreements (PII).
- Recommendation: **Immediately revoke and rotate** the DocuSign key. Add `backend/config/*.key`/`*.pem` to `.gitignore`, purge from history with `git filter-repo`, and load the key from an env var (base64) or secrets manager. Rotate JWT_SECRET, Stripe, and encryption keys as a precaution.
- Effort: M

**SEC-2. JWT Expiry Silently Disabled When `JWT_EXPIRE` Unset** — **Critical / P1**
- Category: Authentication / Token Management
- Evidence: `backend/utils/helpers.js:19`; `auth.routes.js:67,304`; startup check `server.js:16-21` validates only `JWT_SECRET`. If `JWT_EXPIRE` is undefined, `jwt.sign` issues a **non-expiring token**.
- Impact: Stolen/leaked tokens never expire — indefinite access on token compromise.
- Recommendation: Add `JWT_EXPIRE` to startup validation; default to `'7d'`/`'24h'` in `generateToken` when falsy. Add a refresh-token flow.
- Effort: S

**SEC-3. SSN Stored Unencrypted in `APAApplication`** — **Critical / P1**
- Category: PII / Data Protection
- Evidence: `backend/models/APAApplication.js:24` (`ssn: String // Should be encrypted in production`). The AES-256-GCM utility `backend/utils/encryption.js` is used for bank fields in `OnboardingDocument.js:79-85` but **not** for SSN. SSN is also sent to DocuSign (`utils/docusign.js:437`) and QuickBooks (`quickbooks.routes.js:218`) in plaintext.
- Impact: SSN exposure in a breach — severe regulatory/legal liability (GLBA, state insurance law).
- Recommendation: Encrypt `ssn` at rest using the existing utility (as done for bank fields); backfill existing records; exclude from list endpoints universally.
- Effort: M

**SEC-4. DocuSign Webhook Signature Validation Bypassed** — **High / P1**
*(Cross-confirmed by Architecture, Integration, and QA agents.)*
- Category: Webhook Integrity / Authentication
- Evidence: `apa.routes.js:217-220` logs "allowing anyway" and continues when validation fails. The validator itself `utils/docusign.js:804-807` returns `true` when `DOCUSIGN_WEBHOOK_SECRET` is missing.
- Impact: Any party who finds the public webhook URL can forge `completed` events to advance applications to `pending_payment`, trigger payment emails, and drive account-creation logic with no real signature.
- Recommendation: Hard-reject (HTTP 401) on validation failure once secrets are configured; remove the "missing secret ⇒ true" allowance; gate any dev bypass on `NODE_ENV==='development'` only; refuse to start without the webhook secret.
- Effort: S

**SEC-5. Payment-Access Enforcement Permanently Disabled** — **High / P2**
- Category: Authorization / Business-Logic Bypass
- Evidence: `auth.middleware.js:90-107` and `payment.middleware.js:9-13` — checks commented out with "PAYMENT CHECK TEMPORARILY DISABLED". Middleware still imported/applied, giving a false sense of enforcement.
- Impact: All authenticated agents get full access regardless of payment/subscription state — direct revenue loss.
- Recommendation: Re-enable behind a `SystemConfig` feature flag (so it can be toggled without deploy); track re-enablement with a ticket and date.
- Effort: S

**SEC-6. `express-status-monitor` `/status` Dashboard Publicly Exposed** — **High / P2**
*(Cross-confirmed by Security and Integration agents.)*
- Category: Sensitive Data Exposure
- Evidence: `server.js:32-51` mounts `statusMonitor` before any auth; `/status` shows CPU, memory, load, response times, RPS, status codes to anyone.
- Impact: Real-time operational intelligence for attackers (deploy timing, error spikes, load).
- Recommendation: Protect `/status` with admin auth or IP allowlist; or move to an internal monitoring stack.
- Effort: S

**SEC-7. Unescaped User Input in MongoDB `$regex` (NoSQL Injection / ReDoS)** — **High / P2**
- Category: NoSQL Injection / ReDoS
- Evidence: `commission-statements.routes.js:162` (`{ $regex: req.query.carrier }`); `coupon.routes.js:23-24` (`$regex: req.query.search`). An `escapeRegex` helper exists and is used in `admin.routes.js`/`public.routes.js` but not here.
- Impact: Catastrophic-backtracking regex can block the event loop (DoS); broad patterns enable data enumeration.
- Recommendation: Apply `escapeRegex` to all `$regex` constructions; cap search-param length; prefer `$text` indexes.
- Effort: S

**SEC-8. Arbitrary `sortBy` Key Injected into `.sort()`** — **High / P2**
- Category: NoSQL Injection / Information Disclosure
- Evidence: `agent.routes.js:116,138` passes `req.query.sortBy` verbatim into `.sort()`; same arbitrary-key pattern in `coupon.routes.js:31-32`.
- Impact: Schema enumeration / sort-based inference on sensitive fields.
- Recommendation: Allowlist sort fields.
- Effort: S

**SEC-9. `trust proxy: true` Enables IP Spoofing → Rate-Limit Bypass** — **High / P2**
- Category: API Security / Rate Limiting
- Evidence: `server.js:29` (`app.set('trust proxy', true)`); IP-keyed limiters in `rateLimiter.middleware.js:11-21`; `audit.middleware.js:21-27` trusts `X-Forwarded-For`.
- Impact: Attackers rotate spoofed `X-Forwarded-For` to bypass rate limits on reset/apply/API; audit-log IPs spoofable.
- Recommendation: Set `trust proxy` to the exact hop count / proxy CIDR.
- Effort: S

**SEC-10. `crypto@1.0.1` Deprecated Stub in Dependencies** — **High / P2**
- Category: Dependency Risk
- Evidence: `backend/package.json:28`. This is a deprecated stub, not Node's built-in.
- Impact: Dependency confusion / potential shadowing of the built-in module.
- Recommendation: `npm uninstall crypto`; rely on the Node built-in.
- Effort: S

**SEC-11. Multer `application/octet-stream` MIME Bypass + multer 1.x** — **Medium / P3**
- Category: File Upload Security
- Evidence: `document-hub.routes.js:36`, `commission-statements.routes.js:31` allow `application/octet-stream`; `package.json:41` pins `multer@1.4.5-lts.1`.
- Impact: Arbitrary file content uploadable with a spoofed extension; stored-XSS/parser risk.
- Recommendation: Remove the octet-stream allowance; validate magic bytes (`file-type`); migrate off multer 1.x.
- Effort: M

**SEC-12. `/health` Leaks Node Version & Memory Without Auth** — **Medium / P3**
- Category: Information Disclosure
- Evidence: `server.js:224-226` returns `process.version`, package version, memory stats, uptime, DB status with no auth.
- Impact: Runtime fingerprinting for targeted CVE exploitation.
- Recommendation: Keep a minimal public `/health/ping`; move detailed health behind admin auth.
- Effort: S

**SEC-13. No Global `apiLimiter` on Protected API Routes** — **Medium / P3**
- Category: Rate-Limiting Coverage
- Evidence: `apiLimiter` defined (`rateLimiter.middleware.js:11-21`) but never applied; only auth/apply/reset limiters wired.
- Impact: A valid token can scrape/enumerate all data unthrottled.
- Recommendation: `app.use('/api', apiLimiter)` with role-aware tiers.
- Effort: S

**SEC-14. CSP Allows `'unsafe-inline'` and `'unsafe-eval'`** — **Medium / P3**
- Category: XSS / CSP
- Evidence: `server.js:57-60`.
- Impact: CSP provides no effective XSS protection despite being configured.
- Recommendation: Adopt Angular strict CSP with nonces/hashes; sandbox Google Translate.
- Effort: L

**SEC-15. Temporary Password Emailed in Plaintext on Registration** — **Medium / P3**
- Category: Sensitive Data Exposure
- Evidence: `public.routes.js:127,152`; `admin.routes.js:204,218`; a set-password-link alternative (`sendWelcomeSetPasswordEmail`) already exists for the DocuSign flow.
- Impact: Email compromise yields valid credentials.
- Recommendation: Migrate all registration flows to the set-password-link model with a 24h one-time token.
- Effort: M

**SEC-16. Path-Traversal Risk in `onboarding-hub` Download** — **Medium / P3**
- Category: Path Traversal
- Evidence: `onboarding-hub.routes.js:553` joins `doc.filePath` with no bounds check, unlike the protected pattern in `commission-statements.routes.js:320-323`.
- Impact: Arbitrary file read if a malicious `filePath` is ever stored.
- Recommendation: Add the `startsWith(backendRoot)` bounds check uniformly to all file-serving endpoints.
- Effort: S

**SEC-17. SMTP `rejectUnauthorized: false` Disables TLS Validation** — **Medium / P3**
- Category: Configuration / MitM
- Evidence: `utils/email.js:33`.
- Impact: SMTP man-in-the-middle even with correct credentials.
- Recommendation: Remove or gate to non-production.
- Effort: S

**SEC-18. `xlsx@0.18.5` (Archived) in Production Deps** — **Low / P4**
- Category: Dependency Risk
- Evidence: `package.json:49`. Known prototype-pollution/memory issues; no longer maintained.
- Impact: Risk when parsing untrusted Excel uploads.
- Recommendation: Migrate to `exceljs` or sandbox parsing.
- Effort: M

---

## 5. Performance Findings

**PERF-1. `User.getFullHierarchy()` Recursive N+1 + Unbounded `LicensingProgress` Load** — **P1**
*(Cross-confirmed by Architecture, Performance, and Database agents.)*
- Category: N+1 / Scalability
- Evidence: `models/User.js:548-572` issues one `find({ referredBy })` per node (O(N) fan-out, exponential by depth/breadth); `admin.routes.js:71-78` then loads the **entire** `LicensingProgress` collection unfiltered (`find({})`).
- Impact: Admin hierarchy endpoint degrades super-linearly; risk of connection-pool exhaustion. A 4-level tree (×5) ≈ 150+ queries per load.
- Recommendation: Replace with a single `User.find({ deletedAt: null }).lean()` + in-memory parent→children map (the `getDownlineTree` pattern), or `$graphLookup`; scope `LicensingProgress.find({ agent: { $in: ids } })`.
- Effort: M

**PERF-2. `getDownlineIds` Sequential N+1 via `children` (Hot Path)** — **P1**
- Category: N+1 / Scalability
- Evidence: `utils/helpers.js:87-104` calls `User.findById(...)` per node; invoked by production team scope, ranking, ACA tracker, promotion tracker (`production.routes.js:132,234,329,540`; `aca.routes.js:358`; `promotion.routes.js:339,416,787`).
- Impact: 50 downline agents → 50+ sequential queries **per request**, multiplied across dashboards.
- Recommendation: Batch per level with `User.find({ referredBy: { $in: levelIds } })` (the `getAllDescendantsFlat` pattern in `agent.routes.js:565`); centralize as one canonical helper.
- Effort: M

**PERF-3. Promotion Check Chain (`getUplineChainIds` → `checkAndNotifyPromotion`) on Every In-Force Change** — **P1**
- Category: N+1 / Scalability
- Evidence: `promotion.routes.js:301-313` sequential upline walk; `production.routes.js:871-886,1042-1056` loops calling `checkAndNotifyPromotion`, which itself calls `getDownlineIds` (PERF-2) + aggregates + notification queries.
- Impact: A single status change can fan out to 35–70 DB ops; sustained DB load and race risk.
- Recommendation: Move the promotion-check chain to a job queue (BullMQ); the write path enqueues one job.
- Effort: L

**PERF-4. ACA Tracker / Agent Stats Load Entire ACA + Agent Collections Per Request** — **P2**
- Category: Memory / Scalability
- Evidence: `aca.routes.js:509-530`, `agent.routes.js:260-282`, `admin.routes.js:761-789` (triplicated) load full `ACAClientRecord` batch + all agents, then recurse `sumTree` in memory on every dashboard load.
- Impact: Per-request multi-MB heap allocation; GC pressure under concurrency.
- Recommendation: Pre-compute team totals on upload (cache/summary collection or Redis); dedupe the three copies.
- Effort: M

**PERF-5. `GET /api/admin/stats` — 17+ Sequential Queries, No Batching** — **P2**
- Category: Scalability / N+1
- Evidence: `admin.routes.js:661-864` — 17+ awaited `countDocuments`/`aggregate`/`find` calls in series; in-memory team-ACA BFS.
- Impact: Every admin dashboard load serializes ~18 round-trips.
- Recommendation: `Promise.all` independent queries; combine counts into `$facet`/`$group`; cache result ~60s.
- Effort: M

**PERF-6. `getDownlineTree` O(N²) In-Memory Tree Build** — **P2**
- Category: Scalability
- Evidence: `models/User.js:526-533` — `descendants.filter(...)` per node (250k iterations at 500 nodes).
- Impact: Quadratic CPU on large downlines, blocking the event loop.
- Recommendation: Build a `Map<parentId, children[]>` once before recursion (as `agent.routes.js:606-625` does).
- Effort: S

**PERF-7. `notifyUplineChain` Sequential Walk + Per-Ancestor Preference Lookups** — **P2**
- Category: N+1
- Evidence: `models/Notification.js:158-183` sequential `findById` per level; `createNotification` (118-155) does two `NotificationPreference.isEnabled` `findOne`s each.
- Impact: ~12 sequential DB ops per In-Force review.
- Recommendation: Batch-load chain + preferences (`$in`), `insertMany`; queue email.
- Effort: M

**PERF-8. Missing Compound Index `(agent, status, deletedAt)` on `ProductionSubmission`** — **P2**
- Category: Missing Index
- Evidence: `models/ProductionSubmission.js:141-145` indexes are single-field; team aggregations match `{ agent: {$in}, status, deletedAt }` (`promotion.routes.js:43-59`).
- Impact: Team-scoped aggregations scan within the agent range.
- Recommendation: Add `index({ agent:1, status:1, deletedAt:1 })` and `({ status:1, deletedAt:1, submissionDate:-1 })`.
- Effort: S

**PERF-9. Missing Indexes on `APAApplication.userId`, `Onboarding.user`, `Subscription.user`** — **P2**
- Category: Missing Index
- Evidence: `models/APAApplication.js:203-206` (no `userId` index); `models/Onboarding.js` (no indexes); `models/Subscription.js:80-81` (no `user` index). All queried by these fields in admin/cascade paths.
- Impact: Collection scans, slow during bulk admin operations.
- Recommendation: Add the missing indexes.
- Effort: S

**PERF-10. ACA CSV Upload — Per-Agent Regex `findOne` on Unindexed `name`** — **P3**
- Category: N+1 / Memory
- Evidence: `aca.routes.js:190-243` loops `User.findOne({ name: { $regex } })` per distinct agent (100–200 unindexed scans per upload); whole file buffered in memory.
- Impact: Heavy collection scans + memory spikes on upload.
- Recommendation: Pre-load all agents once into a name→user map; add a `name` index; process large files as a background job.
- Effort: S

**PERF-11. `getPremiumByLeg` Nested BFS + Per-Leg Aggregate** — **P3**
- Category: N+1
- Evidence: `promotion.routes.js:231-262` — per-leg BFS with per-node `findById` + per-leg aggregate.
- Impact: 50–100 DB ops for eligible agents hitting `/tracker`.
- Recommendation: Reuse already-computed `downlineIds`; one aggregation grouped by first-level `referredBy`.
- Effort: M

**PERF-12. Frontend — No Lazy Loading (Single Bundle)** — **P2**
*(Cross-confirmed by Architecture and Performance agents.)*
- Category: Frontend
- Evidence: `app-routing.module.ts` uses `component:` for all routes; `app.module.ts:80-145` declares 63 components.
- Impact: Every user downloads admin + agent + payment code; large initial bundle, slow TTI on mobile.
- Recommendation: Convert to standalone components + `loadComponent`/`loadChildren`; group admin routes. ~40–60% initial-bundle reduction.
- Effort: L

**PERF-13. Frontend — 293 Subscriptions, 16 Files with Cleanup (Memory Leaks)** — **P2**
- Category: Frontend / Memory
- Evidence: 293 `.subscribe()` across 60 components; 16 files with `ngOnDestroy`/`takeUntil`. Service-level `interval(30000)`/`interval(60000)` polling (`notification.service.ts:34-44`, `broadcast.service.ts:53`).
- Impact: Accumulating leaks + ghost HTTP/socket handlers during long admin sessions.
- Recommendation: Adopt `takeUntilDestroyed()` / `async` pipe across all components.
- Effort: M

**PERF-14. Unbounded `GET /api/admin/aca-clients/records` (No Pagination)** — **P3**
- Category: Unbounded Query
- Evidence: `aca.routes.js:337-344` returns all batch records populated, no `.limit()`.
- Impact: Large responses grow linearly with batch size.
- Recommendation: Add pagination or a hard cap.
- Effort: S

**PERF-15. `aca-clients/batches` N+1 Uploader Lookup** — **P3**
- Category: N+1
- Evidence: `aca.routes.js:292-299` — `User.findById(b.uploadedBy)` per batch after aggregation.
- Impact: ~24 extra sequential lookups.
- Recommendation: `$lookup` in the aggregation pipeline.
- Effort: S

---

## 6. Integration Findings

### Integration Inventory

| Integration | Purpose | Library / Transport | Config Source |
|---|---|---|---|
| Stripe | Payments, subscriptions, webhooks | `stripe`, `@stripe/stripe-js` | `.env` (`STRIPE_*`) |
| DocuSign | APA e-signatures (JWT, templates, HMAC webhooks) | `docusign-esign` | `.env` + key file; template ID also from `SystemConfig` |
| QuickBooks Online | Employee/payroll sync | `intuit-oauth`, `axios` | `.env`; OAuth tokens encrypted in `SystemConfig` |
| Email (SMTP, legacy) | Transactional email | `nodemailer` | `.env` (`SMTP_*`) |
| Neuzmail (primary) | Transactional email | `axios` REST | `.env` (`NEUZMAIL_*`) |
| ExamFX | Training/exam progress (stub) | native `fetch` | `.env` (`EXAMFX_*`) |
| Printful | Business-card print-on-demand | `axios` | `SystemConfig` (DB) |
| File storage | Documents/PDFs/uploads | local `fs` | hardcoded `backend/uploads/` |

**INT-1. DocuSign Webhook Bypass + PII Body Logging** — **P1** — see **SEC-4**; additionally `apa.routes.js:211-214` dumps full headers/body (signer PII) to console on every event. *Recommendation:* reject on invalid signature; log only `{envelopeId, event, status}` at debug level.

**INT-2. Full Webhook/Recruiting PII Logged via `console.*`** — **P2**
- Evidence: `apa.routes.js:211-214`; `utils/docusign.js:199-203` logs `JSON.stringify(application.recruitingInfo)`; 59 `console.*` in `docusign.js`.
- Impact: PII (name/email, possibly SSN tab values) persisted in PM2/CI logs.
- Recommendation: Route through Winston `debug`; remove `JSON.stringify(application…)` dumps.
- Effort: M

**INT-3. No Timeout/Retry on Stripe & ExamFX; Retries Absent Everywhere** — **P2**
- Evidence: `utils/stripe.js:10` (no `timeout`/`maxNetworkRetries`); `utils/examfx.service.js:69` (no `AbortController`); only `neuzmail.js:84` and `quickbooks.js:148` set timeouts.
- Impact: A network stall hangs the Express request, exhausting workers under load.
- Recommendation: `stripe(key,{timeout:15000,maxNetworkRetries:2})`; `AbortSignal.timeout()` for fetch; exponential-backoff retry wrapper for DocuSign.
- Effort: S

**INT-4. DocuSign Reads Private Key from Disk & Mints JWT Every Call (No Token Cache)** — **P2**
- Evidence: `utils/docusign.js:43-77` (`fs.readFileSync` per call); called at 185/650/680/843/930.
- Impact: Disk I/O + DocuSign JWT-grant rate limit (≈1/min) → 429s under concurrency.
- Recommendation: Cache the access token in-memory with expiry; refresh near expiry.
- Effort: S

**INT-5. SSN Transmitted to QuickBooks in Plaintext; Bulk Sync Has No Per-Agent Gate** — **P2**
- Evidence: `quickbooks.routes.js:219`, `utils/quickbooks.js:185`; `sync-all-employees` loops all agents.
- Impact: Regulated PII transmitted without masking/justification in an automated bulk loop.
- Recommendation: Confirm necessity; mask in audit logs (`***-**-1234`); add explicit admin warning/consent.
- Effort: M

**INT-6. DocuSign Webhook Has No Idempotency Guard** — **P2**
- Evidence: `apa.routes.js:252-332` — retries re-download the PDF, re-create `OnboardingDocument`, and re-send the payment email.
- Impact: Duplicate emails / file conflicts on DocuSign retries.
- Recommendation: Early-exit if already `completed`/`pending_payment`.
- Effort: S

**INT-7. Neuzmail Template UIDs Can Be Empty; No SMTP Fallback** — **P3**
- Evidence: `utils/neuzmail.js:49-66` — empty-string defaults; throws with no fallback to `email.js`.
- Impact: Misconfiguration silently breaks registration/reset/APA emails.
- Recommendation: Assert required template UIDs at startup; fall back to SMTP for password reset.
- Effort: S

**INT-8. ExamFX Integration Is a Stub Against an Undocumented API** — **P3**
- Evidence: `utils/examfx.service.js:1-19,140-175` — guessed field mappings; header admits no public API.
- Impact: Silent empty/zero sync if the real API differs.
- Recommendation: Obtain real API docs; add sandbox integration tests; surface normalization failures.
- Effort: L

**INT-9. Printful Key Unencrypted in `SystemConfig`** — **P3** — `business-cards.routes.js:38-45`. Encrypt with `encryption.js`. Effort: S.

---

## 7. Bug Findings

**BUG-1. Race Condition → Duplicate User/Subscription on Concurrent Payment Verification** — **P1**
- Category: Race Condition / Data Integrity
- Evidence: `apa.routes.js:521-541` — check `status === 'completed'` then set+save is non-atomic; concurrent redirect + webhook retry both pass.
- Impact: Duplicate user accounts and Stripe subscriptions; billing anomalies; invalid referral credits.
- Recommendation: Atomic `findOneAndUpdate({_id, status:'pending_payment'}, {$set:{status:'completed'}})`; abort if null; handle E11000 on user create.
- Effort: M

**BUG-2. Null-Pointer Crash on `latest_invoice.payment_intent.client_secret`** — **P1**
- Category: Null Reference
- Evidence: `payment.routes.js:162` accesses the chain unconditionally; requires `expand:['latest_invoice.payment_intent']` in `createSubscription`.
- Impact: Subscription created in Stripe/DB but response crashes → user billed, sees error, may retry (double subscription).
- Recommendation: Add the `expand` param or optional-chain with a null fallback.
- Effort: S

**BUG-3. Password-Reset Token Returned in Public API Response** — **P1**
- Category: Security / Information Disclosure
- Evidence: `apa.routes.js:764-770` returns `setPasswordToken` in the unauthenticated verify-payment response.
- Impact: Account takeover if the response is logged/cached.
- Recommendation: Deliver the token only by email; remove from the HTTP body.
- Effort: S

**BUG-4. Coupon `usedCount`/`usageCount` Non-Atomic Increment (Over-Redemption)** — **P2**
*(Cross-confirmed by Database and QA agents.)*
- Category: Race Condition
- Evidence: `apa.routes.js:450-459` (`coupon.usedCount += 1; save()`); `models/Coupon.js:118-121` (`incrementUsage`).
- Impact: Concurrent redemptions exceed `usageLimit`/`maxUses`.
- Recommendation: Atomic `findOneAndUpdate` with `$inc` guarded by `usageCount < limit`.
- Effort: S

**BUG-5. Unguarded Background Email IIFE in Broadcasts** — **P2**
- Category: Error Handling
- Evidence: `broadcast.routes.js:419-524` — `(async()=>{...})()` with no `.catch()`; only the inner send is guarded.
- Impact: Unhandled rejection → process crash (Node 15+) or silent halt.
- Recommendation: Add `.catch()` / wrap the IIFE body in try/catch.
- Effort: S

**BUG-6. Unbounded Recursion (No Cycle Guard) in `sumTreeGlobal` (ACA Tracker)** — **P2**
- Category: Crash Risk
- Evidence: `aca.routes.js:521-524` — recursive tree walk, no `visited` set / depth cap.
- Impact: A referral cycle (manual edit / transfer bug) crashes `/api/dashboard/aca-tracker` for all callers (`Maximum call stack size exceeded`).
- Recommendation: Add cycle detection / iterative BFS with depth cap; or `$graphLookup`.
- Effort: M

**BUG-7. Money Unit Inconsistency in Payment Records (Dollars vs Cents)** — **P2**
- Category: Data Corruption
- Evidence: `apa.routes.js:539` (`amount_total/100`, dollars) vs `:547` (`amount_total`, cents); mock path `:1154,1179` stores `20` as cents.
- Impact: Corrupted financial reporting/reconciliation.
- Recommendation: Standardize on integer cents everywhere; schema validator; JSDoc the unit.
- Effort: M

**BUG-8. APA `verify-payment` Marks Completed Before Validating Phone** — **P2**
- Category: Logic / Error Handling
- Evidence: `apa.routes.js:532-566` — status set to `completed` + Payment created with `user:null` before the `!primaryPhone` 400 return; retry short-circuits as "already verified" with no user.
- Impact: Application stuck completed with no account; Stripe subscription orphaned; manual fix needed.
- Recommendation: Validate phone before status mutation, or wrap in a revertible transaction.
- Effort: M

**BUG-9. Broadcast `unread-count` Uses `new Date()` Fallback (Always Zero)** — **P3**
- Category: Logic Bug
- Evidence: `broadcast.routes.js:126` (`req.user.createdAt || new Date()`) vs correct `new Date(0)` at `:77`.
- Impact: Unread badge permanently 0 for users missing `createdAt` → missed announcements.
- Recommendation: Use `new Date(0)`.
- Effort: S

**BUG-10. Partial / Missing `try/catch` on Async Handlers** — **P3**
- Category: Error Handling
- Evidence: `training.routes.js` (try-block/route-count mismatch); broadcast IIFE (BUG-5).
- Impact: Unhandled rejections → hung requests or crash.
- Recommendation: Add an async-handler wrapper + Express error middleware; audit each outer callback.
- Effort: M

---

## 8. Database & Data-Model Findings

### Database Design Overview
30 Mongoose collections. The agent hierarchy lives entirely in `User` via self-referential `referredBy` plus a denormalized `children[]` cache (not the source of truth — `getFullHierarchy` ignores it, risking divergence). Soft-delete (`deletedAt`/`deletedBy`) is the primary deletion strategy across 19 models, with a 9-collection transactional cascade in `User.softDelete()` — but several financial/PII collections are excluded. Money is `Number` (IEEE-754 double) everywhere, stored inconsistently as cents (Payment/Subscription) vs dollars (APA payment sub-doc, Coupon), with no `Decimal128` and no rounding on percentage math. `AuditLog` is append-only, fire-and-forget, with no TTL and no `action` enum.

**DB-1. `User.email` Has No Unique Constraint** — **P1**
- Evidence: `models/User.js:12-18,217` — plain non-unique index only.
- Impact: Duplicate accounts → ambiguous login/reset, duplicate Stripe customers, cross-agent data leakage.
- Recommendation: Add `unique:true` (dedupe first via migration).
- Effort: S

**DB-2. Inconsistent Money Units (Cents vs Dollars) Across Models** — **P1**
- Evidence: `models/Payment.js:14`; `models/APAApplication.js:124,128`; `apa.routes.js:539,1154`; `models/Coupon.js:101-107` (float `%` math, no rounding).
- Impact: Cross-referencing models computes wrong totals; fractional-cent drift.
- Recommendation: Standardize on integer cents; `Math.round` coupon math; document units.
- Effort: M

**DB-3. SSN Stored Unencrypted** — **P1** — see **SEC-3** (`models/APAApplication.js:24`).

**DB-4. Non-Atomic Coupon Usage Increment** — **P1** — see **BUG-4** (`models/Coupon.js:118-121`).

**DB-5. CommissionStatement / ACAClientRecord / DocumentRequest Excluded from Delete Cascade** — **P2**
- Evidence: `models/User.js:346-356` (cascade list omits them); `ACAClientRecord.js`/`CommissionStatement.js` have no `deletedAt`.
- Impact: Orphaned financial/document records referencing deleted users; reports include deleted agents.
- Recommendation: Add `deletedAt`/`deletedBy` + include in cascade; backfill.
- Effort: M

**DB-6. `User.getFullHierarchy()` Unbounded N+1** — **P2** — see **PERF-1** (`models/User.js:548-572`).

**DB-7. No Index on `Payment.stripePaymentIntentId`/`stripeInvoiceId` (Webhook Hot Path)** — **P2**
- Evidence: `models/Payment.js:22-28,67-68`; `payment.routes.js:290,319` `findOne` by intent id.
- Impact: Collection scan on every Stripe event; webhook timeouts under load.
- Recommendation: Add sparse indexes on both fields.
- Effort: S

**DB-8. `User.level` Has No Enum (Silent Invalid Levels)** — **P2**
- Evidence: `models/User.js:39-42`; `promotion.routes.js:395-396` uses `toLowerCase()` workaround.
- Impact: Typos silently disable promotion calc for affected agents.
- Recommendation: Add enum from PromotionLevel names, or ref `PromotionLevel`; normalize first.
- Effort: M

**DB-9. `AuditLog` Has No TTL & No `action` Enum** — **P2**
- Evidence: `models/AuditLog.js:1-33`; inconsistent action strings (`UPDATE_PROFILE` vs `user_update`).
- Impact: Unbounded growth; unreliable querying/alerting.
- Recommendation: Add TTL index (e.g. 365d) + enum/naming convention.
- Effort: S

**DB-10. Recovery JSON Artifacts Committed; Migrations Non-Idempotent** — **P2**
- Evidence: `backend/scripts/recovery-2026-05-12.json`, `recovery-users.restore.json`, `envelope-*.json`; migration scripts have no run-state/idempotency.
- Impact: PII in source control; risk of double-applying destructive migrations.
- Recommendation: Remove recovery files from VCS + rotate; adopt `migrate-mongo` with a migrations collection; add idempotency guards.
- Effort: M

**DB-11. APAApplication Has Two User Refs (`userId` + `user`)** — **P3**
- Evidence: `models/APAApplication.js:14,145`; cascade uses only `userId` (`User.js:382-385`).
- Impact: Orphaned refs; ambiguous queries.
- Recommendation: Consolidate to one canonical field.
- Effort: M

**DB-12. `User.children[]` Cache Has No Integrity Guarantee** — **P3**
- Evidence: `models/User.js:62-65,548-572`; `utils/helpers.js:82`.
- Impact: Hierarchy/commission divergence if cache and `referredBy` drift.
- Recommendation: Pick one source of truth (prefer `referredBy`) or add an integrity-check job.
- Effort: M

**DB-13. ACA Premium/Tier Rate Float Math Without Rounding** — **P3**
- Evidence: `models/ACAClientRecord.js:26`; `models/AcaTierConfig.js:7,61` (`count*rate`).
- Impact: Compounding bonus-calculation drift.
- Recommendation: Round / store cents.
- Effort: S

**DB-14. Missing `User.stripeCustomerId` Index** — **P3**
- Evidence: `models/User.js:143-145` (sparse, no index) vs indexed on Subscription/APA.
- Impact: Scans when resolving Stripe customer → user in webhooks.
- Recommendation: Add sparse index.
- Effort: S

**DB-15. `AuditLog.logAction` Fire-and-Forget Swallows Failures** — **P3**
- Evidence: `middleware/audit.middleware.js:58-70`.
- Impact: Silent audit-trail gaps.
- Recommendation: Retry/queue audit writes or emit a failure metric.
- Effort: M

---

## 9. Technical Debt Findings

**TD-1. God-Object Route Files — Business Logic in HTTP Layer** — **P1**
- Evidence: `admin.routes.js` (1,412 LOC), `apa.routes.js` (1,291), `business-cards.routes.js` (1,106), `production.routes.js` (1,066), `examfx.routes.js` (957); e.g. `admin.routes.js:659-865` does 17 awaits + in-memory BFS in one handler.
- Impact: Untestable in isolation; huge change surface; merge conflicts.
- Recommendation: Extract `backend/services/` classes; routes become thin (validate → call service → format).
- Effort: L

**TD-2. Downline Traversal Implemented Four Different Ways** — **P1**
- Evidence: `User.getDownlineTree`/`getFullHierarchy` (`models/User.js:489-572`), `getAllDescendantsFlat` (`agent.routes.js:565-625`), `getDownlineIds` (`helpers.js:87-104`), `_getDownlineIds` (`examfx.routes.js:897-900`).
- Impact: Inconsistent results & perf; bug fixes must touch multiple copies.
- Recommendation: Consolidate into one batched-BFS `HierarchyService`.
- Effort: M

**TD-3. Cross-Route `require()` Inside Handlers (Implicit Circular Deps)** — **P1**
- Evidence: `admin.routes.js:1213,1276`; `production.routes.js:870,893,1042`.
- Impact: Route files double as libraries; circular-dep risk; breaks isolated testing.
- Recommendation: Move shared functions into services.
- Effort: M

**TD-4. Payment Enforcement Dead-Commented in Two Places** — **P1** — see **SEC-5**. Effort: S.

**TD-5. DocuSign Webhook Signature Bypass** — **P1** — see **SEC-4**. Effort: S.

**TD-6. `User` Model Embeds Cascade/Stripe Orchestration** — **P2**
- Evidence: `models/User.js:315-486` (`softDelete`/`restore` require Stripe + 9 collections).
- Impact: Model knows about 11 other models; untestable.
- Recommendation: Extract `UserLifecycleService`.
- Effort: M

**TD-7. Multer Config Duplicated Across 12 Route Files** — **P2**
- Evidence: 14 `multer.diskStorage` occurrences across 12 files.
- Impact: Divergent size/MIME/path rules; security fixes must be replicated.
- Recommendation: `utils/upload.js` factory.
- Effort: M

**TD-8. `console.*` Mixed With Winston (218 Calls) / Routes Don't Use Logger** — **P2**
- Evidence: 218 `console.*` across 21 route files; routes never import `utils/logger`. (`apa.routes.js:210-230` logs webhook PII.)
- Impact: Business-logic errors invisible to log aggregation; PII leakage.
- Recommendation: Replace with `logger.*`; add `no-console` lint rule.
- Effort: M

**TD-9. Frontend Monolithic NgModule / No Lazy Loading** — **P2** — see **PERF-12**. Effort: L.

**TD-10. JWT + User Object in `localStorage`; Role Derived Client-Side** — **P2**
- Evidence: `services/auth.service.ts:57-58,71-77,84-92,119-124`.
- Impact: XSS token theft; stale role data.
- Recommendation: `httpOnly` `SameSite=Strict` cookie; derive role from server.
- Effort: M

**TD-11. Incomplete/Inconsistent Validation Coverage** — **P2**
- Evidence: `validation.middleware.js:25-80` (only 8 schemas); unvalidated mutations e.g. `admin.routes.js:274` (billing-exempt), `production.routes.js:120+` (free-form `customFields`).
- Impact: Malformed input reaches Mongoose; generic late errors; regex-DoS risk.
- Recommendation: Joi schema on every POST/PUT/PATCH; share `escapeRegex`.
- Effort: M

**TD-12. `SystemConfig` as Untyped Mixed-Purpose Store (Incl. Secrets)** — **P2**
- Evidence: `business-cards.routes.js:26-35` (Printful key), `admin.routes.js:1303-1354` (welcome object), `auth.middleware.js:17-30`.
- Impact: Secrets exposed via DB dump/NoSQL injection; no shape validation.
- Recommendation: Secrets → env vars; key allowlist + per-key type validation.
- Effort: M

**TD-13. `User.getFullHierarchy` O(N²) Queries** — **P2** — see **PERF-1**. Effort: S.

**TD-14. Duplicate `currentUser$`/`currentUser` in AuthService** — **P4**
- Evidence: `services/auth.service.ts:14-15`.
- Recommendation: Remove the alias.
- Effort: S

---

## 10. Missing Features & Product Gaps

**PROD-1. Commission Statements Are Upload-Only (No Calculation/Visibility)** — **P1**
- Evidence: `commission-statements.routes.js` is PDF upload/download only; README roadmap marks commission tracking incomplete.
- Business Impact: Agents can't see how commissions are computed — a core agency expectation.
- Solution: Structured commission line-item model (policy/premium/rate/amount/period); MTD/YTD totals.
- Effort: L

**PROD-2. No Recruit Onboarding-Status Visibility** — **P1**
- Evidence: `dashboard.component.html:633-681` shows generic tips only; APA status stored but not surfaced.
- Business Impact: Opacity → drop-off and support tickets ("did my application go through?").
- Solution: Onboarding timeline widget (Applied → Signed → Paid → Under Review → Active) fed by `GET /api/public/apa-application/:id`.
- Effort: M

**PROD-3. No Two-Factor Authentication** — **P1**
- Evidence: `auth.routes.js` password/JWT only; no `2fa`/`totp` references.
- Business Impact: Agents access SSN, banking, commissions — email compromise = full takeover.
- Solution: TOTP (e.g. `speakeasy`) or email OTP; mandatory for admins.
- Effort: M

**PROD-4. No PII/Security & Data-Retention Policy** — **P1** (also a doc gap)
- Evidence: SSN/banking/DOB collected; no `SECURITY.md`, retention, or breach procedure.
- Business Impact: GLBA / state-insurance compliance and liability risk.
- Solution: `docs/SECURITY.md` documenting PII inventory, encryption, retention, access, breach response.
- Effort: M

**PROD-5. No Bulk Operations in User Management** — **P2**
- Evidence: `user-management.component.html` per-row actions only; no bulk endpoints in `admin.routes.js`.
- Business Impact: Manual cohort processing wastes admin time at scale.
- Solution: Multi-select + bulk activate/deactivate/export; backend bulk endpoint.
- Effort: M

**PROD-6. No Self-Service Email Change** — **P2**
- Evidence: `profile.component.html:47` email field `disabled`.
- Business Impact: No recovery path for typos/provider changes → support burden, access loss.
- Solution: Verified email-change flow (password + confirm-link).
- Effort: M

**PROD-7. No Admin User/Roster Export** — **P2**
- Evidence: Production has `/export`; no user/roster/licensing export.
- Business Impact: Compliance/payroll reporting requires manual extraction.
- Solution: `GET /api/admin/users/export` (CSV) + UI button.
- Effort: S

**PROD-8. No SMS / Push Notification Channel** — **P2**
- Evidence: `notification.routes.js` is in-app + email only; SMS on roadmap, not built.
- Business Impact: Field agents miss time-sensitive alerts (approvals, doc rejections).
- Solution: Twilio SMS for critical types, or Web Push.
- Effort: M

**PROD-9. No Self-Service Subscription/Billing Management** — **P2**
- Evidence: `payment.routes.js` has admin cancel only; no agent billing view.
- Business Impact: Agents can't view status/update card; failed payments silently deactivate.
- Solution: Billing tab + Stripe Customer Portal link.
- Effort: S–M

**PROD-10. No Failed-Payment Dunning / Alerts** — **P2**
- Evidence: handles `subscription.deleted` but not `invoice.payment_failed`.
- Business Impact: Silent access loss; revenue leakage.
- Solution: Handle `invoice.payment_failed` → notify + portal link; grace period then deactivate.
- Effort: S

**PROD-11. No Agent-Facing Notification-Preferences UI** — **P2**
- Evidence: Full prefs API exists (`notification.routes.js`, 12 categories) but no Angular UI.
- Business Impact: All-or-nothing notifications → fatigue / missed criticals.
- Solution: Notification Settings section in profile.
- Effort: S

**PROD-12. No Admin Notification on New Production Submission** — **P2**
- Evidence: `production.routes.js:773` notifies agent/upline, not admins.
- Business Impact: Delayed review → delayed In-Force/commission/promotion.
- Solution: Notify admins on new submission.
- Effort: S

**PROD-13. No Training Completion Tracking** — **P2**
- Evidence: `training.component.html` has no "mark complete"; `training_completed` notification type unused.
- Business Impact: Can't verify required-training completion.
- Solution: Completion records + admin reporting.
- Effort: M

**PROD-14. Missing Accessibility on Progress Bars & Modals** — **P2**
- Evidence: `apply.component.html:47,160,794` progress bars lack `aria-valuenow/min/max`; custom modals lack `aria-modal`/focus trap (`dashboard.component.html:687-768`).
- Business Impact: WCAG/legal exposure on the primary public entry point.
- Solution: Add ARIA attrs; use CDK Dialog / Bootstrap modal with focus management.
- Effort: S

**PROD-15. No APA Funnel Analytics for Admins** — **P2**
- Evidence: dashboard shows user counts, not application-stage funnel.
- Business Impact: Drop-offs (e.g. signed-but-unpaid) invisible without manual queries.
- Solution: Funnel widget with drill-down.
- Effort: S

**PROD-16. ExamFX Is Manual CSV Only (No API Sync)** — **P3**
- Evidence: `examfx.routes.js` CSV-only; stale data if admin forgets.
- Solution: Scheduled API sync + CSV fallback + stale-sync alert.
- Effort: M–L

**PROD-17. Only Two Roles (admin/agent) — No Least-Privilege Tiers** — **P3**
- Evidence: `admin.routes.js:64`; all admins have full PII/financial/delete access.
- Business Impact: Compliance risk as the agency scales.
- Solution: Sub-permissions / manager tier.
- Effort: L

**PROD-18. No Document-Hub Search** — **P3**
- Evidence: `document-hub.component.html` has no search box.
- Solution: Search bar + `GET /api/document-hub/search`.
- Effort: S

**PROD-19. No Reporting/Analytics Export Beyond Production CSV** — **P3**
- Evidence: only production has `/export`.
- Solution: A "Reports" admin page with preset CSV exports.
- Effort: M

---

## 11. Testing Gaps

**Coverage breadth:** ~23 top-level test files plus integration/unit subdirs. Of 24 route files, ~14 have some nominal coverage. **Zero functional coverage** for: `promotion.routes.js`, `broadcast.routes.js`, `notification.routes.js`, `quickbooks.routes.js` (only the SDK wrapper is tested), `onboarding-hub.routes.js`, `config.routes.js`. Many integration tests are shallow auth-gate checks (1–3 assertions); several "tests" hit a **live server with hardcoded real credentials** and cannot run in CI.

**TEST-1. No Tests for Stripe Webhook Critical Path** — **P1**
- Evidence: `payment.routes.js` handlers (`handlePaymentIntentSucceeded`, `handleSubscriptionUpdate/Deleted`, `handleInvoicePaid`) untested; `unit/stripe.test.js` covers only utility creators.
- Impact: Silent regressions in payment-access logic; BUG-1 would have been caught by a concurrency test.
- Recommendation: Jest + supertest with mocked models and synthetic Stripe events.
- Effort: M

**TEST-2. APA Payment Verification Has No Functional Test** — **P1**
- Evidence: `integration/apa-routes.test.js:32-49` accepts any of 5 status codes; `verifyPaymentHandler` untested.
- Impact: Data-corruption bugs (BUG-1, BUG-8) undetected.
- Recommendation: Idempotency, missing-phone, coupon, auto-approve cases.
- Effort: L

**TEST-3. Promotion Calculation — Zero Coverage** — **P1**
- Evidence: no test imports `promotion.routes.js`; `production-promotion-aca.test.js` is live-server E2E.
- Impact: Miscalculated eligibility; PERF-3/BUG-6 unregressed.
- Recommendation: Export & unit-test `sumQualifyingPremium`, `countProducingAgents`, `getPremiumByLeg`, `checkBuilderLegCap` with edge cases.
- Effort: L

**TEST-4. No Commission-Statement Ownership (IDOR) Tests** — **P2**
- Evidence: `integration/payment-carrier-routes.test.js:94-98` tests only 401.
- Impact: IDOR regressions undetected.
- Recommendation: agent-A-cannot-read-agent-B (403); own (200); admin (200).
- Effort: S

**TEST-5. Integration Tests Hit Real DB / Real Stripe with Hardcoded Creds** — **P2**
- Evidence: `billing-payments.test.js:17-34`, `production-promotion-aca.test.js:28-47`.
- Impact: Non-reproducible, pollute DB, false confidence, unusable in CI.
- Recommendation: supertest + mocks; isolate true E2E into an opt-in suite with a test DB.
- Effort: L

**TEST-6. No Tests for Broadcast/Notification/QuickBooks Routes** — **P2**
- Evidence: no references to those route handlers in tests.
- Impact: BUG-5, BUG-9, QBO OAuth refresh failures undetectable.
- Recommendation: Add integration tests (broadcast creation, unread-count incl. BUG-9, QBO callback mocked).
- Effort: M

**TEST-7. No Regression Test for `sumTreeGlobal` Cycle Crash** — **P3** — see **BUG-6**. Effort: S.

**TEST-8. No Coverage Thresholds Enforced** — **P3**
- Evidence: `backend/coverage/` exists; no `coverageThreshold` in jest config.
- Impact: Coverage can silently erode to 0% on new files.
- Recommendation: Add `coverageThreshold` (start ~60% lines/functions) for routes/utils.
- Effort: S

---

## 12. DevOps & Observability Gaps

**OPS-1. `/status` Dashboard Public** — **P1** — see **SEC-6**.

**OPS-2. Routes Use `console.*`, Not Winston (Errors Invisible to Aggregation)** — **P2**
- Evidence: no `require('../utils/logger')` in `backend/routes/`; all route logging is `console.*`.
- Impact: Integration errors never reach `error-*.log`; on-call must scrape stdout.
- Recommendation: Import the shared logger in every route; replace `console.*`.
- Effort: M

**OPS-3. Deploy Uses `npm install` (Not `npm ci`); Installs devDeps on Server** — **P2**
- Evidence: `.github/workflows/deploy.yml:83-85`.
- Impact: Non-reproducible deploys; larger server attack surface.
- Recommendation: `npm ci` / `npm ci --omit=dev`; pin Node version.
- Effort: S

**OPS-4. No Rollback / Zero-Downtime; Destructive `git pull` + `pm2 restart`** — **P2**
- Evidence: `deploy.yml:86`, `redeploy.sh:47` (`pm2 restart`, not `reload`); no pre-deploy snapshot.
- Impact: Failed deploy = outage with no auto-recovery.
- Recommendation: `pm2 reload`; record current SHA + revert-on-failure; smoke-test `/health/ping` before finalizing.
- Effort: M

**OPS-5. `ecosystem.config.json` Points to Non-Existent `./index.js`; App-Name Mismatch** — **P2**
- Evidence: `ecosystem.config.json:4` (`./index.js`); `deploy.sh:116` (`escape-backend`) vs workflow `rhp-office-portal`.
- Impact: Fresh PM2 deploys via the ecosystem file fail; restart/start conditional misfires.
- Recommendation: Fix `script` to `./backend/server.js`; standardize app name; add startup smoke-test.
- Effort: S

**OPS-6. `deploy.sh` `chmod -R 777` on Uploads (PII World-Writable)** — **P2**
- Evidence: `deploy.sh:170`.
- Impact: Signed agreements/commission PDFs/PII world-readable/writable on a shared host.
- Recommendation: `chmod -R 750` + correct ownership.
- Effort: S

**OPS-7. No APM / Error-Rate Alerting; `/health` Doesn't Probe Integrations** — **P3**
- Evidence: no Sentry/Datadog/Prometheus; `server.js:203-243` checks only MongoDB.
- Impact: Integration failures (email/Stripe) undetected for hours.
- Recommendation: Add Sentry; extend `/health` with shallow integration probes; external uptime monitor.
- Effort: M

**OPS-8. `nginx.conf` Is a Placeholder (No TLS / Wrong Domain / No Security Headers)** — **P3**
- Evidence: `nginx.conf:2,4` (`yourdomain.com`, `/var/www/escape/frontend`); Plesk is actually used.
- Impact: False sense of config completeness; broken if used directly.
- Recommendation: Delete & document Plesk, or make it a real production config.
- Effort: S

**OPS-9. No Feature Flags / Staged Rollout** — **P4**
- Evidence: no flag system found.
- Impact: Every change hits 100% of users immediately (payments/signatures/HR).
- Recommendation: Env-var gates for major integration features; consider Unleash/`SystemConfig`-based flags.
- Effort: M

**OPS-10. Short Log Retention (14d/30d), No Off-Box Shipping** — **P4**
- Evidence: `utils/logger.js:29,39`.
- Impact: Logs lost on disk failure; <90d insufficient for payment/signature disputes.
- Recommendation: 90d retention + ship logs off-box.
- Effort: S

---

## 13. Documentation Gaps

**DOC-1. Incomplete `.env` Reference** — **P1**
- Evidence: README documents ~18 vars; undocumented: `NEUZMAIL_*`, `ONBOARDING_ROOT` (`admin.routes.js:24`), QBO OAuth vars.
- Impact: First-time setup fails with cryptic runtime errors.
- Recommendation: Audit all `process.env.*`; produce a complete `.env.example` with required/optional flags.
- Effort: S

**DOC-2. No PII/Security & Retention Document** — **P1** — see **PROD-4**.

**DOC-3. No API Reference (No OpenAPI/Swagger)** — **P2**
- Evidence: README endpoint list is partial; no spec file.
- Impact: New devs must read 24 route files; long onboarding.
- Recommendation: `swagger-jsdoc` + `swagger-ui-express` at `/api/docs`.
- Effort: M

**DOC-4. No Architecture/System-Design Document** — **P2**
- Evidence: empty `docs/`; complex promotion logic undocumented.
- Impact: Slow comprehension of component interactions.
- Recommendation: `docs/ARCHITECTURE.md` with diagrams & key data flows.
- Effort: M

**DOC-5. No Operations Runbook** — **P2**
- Evidence: `DEPLOYMENT.md` covers setup only.
- Impact: On-call reverse-engineers procedures under pressure.
- Recommendation: `docs/RUNBOOK.md` (DocuSign resend, Stripe webhook re-verify, ExamFX re-import, maintenance mode, DB backup/restore).
- Effort: S

**DOC-6. No CHANGELOG** — **P3**
- Evidence: inline version tags (`// 6.1`, `// 6.2`...) but no `CHANGELOG.md`.
- Recommendation: Keep-a-Changelog file + pre-deploy update step.
- Effort: S

---

## 14. Top 20 Highest-Value Improvements

Ranked by business impact ÷ effort. **Bold** items are release-blockers.

| # | Improvement | Category | Evidence | Effort | Priority |
|---|---|---|---|---|---|
| 1 | **Revoke & rotate the committed DocuSign private key; purge from history; move all secrets to env/secret-manager** | Security | `backend/config/docusign_private.key`; SEC-1 | M | P1 |
| 2 | **Enforce JWT expiry (validate `JWT_EXPIRE` at startup, sensible default)** | Security | `helpers.js:19`, `server.js:16-21`; SEC-2 | S | P1 |
| 3 | **Hard-reject invalid DocuSign webhook signatures + add idempotency guard** | Security/Integration | `apa.routes.js:217-220`; `docusign.js:804-807`; SEC-4, INT-6 | S | P1 |
| 4 | **Encrypt SSN at rest (reuse existing AES-256-GCM util); mask in logs/QBO** | Security/DB | `APAApplication.js:24`; SEC-3, INT-5 | M | P1 |
| 5 | **Make payment verification atomic; handle duplicate-key — stop duplicate users/subscriptions** | Bug | `apa.routes.js:521-541`; BUG-1 | M | P1 |
| 6 | **Remove `setPasswordToken` from the public API response** | Bug/Security | `apa.routes.js:764-770`; BUG-3 | S | P1 |
| 7 | **Standardize all money to integer cents; fix APA/coupon unit mixing + rounding** | DB/Bug | `Payment.js:14`, `apa.routes.js:539,1154`, `Coupon.js:101-107`; DB-2, BUG-7 | M | P1 |
| 8 | **Make coupon usage increment atomic (`$inc` with limit guard)** | Bug/DB | `apa.routes.js:450-459`, `Coupon.js:118-121`; BUG-4 | S | P1/P2 |
| 9 | **Add `unique:true` on `User.email` (dedupe migration first)** | DB | `User.js:12-18,217`; DB-1 | S | P1 |
| 10 | **Protect `/status` (and detailed `/health`) behind auth/IP allowlist** | Security | `server.js:32-51,224-226`; SEC-6, SEC-12 | S | P1/P2 |
| 11 | **Fix `getFullHierarchy` N+1 + scope `LicensingProgress` load (single query + in-memory tree)** | Performance | `User.js:548-572`, `admin.routes.js:71-78`; PERF-1 | M | P1/P2 |
| 12 | **Add cycle guard to `sumTreeGlobal`; consolidate downline traversal into one batched-BFS service** | Bug/Perf/Debt | `aca.routes.js:521-524`; PERF-2, BUG-6, TD-2 | M | P2 |
| 13 | Add tests for Stripe webhooks, APA verification, and promotion calc (the financially critical, untested paths) | Testing | TEST-1/2/3 | L | P1 |
| 14 | Re-enable payment-access enforcement behind a `SystemConfig` flag | Security/Revenue | `auth.middleware.js:90-107`; SEC-5 | S | P2 |
| 15 | Set `trust proxy` to exact hops; apply global `apiLimiter`; escape all `$regex`; allowlist `sortBy` | Security | SEC-7/8/9/13 | S | P2 |
| 16 | Route all logging through Winston (remove `console.*`, esp. PII webhook dumps); add `no-console` lint | Observability | OPS-2, TD-8, INT-2 | M | P2 |
| 17 | Add missing indexes (Payment Stripe ids, ProductionSubmission compound, APA/Onboarding/Subscription `user`) | Performance/DB | PERF-8/9, DB-7/14 | S | P2 |
| 18 | Add Stripe timeouts/retries + DocuSign token caching; remove `crypto@1.0.1`; encrypt Printful key | Integration | INT-3/4/9, SEC-10 | S–M | P2 |
| 19 | Frontend: lazy-load feature modules + fix subscription cleanup (`takeUntilDestroyed`/async pipe) | Performance | PERF-12/13 | L | P2 |
| 20 | Fix deploy reliability: `npm ci`, correct `ecosystem.config.json` entry, `pm2 reload` + rollback, drop `chmod 777`; add complete `.env.example` | DevOps/Docs | OPS-3/4/5/6, DOC-1 | M | P2 |

---

### Methodology & Confidence Notes
- Findings were produced by seven independent agents and cross-checked; items confirmed by multiple agents (SEC-4, SEC-6, PERF-1, BUG-4) are noted inline and carry higher confidence.
- All citations reference files as they existed at audit time (2026-06-16); line numbers may shift as the code changes. Verify the cited location before acting on a finding.
- A small number of product-gap items are explicitly marked inferred from UI/route evidence rather than confirmed end-to-end.
- This audit reviewed source code statically; it did not execute the application or run the test suite. Dynamic verification (load tests, penetration testing, running the existing Jest/Playwright suites) is recommended to confirm performance and security findings.
