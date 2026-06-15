# RHP Office — Issues Report
**Audit Date:** June 13, 2026  
**Total Issues Found:** 62

---

# CRITICAL (7 Issues)

### ISS-001: SSN Stored Unencrypted in Database
- **Severity:** CRITICAL
- **Category:** Security / Compliance
- **Description:** Social Security Numbers submitted via APA application are stored in plaintext in the MongoDB `apaapplications` collection. The `personalInfo.ssn` field contains raw SSN values.
- **Expected Behavior:** SSN should be encrypted at rest using AES-256-GCM (utility already exists in `backend/utils/encryption.js`) before database storage. Decryption should only occur for authorized admin viewing.
- **Actual Behavior:** SSN is stored as a plain string in `APAApplication.personalInfo.ssn`. Any database access (admin panel, MongoDB shell, backup files, log exports) exposes SSNs.
- **Impact:** Federal data breach liability (HIPAA-adjacent for insurance); state data protection law violations; reputational destruction if breached.
- **Reproduction Steps:** 1. Submit APA application with SSN → 2. Query MongoDB: `db.apaapplications.find({}, {"personalInfo.ssn": 1})` → 3. SSNs visible in plaintext.
- **Suggested Fix:** Use `encrypt()` from `backend/utils/encryption.js` on `personalInfo.ssn` before `application.save()` in `apa.routes.js`. Add `decrypt()` when displaying to admin. Add pre-save hook to APAApplication model.
- **Affected Components:** `backend/routes/apa.routes.js`, `backend/models/APAApplication.js`

---

### ISS-002: DocuSign Webhook Signature Validation Bypassed
- **Severity:** CRITICAL
- **Category:** Security / Integration
- **Description:** The DocuSign webhook endpoint logs a warning when signature validation fails but processes the webhook anyway. This allows any HTTP client to forge envelope status changes.
- **Expected Behavior:** Webhook requests with invalid or missing signatures should be rejected with HTTP 401/403.
- **Actual Behavior:** Invalid signatures produce a `console.warn` log entry, then processing continues as if the webhook were legitimate.
- **Impact:** Attackers can forge `envelope-completed` events to bypass DocuSign signing, move applications to `pending_payment` or `active` status, and potentially create unauthorized agent accounts.
- **Reproduction Steps:** `curl -X POST https://rhpoffice.com/api/public/apa-application/docusign-webhook -H "Content-Type: application/json" -d '{"data":{"envelopeId":"<any-valid-id>","status":"completed"}}'`
- **Suggested Fix:** Change the lenient validation to strict: if `!isValidSignature`, return `res.status(401).json({ message: 'Invalid webhook signature' })`.
- **Affected Components:** `backend/routes/apa.routes.js` (lines 148-154)

---

### ISS-003: Payment Enforcement Completely Disabled
- **Severity:** CRITICAL
- **Category:** Business Logic / Revenue
- **Description:** Both `requirePayment()` and `requireOneTimePayment()` middleware functions immediately call `next()` without any checks. The payment verification code is commented out.
- **Expected Behavior:** Agents should be required to complete payment before accessing the platform. Billing-exempt users should skip checks.
- **Actual Behavior:** All agents access the entire platform for free regardless of payment status.
- **Impact:** Direct revenue loss. All agents bypass the subscription paywall. Undermines the entire business model.
- **Reproduction Steps:** 1. Create agent account → 2. Never complete payment → 3. Access all platform features freely.
- **Suggested Fix:** Un-comment payment check logic. Add grace period logic for existing users. Ensure `billingExempt` flag is respected.
- **Affected Components:** `backend/middleware/payment.middleware.js`

---

### ISS-004: Real Stripe Test API Key in Source Control
- **Severity:** CRITICAL
- **Category:** Security / Credential Exposure
- **Description:** A real Stripe test publishable key (`pk_test_51Sf1lj...`) is hardcoded in `frontend/src/environments/environment.ts` and committed to version control.
- **Expected Behavior:** API keys should never be committed to source control. Environment-specific keys should be injected via CI/CD or build-time variables.
- **Actual Behavior:** The Stripe test key is visible in the repository to anyone with read access.
- **Impact:** While this is a publishable (public) key and a test key, it reveals the Stripe account identifier. Combined with other attack vectors, this could enable fraud in test mode.
- **Reproduction Steps:** View `frontend/src/environments/environment.ts` line 6.
- **Suggested Fix:** Replace with placeholder value. Inject real keys via CI/CD environment variables at build time using Angular's `fileReplacements`.
- **Affected Components:** `frontend/src/environments/environment.ts`

