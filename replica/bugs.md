# Bugs: RHP Office Portal

Build: 77c7dee + working tree. Found 2026-11-02 by the e2e suite (`e2e/`) and Jest. "Fixed" means fixed in the working tree and not yet committed. Every fixed bug has a regression test (e2e spec and/or Jest).

## Lead: core flows, uploads, registration (fixed)

| ID | Sev | Title | Status |
| --- | --- | --- | --- |
| BUG-008 | S1 | Unauthenticated `complete-signature` / `complete-payment` let anyone skip e-signature and payment and get an active paid account | fixed |
| BUG-012 | S1 | Any logged-in user could read any file under `/uploads` (commission statements, onboarding/ID/bank documents) bypassing the API ownership checks; deactivated accounts kept access | fixed |
| BUG-001 | S2 | Income Paid entry could be approved twice or flipped after review | fixed |
| BUG-005 | S2 | Admin could transfer an agent under their own downline (referral cycle) | fixed |
| BUG-011 | S2 | Editing a commission statement deleted the original file before the save succeeded (data loss) | fixed |
| BUG-014 | S2 | Onboarding `externalLink` accepted `javascript:` / `data:` URLs for an admin to click | fixed |
| BUG-019 | S2 | Admin upload on behalf of an agent (legacy onboarding) saved the file in the admin's folder, so it could never be downloaded | fixed |
| BUG-027 | S1 | E-sign webhook accepted unsigned or forged calls in production (signature check was advisory, non-constant-time compare) | fixed |
| BUG-002 | S3 | Simultaneous identical production submits both succeeded | fixed |
| BUG-003 | S3 | Malformed id returned 500 (about 35 routes across 8 files); raw error text returned to clients | fixed (shared `serverError`) |
| BUG-004 | S3 | Login page accessibility (contrast, no main landmark) | fixed |
| BUG-009 | S3 | Invalid `payPeriod` on a commission statement returned 500 | fixed |
| BUG-010 | S3 | Rejected uploads left files on disk (commission statements, onboarding IDs and bank docs, carrier docs) | fixed |
| BUG-013 | S3 | Upload filters accepted a disallowed extension when the declared MIME type was allowed (`.html` as pdf) | fixed (statements, onboarding hub, legacy onboarding) |
| BUG-015 | S3 | Non-ASCII file names (accents, curly quotes, emoji) were stored garbled in every upload | fixed (`utils/multer.js`) |
| BUG-016 | S3 | Download with a non-Latin-1 file name crashed with 500 (header), exposed once BUG-015 was fixed | fixed (`contentDisposition`) |
| BUG-017 | S3 | Two simultaneous onboarding uploads of one document type created duplicate documents | fixed |
| BUG-020 | S3 | Wrong type or oversize file in legacy onboarding returned 500 | fixed |
| BUG-022 | S3 | Agents could read an inactive carrier by id although the list hides it | fixed |
| BUG-023 | S3 | Non-string carrier `name` returned 500 | fixed |
| BUG-024 | S3 | A deleted carrier's name could not be reused (duplicate check counted inactive carriers) | fixed |
| BUG-028 | S3 | Unknown `/api/...` routes and missing uploads answered 200 with the SPA's HTML instead of 404 | fixed |
| BUG-018 | S4 | Admin could attach an onboarding document to a user that does not exist | fixed |
| BUG-021 | S4 | Legacy onboarding upload for a non-existent user returned 200 | fixed |
| BUG-025 | S4 | Appointing an already-appointed agent re-notified them | fixed |

## Open

| ID | Sev | Title |
| --- | --- | --- |
| BUG-006 | S3 | Authenticated app shell fails accessibility on every page (no main/h1, unlabeled select, heading order, contrast). Tracked as an expected failure in `f05` |
| BUG-007 | S4 | Two backend test files (`promotion-income-paid-e2e`, `production-promotion-aca`) match no Jest project, so `npm test` never runs them |
| BUG-029 | S4 | `backend/tests/integration/apa-routes.test.js` posts to a path that does not exist and accepts 404, so it protects nothing |

## Parallel workers: further bugs found and fixed (all with regression specs)

**Licensing, ExamFX, ACA** (specs f20, f21, f22)
- S1 ACA `replaceBatch` deleted the existing batch before parsing the new file; an unparseable file wiped data.
- S1 ACA `uploadBatch`/`batch` accepted operator objects (`?uploadBatch[$ne]=x` with replace deleted every other batch).
- S1 ExamFX webhook failed open when no secret was set; wrong-length signature gave 500; operator objects reached the query.
- S2 ExamFX PUT stored `courses:[null]`, after which GET /examfx and /examfx/summary returned 500 for every admin.
- S2 ACA sample CSV always 404 on a fresh deploy (file was git-ignored); ACA agent matching credited the wrong agent (unanchored regex, soft-deleted agents).
- S3 ExamFX: one account linkable to two agents; failed CSV rows inflated counters; wrong-type or oversize uploads gave 500. Licensing: missing checklist data, `toString`/`constructor` as item gave 500 and left files; unanchored extension filter accepted .docm/.pdfx.

