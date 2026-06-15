# RHP Office — Business Rules Discovered
**Audit Date:** June 13, 2026  
**Method:** Inferred from source code analysis (no specification documents provided)

---

## Legend
- **Confidence:** HIGH (explicit in code) | MEDIUM (inferred from patterns) | LOW (assumed from partial evidence)
- **Evidence:** File paths and code references supporting the rule

---

## 1. RECRUITMENT & APPLICATION (APA)

### BR-001: Referral Code Generates Parent-Child Hierarchy
- **Rule:** Every new agent must use a referral code during APA application. The referral code maps to an existing user, establishing a `referredBy` relationship (parent-child hierarchy).
- **Rationale:** MLM/network marketing hierarchy is the core organizational structure. Upline receives credit for downline production.
- **Evidence:** `backend/routes/apa.routes.js` — validates `referralCode` → finds parent user → sets `referredBy` on new user. `backend/models/User.js` — `referredBy: { type: Schema.Types.ObjectId, ref: 'User' }`.
- **Risk if Missing:** Orphaned agents with no upline. Broken promotion calculations. Missing commission hierarchy.
- **Confidence:** HIGH

### BR-002: Referral Code Format Encodes Role
- **Rule:** Referral codes follow the format `{PREFIX}{RANDOM}` where `AGT` = Agent, `ADM` = Admin.
- **Rationale:** Distinguishes referral source role. May affect hierarchy placement or permissions.
- **Evidence:** `backend/routes/auth.routes.js` — generates `AGT` prefix for agent role, `ADM` for admin.
- **Risk if Missing:** Role confusion. Incorrect hierarchy assignment.
- **Confidence:** HIGH

### BR-003: APA Application Follows a Fixed Lifecycle
- **Rule:** Application states: `draft` → `pending_review` → `pending_docusign` → `pending_payment` → `approved`/`rejected`. Each state requires specific trigger events.
- **Rationale:** Multi-step compliance process: data collection → admin review → legal signature → payment.
- **Evidence:** `backend/models/APAApplication.js` — status enum. `backend/routes/apa.routes.js` — state transition logic in review, DocuSign webhook, and payment routes.
- **Risk if Missing:** Applications stuck in limbo. Agents skip required steps. Revenue lost.
- **Confidence:** HIGH

### BR-004: DocuSign Signature Required Before Payment
- **Rule:** The APA agreement must be signed via DocuSign before the agent is prompted to pay. DocuSign webhook sets status to `pending_payment`.
- **Rationale:** Legal agreement must be executed before financial transaction.
- **Evidence:** `backend/routes/apa.routes.js` — DocuSign webhook handler transitions to `pending_payment` on `envelope-completed`.
- **Risk if Missing:** Agents pay without signing legal agreement. Unenforceable contracts.
- **Confidence:** HIGH

### BR-005: New Users Get Unique Account Creation
- **Rule:** Upon APA approval, a new User record is created with the applicant's info. A welcome email with temporary password is sent.
- **Rationale:** Separates application data from user account. Only approved applicants become users.
- **Evidence:** `backend/routes/apa.routes.js` — approval handler creates User, generates password, sends email via template `01-welcome-with-password.html`.
- **Risk if Missing:** No user account created. Approved applicants cannot login.
- **Confidence:** HIGH

---

## 2. PROMOTION SYSTEM

### BR-006: Two Promotion Tracks — Producer and Builder
- **Rule:** Agents can be promoted via either track: **Producer** (individual production) or **Builder** (team production + minimum agent count).
- **Rationale:** Rewards both high-producing individuals and those who build successful teams.
- **Evidence:** `backend/routes/promotion.routes.js` — checks `producerTrack` and `builderTrack` in PromotionLevel model. Separate eligibility logic for each.
- **Risk if Missing:** Agents locked into single promotion path. Unfair advancement criteria.
- **Confidence:** HIGH

