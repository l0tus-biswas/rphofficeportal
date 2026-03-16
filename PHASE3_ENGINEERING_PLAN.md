# Phase 3 — Engineering Requirements & Development Plan
**Date:** March 6, 2026  
**Source:** Client Discovery Call Transcript  
**Scope:** Dashboard Promotion Tracking, Carrier Management, ACA Tracker, Onboarding Hub, Commission Tab, Training & Notifications

---

## 1. Feature / Requirement Summary

The client wants to extend the RHP Office agent portal with the following major capabilities:

1. **Dual Promotion Progress Tracker** (Producer + Builder arrows) on the dashboard — visual progress bars showing agents how close they are to their next promotion tier.
2. **ACA Client Volume Tracker** — a separate dashboard widget tracking team-wide health insurance client counts against bonus tiers.
3. **Carrier Management Overhaul** — carriers split into three product categories with per-carrier fields (factor %, instructions, status, link, "What to Expect").
4. **Onboarding Document Hub** — a structured document section replacing the current onboarding tab where agents upload/access compliance documents.
5. **Commission Statements Tab** — admin-uploaded PDF statements agents can view, filtered by carrier and date.
6. **Dashboard Next-Steps Checklist** — contextual task list for new/unlicensed agents on login.
7. **Product Management Admin UI** — ability to add/edit product types without developer intervention.
8. **Production Submission Enhancements** — status dropdown on new submission, CSV export of production data.
9. **Transactional Email Service Setup** — configure a professional email and notification system.
10. **ExamFX API Integration** — display licensing study progress from ExamFX inside the licensing tab.
11. **Upline Visibility Rules** — recruiters can see their direct and indirect downline production data.
12. **QuickBooks Contractor Integration** — link or embed W-9 / direct deposit contractor onboarding.

---

## 2. Business Problem

- Agents have no visual, real-time feedback on where they stand relative to their next promotion — leading to low motivation and unclear expectations.
- The admin cannot modify product types or carrier categories without developer changes — slowing operations.
- Commission statements are not in the portal, forcing agents to look elsewhere for pay information.
- Onboarding documents are scattered and not easily accessible/uploadable by agents or uplines.
- Unlicensed agents have no clear action steps after joining, causing drop-off before they become active.
- Production data cannot be exported for reporting by the admin.
- No professional transactional email is configured, so system emails appear from a personal address.

---

## 3. Functional Requirements

### 3.1 Dashboard — Promotion Progress Tracker

| # | Requirement |
|---|-------------|
| FR-01 | Display two visual progress bars ("arrows") on the agent dashboard — one for the **Producer Track** and one for the **Builder Track**. |
| FR-02 | Producer Track bar tracks only **Life Insurance and Supplemental** policies with status **In Force**. Medicare Advantage and ACA are excluded. |
| FR-03 | Builder Track bar tracks two dimensions: (a) **active producing agents** on the team — defined as agents who have logged at least one **In Force** production entry within the selected time window, and (b) **total In Force premium** from the team within the time window. |
| FR-04 | Both bars display: current value (X), target value for next promotion (Y), current promotion level label, and next promotion level label. |
| FR-05 | A rolling time-frame dropdown is available on both bars: **1, 2, 3, 4, 5, 6 months** (30-day increments, max 12 months). Default is **30 days**. This default is stored per promotion level. |
| FR-06 | The time window is rolling (last N days from today), not calendar-month fixed. |
| FR-07 | The promotion level hierarchy is (bottom → top): Associate → Senior Associate → Manager → Senior Manager → Division Executive → National Executive. |
| FR-08 | Admin can configure the required thresholds (premium amount, agent count, time window) for each promotion level via an admin panel. |
| FR-09 | When an agent meets all thresholds for the next level, notify the admin via an in-app notification. |
| FR-10 | The tracker section appears at the **top** of the agent dashboard, above existing dashboard content. |

### 3.2 Dashboard — ACA Client Volume Tracker

| # | Requirement |
|---|-------------|
| FR-11 | Display a third tracker widget below the promotion bars for **ACA (Health Insurance) client count**. |
| FR-12 | Count includes the agent's own clients **plus all downline agents' clients** (full team). |
| FR-13 | Bonus tiers and incentive display: 1,000 clients → +$1/client/month ($1,000/mo extra); 2,000 clients → +$2/client/month ($4,000/mo extra); 3,000+ clients → +$3/client/month ($9,000/mo extra). |
| FR-14 | Widget shows current count, next tier threshold, and the monthly bonus amount if they hit the next tier. |
| FR-15 | Display disclaimer: *"Subject to monthly verification by carrier."* |
| FR-16 | Admin can upload a CSV file mapping agent names/IDs to their ACA client counts. The system reads this file and updates each agent's displayed count accordingly. |