---

### ISS-005: PII Logged in Plaintext During DocuSign Operations
- **Severity:** CRITICAL
- **Category:** Security / Data Protection
- **Description:** During DocuSign envelope creation, the application logs signer details including the tab data that contains SSN, phone numbers, addresses, and dates of birth to the console/log files.
- **Expected Behavior:** PII should never appear in application logs. Only envelope IDs and status should be logged.
- **Actual Behavior:** `console.log` statements in `backend/utils/docusign.js` output signer name, email, and tab counts (which contain all PII values).
- **Impact:** PII exposed in PM2 log files (`./logs/out.log`), available to anyone with server access. Violates data protection regulations.
- **Reproduction Steps:** Trigger DocuSign envelope creation → Check `./logs/out.log`.
- **Suggested Fix:** Remove or redact all PII from log statements. Log only envelope ID, status, and tab count.
- **Affected Components:** `backend/utils/docusign.js` (lines 247-260, 559-573)

---

### ISS-006: No Production Monitoring or Alerting
- **Severity:** CRITICAL
- **Category:** Production Readiness / Operations
- **Description:** The application has no APM, error tracking, uptime monitoring, or alerting system. Failures are only discoverable by manually checking PM2 log files.
- **Expected Behavior:** Production application should have error tracking (Sentry/Rollbar), APM (Datadog/New Relic), uptime monitoring, and alerting (PagerDuty/OpsGenie/email).
- **Actual Behavior:** Only PM2 file-based logging exists. No structured logging. No alerts for errors, payment failures, or system crashes.
- **Impact:** Silent failures go undetected. Payment processing errors, webhook failures, database connection drops, and security incidents have no automated response.
- **Reproduction Steps:** N/A — this is an infrastructure gap.
- **Suggested Fix:** Integrate Sentry for error tracking. Add basic uptime monitoring (UptimeRobot or similar). Configure email alerts for error rate thresholds.
- **Affected Components:** Infrastructure / DevOps

---

### ISS-007: No Automated Database Backup Strategy
- **Severity:** CRITICAL
- **Category:** Production Readiness / Data Protection
- **Description:** One manual backup snapshot exists (`backend/backup-2026-05-12T09-29-48/`), but there is no automated backup schedule, no backup verification, and no documented restore procedure.
- **Expected Behavior:** Automated daily backups with retention policy, backup verification, and documented restore procedure.
- **Actual Behavior:** Single manual JSON export exists. No automation. No offsite backup storage. No restore testing.
- **Impact:** Single hardware failure, accidental deletion, or ransomware could result in total data loss including all agent records, applications, and production history.
- **Reproduction Steps:** N/A — infrastructure gap.
- **Suggested Fix:** Set up `mongodump` cron job with daily schedule. Store backups to S3/cloud storage. Test restore monthly.
- **Affected Components:** Infrastructure / Database

---

# HIGH (13 Issues)

### ISS-008: IDOR in Document Request File Downloads
- **Severity:** HIGH
- **Category:** Security / Access Control
- **Description:** The document request response download endpoint (`GET /api/document-hub/requests/:requestId/responses/:agentId/download`) allows any authenticated agent to download another agent's submitted document by guessing/knowing the request ID and target agent ID.
- **Expected Behavior:** Only the submitting agent or an admin should be able to download a specific agent's response file.
- **Actual Behavior:** Access check verifies `req.user._id !== req.params.agentId` but doesn't verify the requesting user is actually part of the document request.
- **Impact:** Confidential documents (financial records, compliance docs) accessible to unauthorized agents.
- **Suggested Fix:** Add check that either `req.user._id === req.params.agentId` OR `req.user.role === 'admin'`.
- **Affected Components:** `backend/routes/document-hub.routes.js` (lines 518-548)

---

### ISS-009: No Two-Factor Authentication
- **Severity:** HIGH
- **Category:** Security / Authentication
- **Description:** Neither admin nor agent accounts support 2FA/MFA. A compromised password gives full account access.
- **Expected Behavior:** Admin accounts should require 2FA. Agent 2FA should be optional.
- **Actual Behavior:** Email + password is the only authentication factor.
- **Impact:** Admin account compromise = total system compromise (user deletion, data export, PII access).
- **Suggested Fix:** Implement TOTP-based 2FA (Google Authenticator/Authy) for admin accounts at minimum.
- **Affected Components:** `backend/routes/auth.routes.js`, `backend/models/User.js`