### BR-007: Only Qualifying Product Categories Count
- **Rule:** Only production in categories flagged as `qualifiesForPromotion: true` counts toward promotion thresholds. Based on database configuration, qualifying categories include: Life Insurance, Supplemental Insurance, and Retirement products.
- **Rationale:** Not all insurance products contribute equally to business value. Health and P&C may have different compensation structures.
- **Evidence:** `backend/routes/promotion.routes.js` — filters ProductType where `qualifiesForPromotion === true`. Joins with production submissions on productType.
- **Risk if Missing:** All product types count equally. Gaming the system with low-value products to hit thresholds.
- **Confidence:** HIGH

### BR-008: Only "In Force" Status Counts
- **Rule:** Only production submissions with `status === 'In Force'` contribute to promotion premium calculations.
- **Rationale:** Prevents agents from claiming credit for cancelled, pending, or declined policies.
- **Evidence:** `backend/routes/promotion.routes.js` — aggregation pipeline filters `{ status: 'In Force' }`.
- **Risk if Missing:** Agents promoted based on applications that never became active policies.
- **Confidence:** HIGH

### BR-009: 50% Leg Cap on Builder Track
- **Rule:** No single downline leg (direct report's tree) can contribute more than 50% of the total team premium for builder track promotion.
- **Rationale:** Prevents "loaded leg" scenario where one strong downline agent carries the entire team qualification.
- **Evidence:** `backend/routes/promotion.routes.js` — calculates per-leg premium totals and applies 50% cap.
- **Risk if Missing:** Single-leg teams qualify unfairly. Incentive misalignment for building balanced organizations.
- **Confidence:** HIGH

### BR-010: 1.4x Fast-Track Skip Promotion
- **Rule:** If an agent's qualifying premium exceeds 1.4x (140%) of the next level's threshold, they are eligible to skip one promotion level.
- **Rationale:** Rewards exceptional performers with accelerated advancement.
- **Evidence:** `backend/routes/promotion.routes.js` — `skipMultiplier: 1.4` used in eligibility calculation. Checks if premium ≥ `nextLevel.threshold * 1.4`.
- **Risk if Missing:** High performers cannot skip levels. Reduced incentive for exceptional production.
- **Confidence:** HIGH

### BR-011: Rolling Window for Promotion Calculation
- **Rule:** Promotion eligibility uses a rolling time window. The window starts from `user.promotedAt` (date of last promotion) or falls back to `windowDays` configuration from the PromotionLevel. Production outside this window is excluded.
- **Rationale:** Ensures ongoing performance rather than one-time historical accumulation.
- **Evidence:** `backend/routes/promotion.routes.js` — `startDate = user.promotedAt || new Date(now - windowDays * 24 * 60 * 60 * 1000)`.
- **Risk if Missing:** Lifetime accumulation removes urgency. Agents promoted based on years-old production.
- **Confidence:** HIGH

### BR-012: Promotion Level Hierarchy is Ordered
- **Rule:** 8 promotion levels exist in a fixed order defined by the `order` field on PromotionLevel. An agent's current level determines their next target level.
- **Rationale:** Structured career progression. Clear advancement path.
- **Evidence:** `backend/models/User.js` — `promotionLevel` enum with 8 values. `backend/models/PromotionLevel.js` — `order` field.
- **Risk if Missing:** Ambiguous advancement. Agents could skip or repeat levels incorrectly.
- **Confidence:** HIGH

### BR-013: Admin Notified of Promotion Eligibility (Once)
- **Rule:** When an agent becomes eligible for promotion, an in-app notification is sent to admin. Deduplication prevents repeat notifications for the same agent/level combination.
- **Rationale:** Admin must manually approve promotions. Prevents notification spam.
- **Evidence:** `backend/routes/promotion.routes.js` — checks existing notifications before creating new one.
- **Risk if Missing:** Admin misses eligible agents, or is overwhelmed by duplicate notifications.
- **Confidence:** HIGH

---

## 3. PAYMENT & SUBSCRIPTION

### BR-014: Two Payment Types — Subscription and One-Time
- **Rule:** The platform supports both recurring Stripe subscriptions and one-time payments (for APA application fee).
- **Rationale:** Application fee is a one-time cost. Platform access requires ongoing subscription.
- **Evidence:** `backend/routes/payment.routes.js` — separate endpoints for `create-subscription` and `create-one-time-payment`. `backend/utils/stripe.js` — both payment intent and subscription creation methods.
- **Risk if Missing:** Revenue model broken. Cannot charge for both application and ongoing access.
- **Confidence:** HIGH

### BR-015: Billing-Exempt Users Skip Payment
- **Rule:** Users with `billingExempt: true` bypass all payment checks. They access the platform without a subscription.
- **Rationale:** Admins and special users (founders, partners) should not need to pay.
- **Evidence:** `backend/middleware/payment.middleware.js` — checks `user.billingExempt` before enforcing payment. Note: currently ALL payment enforcement is disabled.
- **Risk if Missing:** Admins charged for platform they manage. Special arrangement users blocked.
- **Confidence:** HIGH

### BR-016: Coupon Validation Rules
- **Rule:** Coupons have multiple validation criteria: (a) not expired, (b) usage count below max, (c) user hasn't already used it. All three must pass for discount to apply.
- **Rationale:** Prevents coupon abuse and ensures promotional budgets are controlled.
- **Evidence:** `backend/routes/coupon.routes.js` and `backend/routes/payment.routes.js` — validation checks on coupon application.
- **Risk if Missing:** Unlimited coupon reuse. Revenue loss from uncontrolled discounts.
- **Confidence:** HIGH

### BR-017: Payment Enforcement Currently Disabled
- **Rule:** As of audit date, `requirePayment()` and `requireOneTimePayment()` middleware both call `next()` immediately without checking payment status. All payment enforcement is bypassed.
- **Rationale:** Likely disabled during development/testing. Must be re-enabled for production.
- **Evidence:** `backend/middleware/payment.middleware.js` — functions contain only `return next()`.
- **Risk if Missing:** N/A — this IS the risk. All agents access platform for free.
- **Confidence:** HIGH

---

## 4. ONBOARDING

### BR-018: Multi-Step Onboarding Process
- **Rule:** After account creation, agents complete onboarding by uploading required documents (e.g., ID, E&O insurance, background check consent) and completing profile sections. Each step can be independently approved/rejected by admin.
- **Rationale:** Compliance and licensing requirements for insurance agents.
- **Evidence:** `backend/models/Onboarding.js` — `steps[]` array with individual status tracking. `backend/routes/onboarding.routes.js` — per-step approval endpoints.
- **Risk if Missing:** Agents operate without required compliance documents. Regulatory violation.
- **Confidence:** HIGH

### BR-019: Dynamic Onboarding Document Types
- **Rule:** Required onboarding document types are configurable via `OnboardingDocType` model. Admin can add/remove required document categories without code changes.
- **Rationale:** Different states/carriers may require different documents.
- **Evidence:** `backend/models/OnboardingDocType.js` — configurable document types. `backend/routes/onboarding-hub.routes.js` — references dynamic doc types.
- **Risk if Missing:** Hardcoded requirements. Cannot adapt to regulatory changes without deploy.
- **Confidence:** HIGH

### BR-020: Onboarding Progress is Percentage-Based
- **Rule:** Overall onboarding progress is calculated as percentage of approved steps vs total required steps.
- **Rationale:** Provides visual progress indicator for both agent and admin dashboards.
- **Evidence:** `backend/routes/onboarding.routes.js` — calculates `completedCount / totalCount * 100`.
- **Risk if Missing:** No progress visibility. Admin cannot prioritize incomplete onboardings.
- **Confidence:** MEDIUM

---

## 5. RHP Vault

### BR-021: Three-Tier File Visibility
- **Rule:** Files uploaded to RHP Vault have one of three visibility levels: `all` (everyone), `admin` (admins only), `restricted` (specific agents listed in `visibleToAgents` array).
- **Rationale:** Different documents serve different audiences: public resources vs admin-only vs individual agent documents.
- **Evidence:** `backend/routes/document-hub.routes.js` — visibility filtering in GET endpoints. `backend/models/DocumentHubFile.js` — `visibility` field with `visibleToAgents` array.
- **Risk if Missing:** All documents visible to all users. Confidential admin documents exposed.
- **Confidence:** HIGH

### BR-022: Nested Folder Hierarchy with Drag-Drop Reordering
- **Rule:** RHP Vault supports arbitrary folder nesting via `parentFolder` reference. Folders and files have `sortOrder` for custom ordering within a folder.
- **Rationale:** Organizes large document collections. Drag-drop provides intuitive management.
- **Evidence:** `backend/models/DocumentFolder.js` — `parentFolder` self-reference. `backend/routes/document-hub.routes.js` — `PATCH /reorder` endpoint.
- **Risk if Missing:** Flat folder structure only. Poor organization for large document collections.
- **Confidence:** HIGH

### BR-023: Document Request Workflow
- **Rule:** Admin creates a document request → agents receive notification → agents upload response → admin reviews → admin approves/rejects. Approved responses can be published to the hub.
- **Rationale:** Structured process for collecting required documents from agents (compliance, certifications, etc.).
- **Evidence:** `backend/routes/document-hub.routes.js` — full request lifecycle endpoints. `backend/models/DocumentRequest.js` — status tracking.
- **Risk if Missing:** No structured way to collect documents from agents. Relies on email/chat.
- **Confidence:** HIGH

---

## 6. BROADCAST SYSTEM

### BR-024: Broadcasts Filtered by Agent Creation Date
- **Rule:** An agent only sees broadcasts created AFTER their account creation date. Historical broadcasts are not shown to new agents.
- **Rationale:** Prevents new agents from being overwhelmed with outdated announcements.
- **Evidence:** `backend/routes/broadcast.routes.js` — filters `{ createdAt: { $gte: user.createdAt } }`.
- **Risk if Missing:** New agents see months/years of old announcements. Confusion and information overload.
- **Confidence:** HIGH

### BR-025: One-at-a-Time Popup Display
- **Rule:** Multiple unread broadcasts are displayed as sequential popups. When user acknowledges one, the next appears.
- **Rationale:** Ensures each announcement is seen. Prevents stacking multiple overlapping modals.
- **Evidence:** Frontend broadcast popup component — loops through unread broadcasts, shows one at a time.
- **Risk if Missing:** Multiple overlapping modals. Users close all without reading.
- **Confidence:** MEDIUM

### BR-026: Email Notification Respects User Preferences
- **Rule:** Broadcast email notifications check user's `NotificationPreference` for the `broadcasts` category. Users who muted broadcasts don't receive emails.
- **Rationale:** User control over notification volume. Prevents email fatigue.
- **Evidence:** `backend/routes/broadcast.routes.js` — looks up NotificationPreference before sending email.
- **Risk if Missing:** Users receive unwanted emails. No way to opt out. CAN-SPAM compliance risk.
- **Confidence:** HIGH

### BR-027: Email Rate Limiting — 4 per 61 Seconds
- **Rule:** Broadcast email sending is rate-limited to 4 emails per batch, with a 61-second pause between batches (to comply with Neuzmail API rate limit of 5/60s).
- **Rationale:** Email provider rate limit compliance. Prevents API throttling or account suspension.
- **Evidence:** `backend/routes/broadcast.routes.js` — `BATCH_SIZE = 4`, `await sleep(61000)` between batches.
- **Risk if Missing:** Email API rate limit exceeded. Emails rejected. Provider account suspended.
- **Confidence:** HIGH

---

## 7. COMMISSION STATEMENTS

### BR-028: Commission Statements Are PDF Uploads Only
- **Rule:** Admin uploads commission PDFs per agent per carrier per pay period. No automated commission calculation exists.
- **Rationale:** Commissions come from multiple carriers in different formats. Manual upload accommodates varied carrier reporting.
- **Evidence:** `backend/routes/commission-statements.routes.js` — upload endpoint accepts PDF file, carrier, and payPeriod.
- **Risk if Missing:** N/A — this is the current design. Enhancement ENH-001 proposes automation.
- **Confidence:** HIGH

### BR-029: Agents See Only Their Own Statements
- **Rule:** Commission statement GET endpoint filters by `req.user._id` for agent role. Admin sees all.
- **Rationale:** Commission data is confidential per agent.
- **Evidence:** `backend/routes/commission-statements.routes.js` — role-based filtering.
- **Risk if Missing:** Agents see each other's commission data. Privacy violation.
- **Confidence:** HIGH

---

## 8. CARRIER MANAGEMENT

### BR-030: Agent-Carrier Status Tracking
- **Rule:** Each agent has a per-carrier status tracked via `AgentCarrierStatus` model (e.g., `not_started`, `in_progress`, `appointed`, `terminated`). Admin manages these statuses.
- **Rationale:** Insurance agents must be appointed with each carrier separately. Status tracking ensures compliance.
- **Evidence:** `backend/models/AgentCarrierStatus.js` — status enum. `backend/routes/carriers.routes.js` — status update endpoints.
- **Risk if Missing:** No tracking of which agents are appointed with which carriers. Compliance risk.
- **Confidence:** HIGH

### BR-031: Carriers Can Be Active or Inactive
- **Rule:** Carriers have an `isActive` flag. Inactive carriers are hidden from agent views but retained for historical records.
- **Rationale:** Carriers may be discontinued but historical production records reference them.
- **Evidence:** `backend/models/Carrier.js` — `isActive` field. Route filtering by active status.
- **Risk if Missing:** Discontinued carriers still show in agent selection. Confusion.
- **Confidence:** HIGH

---

## 9. LICENSING & EXAMFX

### BR-032: Licensing Progress Per State
- **Rule:** Agent licensing progress is tracked per state. Each state has a status (not_started, in_progress, licensed, expired).
- **Rationale:** Insurance licensing is state-specific. Agents may be licensed in multiple states.
- **Evidence:** `backend/models/LicensingProgress.js` — state + status fields.
- **Risk if Missing:** No per-state tracking. Agents may sell in unlicensed states.
- **Confidence:** HIGH

### BR-033: ExamFX Integration for Exam Prep
- **Rule:** The platform integrates with ExamFX for insurance exam preparation tracking. Admin can bulk-import ExamFX enrollment data via CSV upload.
- **Rationale:** Centralizes exam preparation tracking within the platform.
- **Evidence:** `backend/utils/examfx.service.js` — API integration. `backend/routes/examfx.routes.js` — CSV upload endpoint.
- **Risk if Missing:** No visibility into exam preparation progress. Manual tracking required.
- **Confidence:** HIGH

---

## 10. USER MANAGEMENT

### BR-034: Soft Delete — Deactivation, Not Removal
- **Rule:** Users are never hard-deleted. The `DELETE` endpoint sets `isActive: false` and `isDeleted: true`. All related records are retained.
- **Rationale:** Preserves audit trail. Enables potential reactivation. Maintains referral hierarchy integrity.
- **Evidence:** `backend/routes/admin.routes.js` — delete handler sets flags instead of removing document.
- **Risk if Missing:** Hard delete breaks referral chains. Lost audit history. GDPR right-to-erasure conflict.
- **Confidence:** HIGH

### BR-035: Admin Can Impersonate Agent View
- **Rule:** Admin has a "view as agent" capability to see the platform from an agent's perspective.
- **Rationale:** Support and debugging. Understanding agent experience without separate test accounts.
- **Evidence:** Frontend admin components — agent view toggle logic.
- **Risk if Missing:** Admin cannot troubleshoot agent-reported issues effectively.
- **Confidence:** MEDIUM

### BR-036: Maintenance Mode Blocks Agents Only
- **Rule:** When `SystemConfig.maintenanceMode === true`, agent users see a maintenance page. Admin users still have full access.
- **Rationale:** Allows admin to perform maintenance tasks while preventing agent activity.
- **Evidence:** `backend/middleware/auth.middleware.js` — maintenance mode check. Skips for admin role.
- **Risk if Missing:** Either everyone is locked out (including admin) or no one is (defeating the purpose).
- **Confidence:** HIGH

### BR-037: Profile Timezone Preference
- **Rule:** Users can set a timezone preference (default: `America/New_York`). Date displays should use this timezone.
- **Rationale:** Agents may be in different time zones across the US.
- **Evidence:** `backend/models/User.js` — `timezone` field. Frontend `AppDatePipe`.
- **Risk if Missing:** All dates shown in server timezone. Confusion for agents in different zones.
- **Confidence:** MEDIUM

---

## 11. AUDIT & COMPLIANCE

### BR-038: All Admin Actions Logged to Audit Trail
- **Rule:** The audit middleware logs admin actions including: action type, target entity, user ID, IP address, and timestamp. Sensitive fields (password, SSN, token) are redacted.
- **Rationale:** Compliance requirement. Accountability for administrative changes.
- **Evidence:** `backend/middleware/audit.middleware.js` — creates `AuditLog` entries. Redacts sensitive fields.
- **Risk if Missing:** No accountability for admin actions. Cannot investigate unauthorized changes.
- **Confidence:** HIGH

### BR-039: Notification Preferences Are Per-Category
- **Rule:** Users can configure notification preferences per category (broadcasts, documents, production, etc.). Each category can be independently muted for email and/or in-app notifications.
- **Rationale:** Granular control prevents notification fatigue while keeping critical alerts active.
- **Evidence:** `backend/models/NotificationPreference.js` — per-category settings. Broadcast and notification routes check preferences before sending.
- **Risk if Missing:** All-or-nothing notifications. Users mute everything or receive everything.
- **Confidence:** HIGH

---

## 12. TRAINING

### BR-040: Training Materials Organized in Folders
- **Rule:** Training content is organized in a folder hierarchy (`TrainingFolder`) containing materials (`TrainingMaterial`). Materials can be files (PDF, video) or links.
- **Rationale:** Structured training curriculum for agent onboarding and continuing education.
- **Evidence:** `backend/models/TrainingFolder.js`, `backend/models/TrainingMaterial.js`. `backend/routes/training.routes.js`.
- **Risk if Missing:** Unstructured training content. Difficult to find relevant materials.
- **Confidence:** HIGH

---

## 13. ACA (Affordable Care Act) MODULE

### BR-041: ACA Client Records with Tier Configurations
- **Rule:** A separate module tracks ACA (Affordable Care Act) client records and tier configurations. This appears to be an additional product vertical.
- **Rationale:** Insurance agencies handling ACA enrollment need client tracking and tier-based pricing.
- **Evidence:** `backend/models/ACAClientRecord.js`, `backend/models/AcaTierConfig.js`. `backend/routes/aca.routes.js`.
- **Risk if Missing:** Cannot service ACA enrollment clients. Lost revenue stream.
- **Confidence:** MEDIUM

---

## SUMMARY

| Category | Rules Documented | Confidence Distribution |
|----------|-----------------|------------------------|
| Recruitment & APA | 5 | 5 HIGH |
| Promotion System | 8 | 8 HIGH |
| Payment & Subscription | 4 | 4 HIGH |
| Onboarding | 3 | 2 HIGH, 1 MEDIUM |
| RHP Vault | 3 | 3 HIGH |
| Broadcast System | 4 | 3 HIGH, 1 MEDIUM |
| Commission Statements | 2 | 2 HIGH |
| Carrier Management | 2 | 2 HIGH |
| Licensing & ExamFX | 2 | 2 HIGH |
| User Management | 4 | 2 HIGH, 2 MEDIUM |
| Audit & Compliance | 2 | 2 HIGH |
| Training | 1 | 1 HIGH |
| ACA Module | 1 | 1 MEDIUM |
| **TOTAL** | **41** | **36 HIGH, 5 MEDIUM** |

---

## CRITICAL UNVERIFIED ASSUMPTIONS

These business rules could NOT be confirmed from code alone and require stakeholder validation:

1. **Commission Split Rules** — No code defines how commissions are split between upline/downline. Is this handled outside the platform?
2. **Licensing Renewal Deadlines** — No automated tracking of license expiration or CE credit deadlines.
3. **E&O Insurance Requirements** — Is E&O insurance verified during onboarding? No validation found.
4. **State-Specific Compliance** — No state-specific business rules detected. Are all states treated identically?
5. **Contract Hierarchy vs Referral Hierarchy** — Are they always the same? Can an agent be transferred to a different upline without changing referral code?
6. **Promotion Demotion** — No demotion logic exists. Can agents be demoted for sustained underperformance?
7. **Maximum Team Size** — No limits on how many direct reports one agent can have.
8. **Charge-Back Handling** — What happens to promotion credit when an "In Force" policy is later cancelled?