### 3.3 Production Submission Enhancements

| # | Requirement |
|---|-------------|
| FR-17 | Add a **Status** dropdown field to the New Production Submission form with values: Submitted, Pending, In Force, Lapsed, Cancelled. |
| FR-18 | Only production entries with status **In Force** count toward dashboard promotion and ACA trackers. |
| FR-19 | ACA (health insurance) and Medicare Advantage products are excluded from promotion bar calculations but can still be submitted and tracked. |
| FR-20 | Admin and agents can update the status of a production submission via the existing edit (pencil) action. |
| FR-21 | Add a **CSV Export** button to the production tab allowing download of filtered production data (agent, client, product, carrier, amount, status, date). |

### 3.4 Product Management (Admin)

| # | Requirement |
|---|-------------|
| FR-22 | Admin can add, edit, and deactivate product types via the admin panel (similar to existing Carrier Management). |
| FR-23 | Each product belongs to a **product category**: Life & Supplemental, ACA, or Medicare. |
| FR-24 | The product type dropdown in production submissions is populated dynamically from this list. |

### 3.5 Carrier Management Overhaul

| # | Requirement |
|---|-------------|
| FR-25 | The Carrier tab presents **three sections/tabs**: Life & Supplemental, ACA, Medicare. Agents toggle between them. |
| FR-26 | Each carrier entry includes: Carrier Name, Product Category, Agent Status (Requested Contract / Appointed), Date Requested (auto-set), Notes, **Factor %** (commission percentage, admin-editable), Contracting Instructions or Link, "What to Expect" free-text block. |
| FR-27 | Admin can add/edit all carrier fields, instructions, and links per category from the admin panel. |
| FR-28 | Agent-facing view shows carrier name, their status with that carrier, the factor %, contracting link/instructions, and "What to Expect" section. |
| FR-29 | Agent can request a contract (changes their status to "Requested Contract") and admin can mark them as "Appointed." |

### 3.6 Onboarding Document Hub

| # | Requirement |
|---|-------------|
| FR-30 | Replace/augment the current onboarding tab with a structured document hub displaying document cards. |
| FR-31 | Default document cards include: APA Agreement, CMS Certificate, E&O Insurance, W-9, Direct Deposit. Admin can add more document types from the admin panel. |
| FR-32 | **APA Agreement**: display as a read-only link/PDF viewer (the signed DocuSign document). Agents cannot delete or edit it. |
| FR-33 | All other documents have **Upload** and **Download** capability. Both the agent themselves and their upline can upload. Only the agent or admin can delete. |
| FR-34 | Admin can configure which document types exist, their names, and whether they are required. |

### 3.7 Dashboard — Next Steps Checklist

| # | Requirement |
|---|-------------|
| FR-35 | Display a "Next Steps" checklist widget on the agent dashboard. |
| FR-36 | For **unlicensed** agents: show steps focused on licensing (e.g., "Get licensed," "Study on ExamFX"). |
| FR-37 | For **licensed** agents: show remaining onboarding steps (Upload W-9, Upload Direct Deposit, Upload E&O, Upload CMS Certificate, Request Carrier Appointments). |
| FR-38 | Checklist items are marked complete automatically when the corresponding document/action is completed. |
| FR-39 | Include a visual progress bar showing overall onboarding completion percentage. |

### 3.8 Commission Statements Tab

| # | Requirement |
|---|-------------|
| FR-40 | Add a **Commissions** tab to the agent portal. |
| FR-41 | Admin uploads PDF commission statements for one or more agents, tagging each with: carrier name, week/pay date, and target agent(s). |
| FR-42 | Agent sees only their own commission statements, filterable by carrier and date/period. Each statement is a clickable link that opens the PDF. |
| FR-43 | UI resembles a bank statement list: date, carrier, link to PDF. |

### 3.9 Upline Visibility Rules