---

### ISS-010: Rate Limiter Disabled in Development Mode
- **Severity:** HIGH
- **Category:** Security / Infrastructure
- **Description:** Rate limiting is completely skipped when `NODE_ENV === 'development'`. If production is accidentally deployed with wrong NODE_ENV, all rate limits are disabled.
- **Expected Behavior:** Rate limiting should only be disabled in `test` environment. Development should have relaxed but present limits.
- **Actual Behavior:** `shouldSkip()` returns true for both `test` and `development`.
- **Impact:** If NODE_ENV misconfigured in production: brute force login attacks, API abuse, DoS via password reset floods.
- **Suggested Fix:** Remove `development` from skip condition. Only skip in `test`.
- **Affected Components:** `backend/middleware/rateLimiter.middleware.js`

---

### ISS-011: CORS Allows Missing Origin Header
- **Severity:** HIGH
- **Category:** Security / API
- **Description:** The CORS middleware allows all requests without an `Origin` header (`if (!origin) return callback(null, true)`).
- **Expected Behavior:** Requests without Origin should be rejected or restricted to known server-to-server patterns.
- **Actual Behavior:** Any tool (curl, Postman, server-side scripts) can make requests without CORS restrictions.
- **Impact:** Enables cross-origin API abuse from non-browser clients without any origin validation.
- **Suggested Fix:** Only allow missing origin for specific whitelisted paths (webhooks, health checks). Require origin for authenticated endpoints.
- **Affected Components:** `backend/server.js` (CORS config)

---

### ISS-012: No CSRF Protection
- **Severity:** HIGH
- **Category:** Security / Web
- **Description:** No CSRF tokens are used for state-changing operations. The application relies solely on JWT Bearer tokens.
- **Expected Behavior:** State-changing operations should verify CSRF tokens or use SameSite cookie attributes.
- **Actual Behavior:** JWT is stored in localStorage (immune to CSRF but vulnerable to XSS). No additional CSRF protection.
- **Impact:** If XSS vulnerability exists, stored JWT can be exfiltrated. No defense-in-depth.
- **Suggested Fix:** Store JWT in HttpOnly SameSite cookie instead of localStorage. Add CSRF token for form submissions.
- **Affected Components:** Frontend auth service, backend auth middleware

---

### ISS-013: File Upload MIME Type Validation Insufficient
- **Severity:** HIGH
- **Category:** Security / File Upload
- **Description:** File uploads only validate MIME type from the `Content-Type` header and file extension. Neither checks the actual file content (magic bytes).
- **Expected Behavior:** Validate file content using magic byte analysis (e.g., `file-type` package) in addition to MIME type and extension.
- **Actual Behavior:** A renamed executable can bypass validation if its extension and declared MIME type match allowed patterns.
- **Impact:** Malicious file upload could lead to server-side execution or serve malware to downloading users.
- **Suggested Fix:** Add `file-type` package validation. Check magic bytes before accepting upload.
- **Affected Components:** `backend/middleware/onboardingUpload.middleware.js`, `backend/routes/document-hub.routes.js`

---

### ISS-014: Single Point of Failure — Single PM2 Instance
- **Severity:** HIGH
- **Category:** Reliability / Infrastructure
- **Description:** Application runs as a single PM2 fork instance with no clustering, no auto-restart on crash, and no health monitoring.
- **Expected Behavior:** At minimum: cluster mode with multiple instances, max_memory_restart, and PM2 ecosystem watch/restart configuration.
- **Actual Behavior:** `ecosystem.config.json` specifies `instances: 1` and `exec_mode: "fork"`.
- **Impact:** Any unhandled exception crashes the only running instance. No automatic recovery. Complete downtime until manual restart.
- **Suggested Fix:** Change to `exec_mode: "cluster"`, `instances: "max"` (or at least 2), add `max_memory_restart: "500M"`, `restart_delay: 3000`.
- **Affected Components:** `ecosystem.config.json`

---