**Training, products, coupons, broadcasts, notifications** (specs f30 to f33)
- S1 Stored XSS: uploads kept the client's extension (`evil.html` declared as image/png saved as .html in the PUBLIC training-thumbnails and broadcast-images folders). Extension is now derived from the type, content is sniffed, script-bearing SVG refused (new `utils/uploadGuards.js`).
- S2 Agents could open deleted training materials, deleted folders' contents, inactive or admin-only broadcasts by id.
- S3 Unsafe `javascript:` links accepted (training material URL, broadcast link); coupons accepted discount above 100%, end before start, fractional limits, unescaped regex search; case-variant duplicate product names; arbitrary notification-preference keys; many 500s on non-string or negative input; orphan files and old thumbnails deleted before the new one saved.

**Billing, APA admin, admin users** (specs f40, f41, f42 + Jest billing-guards)
- S1 An admin could deactivate, demote or delete their own account or the last active admin.
- S1 `/public/apply?ref[$ne]=x` attached a new user to an arbitrary upline (operator injection).
- S1/S2 Billing-exempt users could call subscription-intent and reactivate; a late `payment_failed` overwrote a succeeded payment; a redelivered succeeded event re-processed a refunded payment.
- S2 Promote with a non-string level gave 500; negative paging gave 500 across admin lists; admin payments filtered by user showed total 0.
- S3 Admin APA list/stats included soft-deleted users' applications; reject was repeatable; soft-deleted users could be re-activated or edited; payment-settings accepted fractional cents.

**Dashboard, document hub, production extras** (specs f50, f51, f52)
- S1 Production CSV export formula injection (client names beginning with = + - @).
- S2 Document hub listed files from admin-only or inactive folders to agents.
- S3 Downline stats off by one; recruits search `(` gave 500 and sort by `password` was allowed; agents could read inactive or admin-targeted broadcasts; agents saw other recipients of document requests; a folder could be moved under its own descendant; soft-deleted submissions could be read, edited, reviewed; admin production stats filtered by agent were always zero; rejected uploads left orphan files; paging below 1 gave 500.

## Worker "to check" items (not fixed)
- Add `Content-Security-Policy: sandbox` (or force download) for `/uploads` in server.js so any old stored .html/.svg cannot run script; existing files already on disk are not cleaned.
- `/public/recruiters/search` is unauthenticated and returns email and phone of every active agent and admin; `/public/registration-payment-intent` has no rate limiter.
- `User.email` has no unique index (two simultaneous creates can duplicate); saved payment-settings are ignored by payment.routes.js (reads env); admin APA approve does not require signature/payment complete; impersonation tokens cannot be revoked; permanent delete proceeds when the Stripe cancel fails.
- PUT /production/:id lets an agent backdate past the 1-year limit that POST enforces; review away from In Force does not re-run promotion checks; GET /production?scope=team returns notes/customFields of downline submissions.
- ACA tracker `sumTreeGlobal` has no cycle guard; GET /licensing/:id auto-creates progress for any id and returns adminNotes to the agent; unhandled background email promises in broadcast notify/resend.
- Soft delete/restore of users use Mongo transactions (need a replica set; fine in production, not testable on the standalone local Mongo).

## To check (not reproduced or needs a business decision)

- Secrets tracked in git: `backend/config/docusign_private.key`, `backend/.env.test`, `backend/scripts/fetchAdminCreds.js`, two user-recovery JSON dumps. Contents deliberately not read. `backend/.env` and `.env.test` name the same Atlas database: confirm it is not production.
- `npm audit`: 42 backend (2 critical, 22 high) and 14 frontend (6 high) advisories.
- Agents may set `status: 'In Force'` on their own production submissions (feeds promotion).
- Production submissions are accepted against an inactive (deleted) carrier.
- `GET /api/public/check-pending-application` returns an application id and envelope id for any email + referral code pair.
- `GET /api/carriers` returns the whole carrier document to agents, including `notes`, `addedBy`, `deletedBy`.
- `POST /api/payments/create-customer` and `/one-time-intent` answer 500 when Stripe is unreachable (should probably be 502).
- `JWT_EXPIRE` has no default: if unset, tokens never expire.