| # | Requirement |
|---|-------------|
| FR-44 | An upline (recruiter) can always view their direct and indirect downline agents' production data — **regardless of whether they reach the same commission level**. |
| FR-45 | Visible data for downline agents: premium produced, recruit count, promotion level. **Client names and personal details are NOT visible** to uplines. |
| FR-46 | Upline can pull a team production report for any rolling time window — showing total premium, number of active agents, and number of recruits. |

### 3.10 Training Tab

| # | Requirement |
|---|-------------|
| FR-47 | Training categories are admin-editable (add/rename/remove). |
| FR-48 | Each training material entry supports: title, category, video link (Loom or YouTube embed via iframe), and attached PDF. |
| FR-49 | Videos are embedded/played inside the platform using the provided URL. |
| FR-50 | Add a missing icon to the Training Management item in the admin navigation to match other nav items. |

### 3.11 Transactional Email & Notifications

| # | Requirement |
|---|-------------|
| FR-51 | Set up a transactional email service (SendGrid or Brevo/Mailchimp). |
| FR-52 | Create the mailbox **contracting@rhpoffice.com** via Hostinger. |
| FR-53 | All system-generated emails are sent from `contracting@rhpoffice.com`. |
| FR-54 | Send daily email notification to **unlicensed agents** showing remaining days in their licensing countdown. |
| FR-55 | Send in-app notification to admin when an agent's production meets a promotion threshold. |

### 3.12 QuickBooks Contractor Integration

| # | Requirement |
|---|-------------|
| FR-56 | Provide a link or embedded flow on the Next Steps checklist so agents can submit their W-9 and direct deposit information. |
| FR-57 | New contractor submissions should appear in the admin's QuickBooks account automatically or via a workflow prompt. |
| FR-58 | This may be implemented as a QuickBooks-generated invite link embedded in the portal (verify QuickBooks API availability). |

### 3.13 ExamFX Licensing Integration

| # | Requirement |
|---|-------------|
| FR-59 | Integrate with the ExamFX API using the admin's master account credentials. |
| FR-60 | Match ExamFX learner records to RHP Office agents by name. |
| FR-61 | Display ExamFX study progress (chapters completed, pre-licensing activity) within the agent's Licensing tab. |
| FR-62 | Only applicable to agents who are not yet licensed and are enrolled in the admin's ExamFX hierarchy. |

### 3.14 Agent Transfer Between Teams

| # | Requirement |
|---|-------------|
| FR-63 | Admin can reassign an agent from one upline/recruiter to another via the User Management panel. |
| FR-64 | The transfer updates all downline hierarchy records accordingly. |

---

## 4. Technical Analysis

### Affected Systems

| Area | Changes Required |
|------|-----------------|
| **PostgreSQL / MongoDB Schema** | New tables/collections: `PromotionLevels`, `PromotionThresholds`, `ACAClientCounts`, `CommissionStatements`, `OnboardingDocuments`, `CarrierCategories` (extend). Update `ProductionSubmission` schema: add `status` field with enum, add `productCategory` field. |
| **Backend API** | New endpoints: promotion tracker aggregate, ACA tracker aggregate, commission statement CRUD, agent transfer, onboarding doc upload/link, product management CRUD, ExamFX proxy/sync. Modify: production submission (add status), carrier management (add fields + categories). |
| **Frontend (Angular)** | New components: `PromotionTrackerComponent`, `ACATrackerComponent`, `NextStepsChecklistComponent`, `CommissionStatementsComponent`, `OnboardingDocHubComponent`. Modify: `DashboardComponent`, `ProductionFormComponent`, `CarrierManagementComponent`, `TrainingManagementComponent`. |
| **File Storage** | Extend existing upload service for signed PDFs (commission statements, onboarding docs). |
| **Scheduled Jobs (Cron)** | Daily job: email unlicensed agents with licensing countdown. Background job: check promotion thresholds and emit notification when met. |
| **Third-Party Integrations** | ExamFX API (REST), SendGrid or Brevo (transactional email), QuickBooks API (contractor invite). |
| **Production Submission Export** | Server-side CSV generation using json2csv or similar. |
| **Admin Panel** | New admin pages: Product Management, Promotion Level Config, Onboarding Document Type Config, Commission Upload. |

### Key Database Changes