### ISS-015: No Rollback Mechanism for Deployments
- **Severity:** HIGH
- **Category:** DevOps / Reliability
- **Description:** Deployment scripts (`deploy.sh`, `redeploy.sh`) have no rollback capability. A failed deployment leaves the system in an undefined state.
- **Expected Behavior:** Deployment should tag the current version before updating. Failed deployments should auto-rollback.
- **Actual Behavior:** `redeploy.sh` runs `git pull`, `npm install`, `ng build`, and `pm2 restart` sequentially. Any failure leaves partial state.
- **Impact:** Failed build corrupts frontend. Failed npm install could remove working modules. No way to quickly revert.
- **Suggested Fix:** Add pre-deploy version tagging, build in temporary directory, atomic swap on success, rollback on failure.
- **Affected Components:** `deploy.sh`, `redeploy.sh`

---

### ISS-016: JWT Stored in localStorage
- **Severity:** HIGH
- **Category:** Security / Session Management
- **Description:** JWT tokens are stored in `localStorage` which is accessible to any JavaScript running on the page. XSS attacks can steal the token.
- **Expected Behavior:** JWT should be stored in HttpOnly, Secure, SameSite cookies to prevent JavaScript access.
- **Actual Behavior:** `localStorage.setItem('token', response.token)` in auth service.
- **Impact:** Any XSS vulnerability (including via uploaded files) can exfiltrate the JWT, giving full account access.
- **Suggested Fix:** Migrate to HttpOnly cookie-based token storage. Update auth interceptor to use cookie-based authentication.
- **Affected Components:** `frontend/src/app/services/auth.service.ts`, `frontend/src/app/interceptors/auth.interceptor.ts`

---

### ISS-017: Email Sending Blocks Request Thread
- **Severity:** HIGH
- **Category:** Performance / Architecture
- **Description:** Broadcast email sending runs synchronously in the request handler with 61-second pauses between batches for rate limiting. This blocks the HTTP response.
- **Expected Behavior:** Email sending should be offloaded to a background worker/queue (Bull/Agenda/SQS).
- **Actual Behavior:** The `POST /api/broadcasts/:id/notify` handler sends emails in a blocking loop with `await sleep(61000)` between batches.
- **Impact:** Admin sending broadcasts to 100+ agents blocks the request for minutes. HTTP timeout likely. Server thread unavailable.
- **Suggested Fix:** Implement a job queue (Bull + Redis, or Agenda). Return 202 Accepted immediately. Process emails in background worker.
- **Affected Components:** `backend/routes/broadcast.routes.js` (lines 424-531)

---

### ISS-018: No Account Lockout After Failed Logins
- **Severity:** HIGH
- **Category:** Security / Authentication
- **Description:** While rate limiting exists (5 attempts/15 min), there is no persistent account lockout. An attacker can try 5 passwords every 15 minutes indefinitely.
- **Expected Behavior:** After N failed attempts, account should be temporarily locked (30 min) with notification to user.
- **Actual Behavior:** Rate limit resets every 15 minutes. No account-level lockout. No failed attempt notification.
- **Impact:** Slow brute force attacks can eventually crack weak passwords.
- **Suggested Fix:** Add `failedLoginAttempts` counter to User model. Lock after 10 attempts. Require email verification to unlock.
- **Affected Components:** `backend/routes/auth.routes.js`, `backend/models/User.js`

---

### ISS-019: Stripe Production Key Not Configured
- **Severity:** HIGH
- **Category:** Business Logic / Payment
- **Description:** The production environment file (`environment.prod.ts`) contains `'pk_live_your_stripe_publishable_key'` as a placeholder. Real payments will fail in production.
- **Expected Behavior:** Production should have a valid live Stripe publishable key.
- **Actual Behavior:** Placeholder string `pk_live_your_stripe_publishable_key` is not a valid key.
- **Impact:** All payment processing in production will fail silently or show errors.
- **Suggested Fix:** Configure real Stripe live key via build-time environment variable injection.
- **Affected Components:** `frontend/src/environments/environment.prod.ts`

---

### ISS-020: No SSL/TLS in Nginx Configuration
- **Severity:** HIGH
- **Category:** Security / Infrastructure
- **Description:** The nginx.conf only listens on port 80 (HTTP). No SSL/TLS configuration is present.
- **Expected Behavior:** All traffic should be served over HTTPS with SSL/TLS certificates.
- **Actual Behavior:** If Nginx config is used as-is, all traffic including JWTs, passwords, and PII is sent in plaintext.
- **Impact:** Man-in-the-middle attacks can intercept authentication tokens and personal data.
- **Suggested Fix:** Configure SSL via Let's Encrypt/Plesk. Add HTTP → HTTPS redirect. Set HSTS headers.
- **Affected Components:** `nginx.conf`

---

# MEDIUM (18 Issues)

### ISS-021: Password Requirements Too Weak
- **Severity:** MEDIUM
- **Category:** Security / Authentication
- **Description:** Minimum password length is 6 characters. No complexity requirements (uppercase, numbers, symbols).
- **Expected Behavior:** Minimum 8 characters with complexity requirements or NIST-compliant passphrase policy.
- **Actual Behavior:** `password: { minlength: 6 }` in User model.
- **Suggested Fix:** Increase minimum to 10 characters. Add complexity validation.
- **Affected Components:** `backend/models/User.js`

---

### ISS-022: APA Application Form Has No Save/Resume
- **Severity:** MEDIUM
- **Category:** UX / Business
- **Description:** The 5-section APA application form has no save-as-draft functionality. If a user navigates away, all entered data is lost.
- **Expected Behavior:** Form should auto-save progress. User should be able to resume incomplete applications.
- **Actual Behavior:** Form state is in-memory only. No draft persistence.
- **Impact:** User frustration. Abandoned applications. Lost recruits.
- **Suggested Fix:** Add auto-save to localStorage or server-side draft endpoint.
- **Affected Components:** `frontend/src/app/components/apply/apply.component.ts`

---

### ISS-023: Inconsistent API Response Format
- **Severity:** MEDIUM
- **Category:** Code Quality / Maintainability
- **Description:** Some endpoints use `sendResponse(res, 200, { data })` while others use raw `res.json({ success: true, data })`. Response shapes are inconsistent.
- **Expected Behavior:** All endpoints should use a consistent response envelope: `{ success: boolean, data: any, message?: string }`.
- **Actual Behavior:** Mixed response formats across route files.
- **Suggested Fix:** Audit all routes. Standardize on `sendResponse()` helper.
- **Affected Components:** All route files

---

### ISS-024: Folder Deletion Doesn't Cascade to Nested Subfolders
- **Severity:** MEDIUM
- **Category:** Business Logic / Data Integrity
- **Description:** Deleting a RHP Vault folder moves immediate children to the parent but does not cascade to deeply nested subfolders.
- **Expected Behavior:** All nested subfolders should be promoted to the deleted folder's parent.
- **Actual Behavior:** Only direct children are moved. Deeply nested folders may become orphaned.
- **Suggested Fix:** Implement recursive folder promotion or use a tree-walking algorithm.
- **Affected Components:** `backend/routes/document-hub.routes.js`

---

### ISS-025: RHP Vault Text Search Assumes Index Exists
- **Severity:** MEDIUM
- **Category:** Reliability / Database
- **Description:** RHP Vault file search uses MongoDB `$text` operator which requires a text index. If the index doesn't exist, the query throws an error.
- **Expected Behavior:** Search should work with or without text index, falling back to regex search.
- **Actual Behavior:** `$text: { $search: query }` fails with error if text index is missing.
- **Suggested Fix:** Add index creation to startup or use regex-based fallback.
- **Affected Components:** `backend/routes/document-hub.routes.js`

---

### ISS-026: No Log Rotation Configuration
- **Severity:** MEDIUM
- **Category:** Operations / Infrastructure
- **Description:** PM2 logs to `./logs/err.log` and `./logs/out.log` with no rotation. Log files will grow unbounded.
- **Expected Behavior:** Log rotation with size or time-based limits.
- **Actual Behavior:** Logs grow indefinitely until disk fills.
- **Suggested Fix:** Configure `pm2-logrotate` module or use system logrotate.
- **Affected Components:** `ecosystem.config.json`

---

### ISS-027: Promotion N+1 Query Pattern
- **Severity:** MEDIUM
- **Category:** Performance / Scalability
- **Description:** `getDownlineIds()` performs individual database queries for each node in the hierarchy tree (breadth-first traversal).
- **Expected Behavior:** Use MongoDB aggregation `$graphLookup` for recursive tree traversal in a single query.
- **Actual Behavior:** For an agent with 100 downline members, this executes 100+ separate queries.
- **Suggested Fix:** Use `$graphLookup` aggregation or cache hierarchy in a materialized path pattern.
- **Affected Components:** `backend/utils/helpers.js`, `backend/routes/promotion.routes.js`