```
ProductionSubmission
  + status: enum ['Submitted', 'Pending', 'In Force', 'Lapsed', 'Cancelled']
  + productCategory: enum ['Life & Supplemental', 'ACA', 'Medicare']

PromotionLevel
  _id, name, rank, producerPremiumThreshold, producerWindowDays,
  builderPremiumThreshold, builderAgentCountThreshold, builderWindowDays

ACAClientUpload
  _id, uploadedBy (adminId), csvPath, processedAt, records: [{ agentId, clientCount }]

CommissionStatement
  _id, agentId, carrierId, payPeriod (date), filePath, uploadedBy

OnboardingDocType
  _id, name, required, agentCanUpload, agentCanDelete, showAsLink (for APA)

OnboardingDocument
  _id, agentId, docTypeId, filePath, uploadedBy, uploadedAt

Carrier (extend)
  + category: enum ['Life & Supplemental', 'ACA', 'Medicare']
  + factor: Number (commission %)
  + contractingLink: String
  + contractingInstructions: String
  + whatToExpect: String

AgentCarrierStatus
  agentId, carrierId, status: enum ['Requested', 'Appointed'], requestedAt
```

---

## 5. Engineering Tasks / TODO Items

### Sprint 1 — Dashboard Promotion Tracker (Core)
- [ ] Design and create `PromotionLevel` and `PromotionThreshold` schema + seed data with 6 levels.
- [ ] Build aggregation query: sum In Force Life & Supplemental premium per agent, rolling window.
- [ ] Build aggregation query: count active producing downline agents (≥1 In Force entry in window).
- [ ] `GET /api/dashboard/promotion-tracker?window=30` — returns Producer + Builder progress for authenticated agent.
- [ ] Angular `PromotionTrackerComponent` with two animated progress bars and time-window dropdown.
- [ ] Admin UI to configure promotion level thresholds (name, premium, agent count, window).
- [ ] Place tracker at the top of the agent dashboard, above existing widgets.

### Sprint 2 — ACA Tracker + Production Enhancements
- [ ] Add `status` enum field to `ProductionSubmission` model and migration.
- [ ] Add `status` dropdown to New Production Submission form (Submitted, Pending, In Force, Lapsed, Cancelled).
- [ ] Add `productCategory` field and filter ACA/Medicare from promotion bar calculations.
- [ ] Build ACA team client count aggregation endpoint.
- [ ] Build `ACAClientUpload` model + CSV upload endpoint (admin only).
- [ ] Angular `ACATrackerComponent` with tier progress, bonus amount display, and disclaimer.
- [ ] CSV export endpoint for production data (`GET /api/production/export.csv`).
- [ ] Add Download CSV button on production tab.

### Sprint 3 — Carrier Management Overhaul
- [ ] Extend `Carrier` schema: category, factor, contractingLink, contractingInstructions, whatToExpect.
- [ ] Create `AgentCarrierStatus` model.
- [ ] Update carrier admin CRUD to include new fields.
- [ ] Build three-tab carrier view in Angular (Life & Supplemental / ACA / Medicare).
- [ ] Agent can click "Request Contract" button, updating their `AgentCarrierStatus`.
- [ ] Admin can mark agent as "Appointed" in user or carrier management.

### Sprint 4 — Onboarding Document Hub + Next Steps Checklist
- [ ] Create `OnboardingDocType` and `OnboardingDocument` models.
- [ ] Admin UI to configure document types (add/remove/rename, set required flag).
- [ ] Upload endpoint for onboarding documents (agent + upline + admin).
- [ ] APA Agreement: auto-link the signed DocuSign PDF to the agent's onboarding hub.
- [ ] Angular `OnboardingDocHubComponent` with document cards (upload / view / download).
- [ ] `NextStepsChecklistComponent` — conditional logic based on licensed status and document completion.
- [ ] Progress bar for overall onboarding completion on dashboard.

### Sprint 5 — Commission Statements Tab
- [ ] `CommissionStatement` model and file storage integration.
- [ ] Admin endpoint to upload PDF statements with metadata (carrier, agent, pay date).
- [ ] Agent endpoint to list and view own statements.
- [ ] Angular `CommissionsTabComponent` with date + carrier filters and PDF links.

### Sprint 6 — Product Management Admin UI
- [ ] Create `ProductType` model (name, category, active flag).
- [ ] CRUD endpoints for admin.
- [ ] Admin UI page mirroring Carrier Management UI.
- [ ] Wire production submission product dropdown to dynamic product type list.