---

### ISS-028: No Frontend Unit Tests
- **Severity:** MEDIUM
- **Category:** QA / Testing
- **Description:** Zero Angular unit tests exist. No Jasmine/Karma test files found for any component, service, or pipe.
- **Expected Behavior:** Critical components (auth guard, auth service, interceptors) should have unit tests.
- **Actual Behavior:** All testing relies on E2E Playwright tests.
- **Impact:** Any frontend refactoring is high risk. Regressions caught only by manual testing.
- **Suggested Fix:** Add unit tests for AuthGuard, AuthService, AuthInterceptor, and critical form components.
- **Affected Components:** `frontend/src/app/`

---

### ISS-029: Route Coverage Excluded from Test Reports
- **Severity:** MEDIUM
- **Category:** QA / Testing
- **Description:** Jest `collectCoverageFrom` only includes middleware, utils, and config. Route files are excluded from coverage reporting.
- **Expected Behavior:** All backend code should be included in coverage metrics.
- **Actual Behavior:** Routes (the largest code surface) have unknown coverage.
- **Suggested Fix:** Add `"routes/**/*.js"` to `collectCoverageFrom` in jest.config.json.
- **Affected Components:** `backend/jest.config.json`

---

### ISS-030: Admin Role Changes Don't Update Referral Code Prefix
- **Severity:** MEDIUM
- **Category:** Business Logic / Data Integrity
- **Description:** When a user's role is changed from agent to admin (or vice versa), their referral code prefix (AGT→ADM) is not updated.
- **Expected Behavior:** Referral code prefix should reflect current role.
- **Actual Behavior:** Original prefix persists. Could cause confusion in hierarchy display.
- **Suggested Fix:** Regenerate referral code on role change.
- **Affected Components:** `backend/routes/admin.routes.js`

---

### ISS-031: Licensing List Creates Synthetic Records
- **Severity:** MEDIUM
- **Category:** Business Logic / Data Integrity
- **Description:** When listing licensing progress for agents without records, the API creates synthetic (in-memory) records that are never persisted. Updates to these records would fail.
- **Expected Behavior:** Either create real records lazily or clearly indicate no record exists.
- **Actual Behavior:** Synthetic records returned in API response look identical to real records but have no database backing.
- **Suggested Fix:** Auto-create real records on first access, or return null with creation endpoint.
- **Affected Components:** `backend/routes/licensing.routes.js`

---

### ISS-032: No Global Error Boundary in Frontend
- **Severity:** MEDIUM
- **Category:** UX / Reliability
- **Description:** Angular application has no global `ErrorHandler` implementation. Unhandled errors may show blank screens.
- **Expected Behavior:** Custom ErrorHandler that logs errors, shows user-friendly message, and reports to error tracking service.
- **Actual Behavior:** Default Angular error handler logs to console only.
- **Suggested Fix:** Implement custom `ErrorHandler` class with Sentry/Rollbar integration.
- **Affected Components:** `frontend/src/app/app.module.ts`

---

### ISS-033: WebSocket Authentication Not Re-Validated
- **Severity:** MEDIUM
- **Category:** Security / Real-Time
- **Description:** Socket.IO validates JWT only on initial connection handshake. Token expiration is not re-checked during the session.
- **Expected Behavior:** Periodic token re-validation or disconnect on token expiry.
- **Actual Behavior:** Once connected, socket remains active even after JWT expires or user is deactivated.
- **Suggested Fix:** Add periodic auth check (middleware on each event) or connection timeout matching JWT expiry.
- **Affected Components:** `backend/server.js` (Socket.IO config)

---

### ISS-034: Monolithic Angular Module
- **Severity:** MEDIUM
- **Category:** Code Quality / Maintainability
- **Description:** All 70+ components are declared in a single `AppModule`. No lazy-loaded feature modules.
- **Expected Behavior:** Feature modules (admin, agent, onboarding, etc.) with lazy loading for better initial load time.
- **Actual Behavior:** Single module loads all components regardless of user role.
- **Impact:** Slow initial page load. Admin components loaded for agent users unnecessarily.
- **Suggested Fix:** Split into feature modules with lazy loading (Angular route-level lazy loading).
- **Affected Components:** `frontend/src/app/app.module.ts`