### Sprint 7 — Email, Notifications & Cron Jobs
- [ ] Set up SendGrid or Brevo account; configure `contracting@rhpoffice.com` via Hostinger.
- [ ] Swap email sending utility from current alias to new transactional service.
- [ ] Cron job: daily email to unlicensed agents with countdown message.
- [ ] Cron job / event trigger: check after each production status update if agent meets promotion threshold; fire in-app + email notification to admin.

### Sprint 8 — ExamFX Integration
- [ ] Investigate ExamFX API (endpoints, auth, rate limits).
- [ ] Build server-side ExamFX sync service that fetches all learners under admin account.
- [ ] Match ExamFX learners to RHP Office agent records (by name + email).
- [ ] Store/cache progress data; expose via `GET /api/licensing/examfx-progress/:agentId`.
- [ ] Display progress cards in the Angular Licensing tab.

### Sprint 9 — Upline Visibility + Agent Transfer
- [ ] Update production and recruit queries to respect upline visibility rules (upline can see downline production, not client names).
- [ ] Admin endpoint: `PUT /api/admin/agents/:id/transfer` — reassign agent's uplineId.
- [ ] Admin UI: user management "Transfer Agent" action with target upline selector.

### Sprint 10 — QuickBooks Integration
- [ ] Research QuickBooks API / invite-link flow for adding contractors.
- [ ] Embed QuickBooks contractor invitation link in the Next Steps checklist (W-9 + Direct Deposit step).
- [ ] Optional: automate contractor creation via QuickBooks API on agent account approval.

### Sprint 11 — Training Tab + Navigation Polish
- [ ] Add missing nav icon to Training Management admin sidebar item.
- [ ] Ensure training material form supports Loom/YouTube URL embed + PDF attachment.
- [ ] Verify categories are editable via admin.

---

## 6. Bug Fixes

| # | Issue | Action |
|---|-------|--------|
| BF-01 | Production submission form has no Status field; admin cannot change status from list view. | Add status dropdown to submission form and ensure pencil/edit action exposes status field. |
| BF-02 | System emails are sent from a personal alias (`Lotus one`) instead of a company email. | Integrate transactional email service and configure `contracting@rhpoffice.com`. |
| BF-03 | Training Management admin nav item is missing an icon, inconsistent with other items. | Add appropriate icon. |
| BF-04 | ACA and Medicare Advantage policies should be excluded from promotion bar calculations but are currently not differentiated in the schema. | Add `productCategory` field and filter appropriately in aggregation queries. |

---

## 7. Enhancements

| # | Enhancement |
|---|-------------|
| EN-01 | Automatic promotion notification to admin when agent meets promotion threshold (precursor to full auto-promotion in a future phase). |
| EN-02 | CSV upload for ACA client counts — allows admin to reconcile real carrier data monthly. |
| EN-03 | Editable product types admin panel (parity with carrier management). |
| EN-04 | Team production report downloadable as CSV with time-window filter. |
| EN-05 | Onboarding document hub with configurable document types. |
| EN-06 | ExamFX study progress embedded in the licensing tab. |
| EN-07 | Video embedding (Loom/YouTube) in training materials with accompanying PDF notes. |
| EN-08 | Agent transfer between teams from admin user management. |

---

## 8. Risks / Edge Cases

| # | Risk | Mitigation |
|---|------|------------|
| RE-01 | **Rolling window calculations are expensive** — querying all production entries per agent on each dashboard load. | Cache promotion tracker aggregates in Redis or similar, invalidate cache on new In Force status change. |
| RE-02 | **ACA CSV upload mismatches** — agent names in the CSV may not exactly match RHP Office records. | Use fuzzy name matching + unique agent ID column as fallback; surface unmatched rows to admin for manual resolution. |
| RE-03 | **ExamFX API availability** — ExamFX may limit API access at the manager hierarchy level; data may not map 1:1. | Confirm API access and available fields before committing sprint capacity. |
| RE-04 | **Multiple promotion levels with different windows** — a 30-day default for one level but 60-day for another means the same agent may display different bars at different times. | Store default window per promotion level; clearly label the window in the UI. |
| RE-05 | **Same-level upline visibility** — if an agent recruits someone who later reaches the same commission tier, the upline should still retain visibility. | Visibility is based on the **recruitment relationship**, not commission tier. |
| RE-06 | **ACA tracker CSV overwrites** — uploading a new CSV should versioned or appended, not silently overwrite historical data. | Store CSV upload history; display the most recent verified count with upload timestamp. |
| RE-07 | **QuickBooks OAuth / invite link** — QuickBooks API may require OAuth flow, which may be complex. | Evaluate a simpler static invite link first; full API integration as a future phase item. |
| RE-08 | **Commission statement file size** — PDFs may be large; storage costs may increase. | Set a max file size limit (e.g., 10MB per statement); use compressed storage. |
| RE-09 | **Agent deletes own onboarding document then disputes** — audit trail needed for document uploads/deletions. | Log all upload and deletion events with timestamp and actor ID to the existing AuditLog model. |

---

## 9. Questions / Clarifications Needed

| # | Question | Stakeholder |
|---|----------|-------------|
| Q-01 | What are the exact In Force premium thresholds for each of the 6 promotion levels on both Producer and Builder tracks? | Client |
| Q-02 | What time window (1–6 months) is the default for each promotion level? | Client |
| Q-03 | Confirm the full list of Statuses for production submission (Submitted, Pending, In Force, Lapsed, Cancelled — are there others?). | Client |
| Q-04 | For the ACA CSV upload, what columns must the CSV contain (agent ID, agent name, client count, period)? | Client |
| Q-05 | Which carriers belong to each category (Life & Supplemental, ACA, Medicare) and what are their factors? | Client |
| Q-06 | Should the Next Steps checklist be configurable by admin or is it a fixed set of steps? | Client |
| Q-07 | Is auto-promotion (system promotes agent automatically) in scope for Phase 3, or only the notification? Transcript made it sound like notification only — confirm. | Client |
| Q-08 | For the Builder track, does "team premium" mean direct recruits only, or the entire downline hierarchy? | Client |
| Q-09 | Does the Agent Transfer feature need to preserve historical production attribution to the old upline, or reassign it entirely? | Client |
| Q-10 | Confirm whether QuickBooks full API integration is in scope for Phase 3 or just an embedded link. | Client |
| Q-11 | ExamFX API — does the admin already have a manager-level API account or does that need to be set up? Provide credentials/API key when available. | Client |
| Q-12 | What email address should daily unlicensed agent notifications be sent to (the admin, the agent, or both)? | Client (transcript implies agent receives daily email) |

---

## 10. Suggested Implementation Plan

### Phase 3 — Recommended Rollout Sequence

#### Milestone 1 — Foundation & Quick Wins (Weeks 1–2)
1. Add `status` field to `ProductionSubmission` + migration.
2. Add status dropdown to production submission form.
3. Add CSV export to production tab.
4. Add Training Management nav icon.
5. Set up transactional email service + `contracting@rhpoffice.com`.
6. Add product type admin management page.

#### Milestone 2 — Dashboard Promotion Tracker (Weeks 3–5)
1. Define and seed promotion levels + threshold config.
2. Build backend aggregation queries (Producer + Builder tracks).
3. Build `PromotionTrackerComponent` in Angular.
4. Integrate time-window dropdown; wire to dashboard.
5. Admin UI for configuring thresholds.
6. Add in-app notification on promotion threshold reached.

#### Milestone 3 — ACA Tracker + Carrier Overhaul (Weeks 6–7)
1. Extend carrier schema; add category + factor + instructions fields.
2. Build three-tab carrier view.
3. Build ACA tracker backend aggregation + CSV upload endpoint.
4. Build `ACATrackerComponent`.

#### Milestone 4 — Onboarding Hub + Checklist (Weeks 8–9)
1. Build `OnboardingDocType`/`OnboardingDocument` models + upload/download endpoints.
2. Build `OnboardingDocHubComponent`.
3. Link signed APA PDF from DocuSign to agent onboarding hub.
4. Build `NextStepsChecklistComponent` on dashboard with progress bar.

#### Milestone 5 — Commission Tab + Upline Visibility (Week 10)
1. Commission statement upload (admin) and view (agent) feature.
2. Implement upline visibility query rules.
3. Build agent transfer action in user management.

#### Milestone 6 — Integrations (Weeks 11–12)
1. ExamFX API investigation and integration (licensing tab).
2. Daily unlicensed agent email cron job.
3. QuickBooks contractor link / integration (scope depending on Q-10 answer).

#### Milestone 7 — QA & Hardening
1. End-to-end testing of all promotion tracker calculations.
2. Role-based access control audit (agent, upline, admin permissions).
3. Load test dashboard aggregation queries; add caching if needed.
4. AuditLog entries for sensitive document actions.
5. Staging deployment + client UAT.