---

### ISS-035: No CI/CD Pipeline
- **Severity:** MEDIUM
- **Category:** DevOps / Automation
- **Description:** GitHub Actions workflow exists (`.github/workflows/deploy.yml`) but deployment is primarily manual via SSH scripts.
- **Expected Behavior:** Automated CI/CD: lint → test → build → deploy → health check.
- **Actual Behavior:** Manual `ssh` + `redeploy.sh` execution.
- **Suggested Fix:** Complete CI/CD pipeline with automated testing gate before deployment.
- **Affected Components:** `.github/workflows/`, `deploy.sh`, `redeploy.sh`

---

### ISS-036: File Storage on Local Disk
- **Severity:** MEDIUM
- **Category:** Scalability / Reliability
- **Description:** All uploaded files (documents, statements, images) are stored on the local server filesystem under `backend/uploads/`.
- **Expected Behavior:** Cloud storage (S3, Azure Blob, GCS) with CDN for file delivery.
- **Actual Behavior:** Local disk storage. No replication. Lost if server fails.
- **Suggested Fix:** Migrate to S3 with pre-signed URLs for secure access.
- **Affected Components:** All file upload routes, `backend/utils/storage.js`

---

### ISS-037: No API Rate Limiting on File Downloads
- **Severity:** MEDIUM
- **Category:** Security / Abuse
- **Description:** File download endpoints have no rate limiting. An authenticated user could download all files rapidly, creating a data exfiltration vector.
- **Expected Behavior:** Rate limit file downloads (e.g., 50/minute per user).
- **Actual Behavior:** Unlimited download rate.
- **Suggested Fix:** Add per-user rate limiting on download endpoints.
- **Affected Components:** `backend/routes/document-hub.routes.js`, `backend/routes/commission-statements.routes.js`

---

### ISS-038: Encryption Key Source Not Verified
- **Severity:** MEDIUM
- **Category:** Security / Configuration
- **Description:** The `ENCRYPTION_KEY` environment variable is used for AES-256-GCM encryption but there's no verification that it meets cryptographic requirements (256-bit random key).
- **Expected Behavior:** Validate key length (64 hex chars = 32 bytes) and entropy at startup.
- **Actual Behavior:** Key is used as-is. Weak or short keys could compromise encryption.
- **Suggested Fix:** Add startup validation: key must be exactly 64 hex characters. Generate key with `crypto.randomBytes(32).toString('hex')`.
- **Affected Components:** `backend/utils/encryption.js`

---

# LOW (12 Issues)

### ISS-039: No API Documentation (Swagger/OpenAPI)
- **Severity:** LOW
- **Category:** Documentation / Developer Experience
- **Description:** No API documentation exists. Over 100 endpoints are undocumented.
- **Suggested Fix:** Generate OpenAPI spec from route definitions. Add Swagger UI endpoint.

### ISS-040: No Accessibility Audit (WCAG)
- **Severity:** LOW
- **Category:** UX / Compliance
- **Description:** No accessibility testing performed. Forms may not be screen-reader compatible.
- **Suggested Fix:** Run axe-core audit. Add ARIA labels to interactive elements.

### ISS-041: No Loading States on Some Pages
- **Severity:** LOW
- **Category:** UX
- **Description:** Some pages show empty content while data loads rather than loading spinners.
- **Suggested Fix:** Add consistent loading state handling across all data-fetching components.

### ISS-042: Hardcoded 8-Level Promotion System
- **Severity:** LOW
- **Category:** Flexibility
- **Description:** The User model has a hardcoded enum for 8 promotion levels. Adding or removing levels requires code changes.
- **Suggested Fix:** Reference PromotionLevel model dynamically instead of hardcoded enum.

### ISS-043: No Pagination on Notification List
- **Severity:** LOW
- **Category:** Performance / UX
- **Description:** Notifications endpoint returns all notifications without pagination.
- **Suggested Fix:** Add skip/limit pagination with virtual scroll on frontend.

### ISS-044: Google Translate Integration is Client-Side Only
- **Severity:** LOW
- **Category:** Internationalization
- **Description:** i18n uses Google Translate widget which doesn't translate dynamic content well. No server-side translation.
- **Suggested Fix:** Implement proper i18n with Angular's built-in i18n or ngx-translate with translation files.

### ISS-045: No Dark Mode Support
- **Severity:** LOW
- **Category:** UX
- **Description:** No dark mode or theme customization. May cause eye strain for daily users.
- **Suggested Fix:** Add Bootstrap dark mode theme toggle.

### ISS-046: Bundle Size Not Optimized
- **Severity:** LOW
- **Category:** Performance
- **Description:** Max budget set to 100MB (warning and error both). Actual bundle size unknown but likely large due to monolithic module.
- **Suggested Fix:** Reduce budget to realistic thresholds (1MB initial, 5MB lazy). Split into lazy modules.

### ISS-047: Timezone Handling Inconsistencies
- **Severity:** LOW
- **Category:** Data Integrity
- **Description:** Server defaults to `America/New_York`. Users can set timezone preference but not all date displays respect it.
- **Suggested Fix:** Audit all date displays. Ensure AppDatePipe is used consistently.

### ISS-048: No Soft-Delete Recovery UI
- **Severity:** LOW
- **Category:** UX / Admin
- **Description:** Users can be soft-deleted but there's no admin UI to view or restore deleted users.
- **Suggested Fix:** Add "Deleted Users" tab in admin user management with restore functionality.

### ISS-049: Welcome Message Only Configurable for Text
- **Severity:** LOW
- **Category:** Feature Completeness
- **Description:** Welcome message supports text and image but not rich HTML or video content.
- **Suggested Fix:** Add rich text editor (Quill/TinyMCE) for welcome message configuration.

### ISS-050: No Printful Webhook Integration
- **Severity:** LOW
- **Category:** Integration
- **Description:** Business card orders sent to Printful but no webhook receives order status updates.
- **Suggested Fix:** Implement Printful webhook endpoint for order status tracking.

---

# ENHANCEMENTS (12 Items)

### ENH-001: Automated Commission Calculation Engine
- **Description:** Currently commissions are uploaded as PDFs manually. An automated calculation engine based on carrier factors and production data would add significant value.
- **Business Value:** Reduces admin workload. Ensures accuracy. Enables real-time commission visibility.

### ENH-002: Agent-to-Agent Messaging
- **Description:** No internal messaging between agents. Uplines can't communicate with downline directly through the platform.
- **Business Value:** Improves team communication. Reduces reliance on external messaging apps.

### ENH-003: License Expiration Auto-Alerts
- **Description:** No automated reminders when agent licenses are approaching expiration.
- **Business Value:** Compliance risk reduction. Prevents agents from operating with expired licenses.

### ENH-004: Dashboard Revenue Analytics
- **Description:** No MRR, churn rate, or subscription analytics dashboard for admin.
- **Business Value:** Critical for business decision-making and investor reporting.

### ENH-005: Onboarding Funnel Analytics
- **Description:** No tracking of application → payment → onboarding → activation conversion rates.
- **Business Value:** Identifies bottlenecks in recruitment pipeline.

### ENH-006: Granular Admin Roles
- **Description:** All admins have identical full access. No read-only, auditor, or team-admin roles.
- **Business Value:** Supports organizational growth. Enables delegation without full access.

### ENH-007: Mobile PWA Support
- **Description:** Application uses Bootstrap responsive but is not a Progressive Web App.
- **Business Value:** Better mobile experience for field agents. Offline capability for training materials.

### ENH-008: Automated Compliance Reporting
- **Description:** No automated generation of compliance reports (licensing status, pending documents, overdue items).
- **Business Value:** Reduces compliance audit preparation time. Ensures regulatory readiness.

### ENH-009: Bulk Operations for Admin
- **Description:** No bulk approve/reject for onboarding documents, production submissions, or user management.
- **Business Value:** Dramatically reduces admin workload at scale.

### ENH-010: Redis Caching Layer
- **Description:** No caching layer for frequently accessed data (promotion calculations, hierarchy lookups, carrier lists).
- **Business Value:** Improved response times. Reduced database load. Better scalability.

### ENH-011: Webhook Retry Queue
- **Description:** Webhook failures (DocuSign, Stripe) are not retried. Failed webhooks are lost.
- **Business Value:** Ensures payment and signing events are never missed.

### ENH-012: API Versioning
- **Description:** No API versioning strategy. Breaking changes affect all consumers simultaneously.
- **Business Value:** Enables gradual migration. Supports multiple client versions.
