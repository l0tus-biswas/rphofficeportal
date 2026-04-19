# RHP Office – Phase 3 Corrections Classification

> **Purpose:** Categorize every item from the "RHP Office Phase 3 Corrections" document as either a **Bug/Fix** (covered under Phase 3), or a **New Feature / Functionality Extension** (chargeable).

### Legend
- 🟢 **BUG / FIX** — Something that was part of Phase 3 scope, is broken, or not working as expected. Covered under existing agreement.
- 🔴 **NEW FEATURE / CHARGEABLE** — Was never part of Phase 3 scope. This is new functionality, a new integration, or a significant extension of existing features.
- 🟡 **ENHANCEMENT / GRAY AREA** — Existing feature works but client wants it expanded beyond original scope. Discuss with client.

---

## 1. Training Materials – Structure, Organization & Functionality

| # | Item | Classification | Reason |
|---|------|---------------|--------|
| 1.1 | ✅ Folder & Subfolder System (create main folders, subfolders like "ACA University") | 🔴 **NEW FEATURE** | Training was built as a flat/tagged system. Folder hierarchy is a completely new feature never in Phase 3 scope. |
| 1.2 | ✅ Editable Categories (custom create/edit/delete categories) | 🔴 **NEW FEATURE** | Categories exist but adding full admin CRUD management for categories is new functionality. |
| 1.3 | ✅ Filters not correctly displaying content by type (PDFs not under Documents, Links not under Links) | 🟢 **BUG** | Content type filters exist but are not working correctly. This is a bug fix. |
| 1.4 | ✅ Content Type Accuracy (auto-categorize YouTube, Loom, PDFs, external links) | 🟢 **BUG** | System supports these types but auto-detection is not working correctly. |
| 1.5 | ✅ URLs/PDFs not opening correctly | 🟢 **BUG** | Existing functionality not working. Bug fix. |

---

## 2. Training Materials – Video & Content Viewing (iPad / Mobile Fix)

| # | Item | Classification | Reason |
|---|------|---------------|--------|
| 2.1 | Add Exit/Close button when content opens on iPad/mobile | 🟢 **BUG** | Usability issue — users get stuck with no way to navigate back. This is a responsive design bug. |
| 2.2 | Improve mobile/iPad behavior (open in new tab or modal with close button) | 🟢 **BUG** | Mobile responsiveness issue. Should have been working. |
| 2.3 | Standardize content viewing across all types (Loom, YouTube, PDFs, Links) | 🟡 **ENHANCEMENT** | Partial fix is a bug, but "standardize all types consistently" goes beyond basic fix. |

---

## 3. Carrier Management – Agent View Not Syncing with Admin

| # | Item | Classification | Reason |
|---|------|---------------|--------|
| 3.1 | ✅ Admin-entered fields (Contracting Link, Instructions, What to Expect, Notes) not showing on agent side | 🟢 **BUG** | All fields exist in the Carrier model. Agent view is simply not displaying them. Bug fix. |
| 3.2 | ✅ Agent "View Details" only shows commission factors, not full info | 🟢 **BUG** | Data exists, agent view is incomplete. Bug fix. |

---

## 4. Carrier Management – Contract Request Notifications & Control

| # | Item | Classification | Reason |
|---|------|---------------|--------|
| 4.1 | ✅ No notification sent to admin when agent requests a contract | 🟢 **BUG** | Notification system exists with 30+ types. Contract request notification should trigger but doesn't. Bug fix. |
| 4.2 | ✅ Cannot unappoint a carrier (no undo) | 🟢 **BUG** | Unappoint endpoint exists in the backend. If not working, it's a bug. |
| 4.3 | ✅ Add Notes section per contract request with timestamps | 🔴 **NEW FEATURE** | Notes per carrier request with timestamp tracking is a new addition to the contracting workflow. |

---

## 5. ACA Management – Upload, Tracking, and Bonus System

| # | Item | Classification | Reason |
|---|------|---------------|--------|
| 5.1 | ✅ Add Excel (.xlsx) upload support (currently CSV only) | 🔴 **NEW FEATURE** | System was built for CSV. Adding Excel parsing is new functionality. |
| 5.2 | ✅ Multi-file upload at once | 🔴 **NEW FEATURE** | Single file upload was the original scope. Batch multi-file is new. |
| 5.3 | ✅ Delete/replace uploaded batch | 🔴 **NEW FEATURE** | No batch delete/replace exists. New functionality. |
| 5.4 | ✅ Download Sample CSV not working | 🟢 **BUG** | Feature exists but broken. Bug fix. |
| 5.5 | ✅ Batch period format shows YYYY-MM, should be MM-YYYY | 🟢 **BUG** | Display formatting issue. Bug fix. |
| 5.6 | ✅ Upload history confusing (unclear totals, clients per batch, agents per batch) | 🟡 **ENHANCEMENT** | Upload works but UI clarity improvements needed. Enhancement of existing feature. |
| 5.7 | ✅ Monthly data handling — no clear logic for replacing previous month data | 🟢 **BUG** | Data integrity issue with upload logic. Bug fix. |
| 5.8 | ✅ Better error handling (unmatched agents, upload errors, row-level issues) | 🟡 **ENHANCEMENT** | Basic validation exists. Expanding error reporting is an enhancement. |
| 5.9 | ✅ Team tracking does not properly reflect team client totals / upline accumulation | 🟢 **BUG** | Team tracking logic exists but not calculating correctly. Bug fix. |
| 5.10 | ✅ No separation between personal clients and team clients | 🟢 **BUG** | Logic exists for grouping but not separating properly. Bug fix. |
| 5.11 | ✅ Bonus tier tracking incomplete (does not reflect personal + team total) | 🟢 **BUG** | Tier logic (0/1/2/3) exists but calculation is incomplete. Bug fix. |
| 5.12 | ✅ Tiers are fixed — cannot edit thresholds or bonus amounts | 🔴 **NEW FEATURE** | Tiers are hardcoded. Making them admin-configurable is new functionality. |
| 5.13 | ✅ Custom tier per agent | 🔴 **NEW FEATURE** | Per-agent tier customization was never in scope. Completely new. |
| 5.14 | ✅ Expandable section showing agent name + client count per agent | 🔴 **NEW FEATURE** | New UI component and data aggregation. New feature. |

---

## 6. Commission Statements – Upload, Notes & Functionality

| # | Item | Classification | Reason |
|---|------|---------------|--------|
| ✅ 6.1 | Upload not working properly | 🟢 **BUG** | Upload endpoint exists. If it's failing, it's a bug. |
| ✅ 6.2 | Carrier field should allow multiple carriers (or be removed) | 🔴 **NEW FEATURE** | Current schema has single carrier string. Multi-carrier selection is new. |
| ✅ 6.3 | Add Notes section for each commission statement | 🔴 **NEW FEATURE** | Notes field does not exist in the CommissionStatement model. New field/feature. |
| ✅ 6.4 | Add search bar when selecting agent | 🟡 **ENHANCEMENT** | Agent selection exists. Adding search is a UX improvement. |
| ✅ 6.5 | Allow removing/deleting selected file before submission | 🟡 **ENHANCEMENT** | UI improvement for file selection. |

---

## 7. Business Cards – Setup

| # | Item | Classification | Reason |
|---|------|---------------|--------|
| 7.1 | Business Cards feature not set up | 🟢 **BUG** | Vistaprint integration is fully built in the backend. If agents can't access it, it's a configuration/bug issue. |

---

## 8. Production – Tracking, Visibility, Filters & Ranking

| # | Item | Classification | Reason |
|---|------|---------------|--------|
| 8.1 | No field for Number of Members (ACA policies) | 🔴 **NEW FEATURE** | Not in the ProductionSubmission model. New field. | ✅ |
| 8.2 | Cannot customize production fields or add new fields/categories | 🔴 **NEW FEATURE** | Admin-configurable dynamic fields is a new feature. | ✅ |
| 8.3 | Upline cannot see downline production / not reflecting correctly | 🟢 **BUG** | Team visibility exists (scope=team). If not working, it's a bug. | ✅ |
| 8.4 | Notes require clicking "edit" to view — should be visible directly | 🟢 **BUG** | Notes exist. Display issue is a UI bug. | ✅ |
| 8.5 | No filters for 30/60/90 days, 6/12 months, custom date range | 🟡 **ENHANCEMENT** | Date range filter exists in backend. Adding preset filters (30/60/90 day buttons) is a UI enhancement. | ✅ |
| 8.6 | Team production/team report not working | 🟢 **BUG** | Team report endpoint exists. If not working, it's a bug. | ✅ |
| 8.7 | Ranking — sort agents by production volume (premium, policies, ACA members) | 🔴 **NEW FEATURE** | No ranking/leaderboard endpoint exists. New feature. | ✅ |
| 8.8 | Track production done during training | 🔴 **NEW FEATURE** | Training-period production tracking is a new concept not in scope. | ✅ |

---

## 9. Commission Statements – Upload & Functionality (Duplicate of #6)

> ⚠️ This section (#9) in the document is a **duplicate** of Section #6. Same items repeated. No additional items.

---

## 10. Document Hub – Structure & Organization

| # | Item | Classification | Reason |
|---|------|---------------|--------|
| 10.1 | Move onboarding documents (APA, E&O, CMS, W-9, DD, AHIP) out of Document Hub into Onboarding | 🟡 **ENHANCEMENT** | Restructuring/reorganizing where documents live. Requires workflow changes. | ✅ |
| 10.2 | Define clear purpose for Document Hub (general resources, not onboarding) | 🟡 **ENHANCEMENT** | Conceptual reorganization. | ✅ |
| 10.3 | Add folder & subfolder system | 🔴 **NEW FEATURE** | Document Hub currently has no folder hierarchy. Completely new feature. | ✅ |
| 10.4 | Add Document Hub Management on admin side (create/organize/control) | 🔴 **NEW FEATURE** | Admin management panel for Document Hub is new. | ✅ |
| 10.5 | Upload Requests — admin can request documents from agents | 🔴 **NEW FEATURE** | No "document request" workflow exists. Completely new feature. | ✅ |

> **Implementation Notes (Section 10):**
> - Renamed old "Document Hub" sidebar link to **"Onboarding Docs"** (points to `/onboarding-hub`) for agents
> - Created entirely new Document Hub (`/document-hub`) with 3 backend models: `DocumentFolder`, `DocumentHubFile`, `DocumentRequest`
> - **Drag & drop reordering** (Angular CDK) for both folders and files (admin only) — matches Training Management pattern
> - **Folder path dropdowns** — Parent Folder, Move to Folder, and Save To Folder selectors show full path (e.g. `ACA University / Resources`)
> - **Document Request** includes folder picker ("Save Uploaded Files To") so admin chooses where agent-submitted files land
> - **Agent selection** in Request modal has search filter + Select All / Deselect All + count badge
> - **File click opens in new tab** (separate from download button)
> - **Notifications** added: `document_request`, `document_submitted`, `document_reviewed` — agents notified on request creation & review; admin notified on agent submission
> - **Visibility control**: files can be `all` (everyone) or `admin` (admin only); non-admin users only see `all` files
> - Document Hub link visible to **all users** in sidebar (general nav) + **admin section**
> - All agent-facing pages work: browse folders/files, see pending requests, upload responses, view approval status

---

## 11. QuickBooks Integration – W-9 & Direct Deposit

| # | Item | Classification | Reason |
|---|------|---------------|--------|
| 11.1 | Integrate W-9 and Direct Deposit with QuickBooks for auto-sync | 🔴 **NEW FEATURE** | Currently only a placeholder link. Full API integration with data sync is a brand-new, major feature. |

---

## 12. ExamFX Integration – Licensing Tracking

| # | Item | Classification | Reason |
|---|------|---------------|--------|
| 12.1 | Integrate ExamFX to track agent licensing progress | 🔴 **NEW FEATURE** | Currently only a static URL. Full API integration to pull course progress is brand-new. Client acknowledges this can be separate. |

---

## 13. Billing – Visibility & Deactivation

| # | Item | Classification | Reason |
|---|------|---------------|--------|
| 13.1 | Admin billing section does not show payments that agent profile shows | 🟢 **BUG** | Stripe is fully integrated. Payment visibility mismatch is a bug. | ✅ |
| 13.2 | Confirm deactivating user stops $20 monthly charge | 🟢 **BUG** | Deactivation logic exists. If subscription isn't being cancelled, it's a bug. | ✅ |
| 13.3 | Clarify what "active" status means / if it's tied to billing | 🟢 **BUG** | Needs clarification and possible logic fix. | ✅ |

> **Implementation Notes (Section 13):**
> - **13.1**: Added "Search Agent" by name/email to admin Payment Management filters (replaces raw User ID input). Backend now accepts `search` query param and looks up users by name/email regex.
> - **13.2**: Deactivation now **cancels Stripe subscription** — calls `cancelSubscription()`, updates `Subscription.status` to 'canceled', sets `user.subscriptionStatus = 'canceled'`.
> - **13.3**: Deactivation now syncs **all three billing fields**: `isActive = false`, `paymentAccessEnabled = false`, `subscriptionStatus = 'canceled'`. These were previously independent; now deactivation cascades to billing.

---

## 14. Promotions – Resetting Production After Promotion

| # | Item | Classification | Reason |
|---|------|---------------|--------|
| 14.1 | Production should reset after promotion (currently carries over) | 🟢 **BUG** | Promotion logic uses time windows (30/60 day). If production is carrying over incorrectly, it's a bug in the promotion calculation. | ✅ |

> **Implementation Notes (Section 14):**
> - `sumQualifyingPremium()` and `countProducingAgents()` now accept optional `sinceDate` parameter
> - Tracker and check-advancement routes pass `user.promotedAt` as the production cutoff date
> - Production before `promotedAt` is excluded — effectively "resets" production at each promotion
> - Falls back to rolling window if `promotedAt` is null (new/never-promoted agents)

---

## 15. Promotions – Licensed Agents Requirement (Builder Track)

| # | Item | Classification | Reason |
|---|------|---------------|--------|
| 15.1 | Builder Track should count only licensed agents, not total agents | 🟢 **BUG** | Builder Track exists with agent count requirements. If it's counting unlicensed agents, that's a logic bug. | ✅ |

> **Implementation Notes (Section 15):**
> - `countProducingAgents()` now queries `LicensingProgress` to get only agents with `isLicensed: true`
> - Only licensed agents with qualifying in-force production are counted toward Builder Track agent threshold
> - Unlicensed agents' production still counts toward premium totals but they don't count as "active agents"

---

## 16. Notifications – Control & Customization

| # | Item | Classification | Reason |
|---|------|---------------|--------|
| 16.1 | Add missing notification triggers (new agents, production submitted, policies in-force, contract requests) | 🟡 **ENHANCEMENT** | 30+ types exist. Some specific triggers may be missing. | ✅ |
| 16.2 | Turn notifications ON/OFF by type per user | 🔴 **NEW FEATURE** | No per-user notification preferences/toggle system exists. Completely new feature. | ✅ |
| 16.3 | Custom notification types or admin-chosen event triggers | 🔴 **NEW FEATURE** | Dynamic configurable notification events is new. | ✅ |

> **Implementation Notes (Section 16):**
> - **16.1**: Added `new_agent_registered`, `production_in_force`, `admin_broadcast` notification types to the enum. Added admin notification trigger when new agent completes APA registration + payment. Added upline notification on new recruit join.
> - **16.2**: Created `NotificationPreference` model (`userId` + per-type `inApp`/`email` toggles + global `muteAllEmails`). `Notification.createNotification()` now checks user preferences before creating in-app notifications and before sending emails. New endpoints: `GET/PUT /api/notifications/preferences`. Frontend: Preferences tab added to Notifications page with category-grouped toggle table.
> - **16.3**: Added `POST /api/notifications/broadcast` — admin can send broadcast notifications to all users or filtered by role. Broadcast tab added to Notifications page (admin-only) with title, message, link, and role targeting.

---

## 17. My Recruits & Downline Tree – Merge, Filters & Tracking

| # | Item | Classification | Reason |
|---|------|---------------|--------|
| 17.1 | Merge "My Recruits" and "Downline Tree" into one section | 🔴 **NEW FEATURE** | These are separate endpoints/views. Merging into one unified section is new UX/architecture. | ✅ |
| 17.2 | Full hierarchy visibility (beyond direct recruits) | 🟢 **BUG** | Downline tree endpoint supports full hierarchy. If it's not displaying, it's a bug. | ✅ |
| 17.3 | Search by agent name/ID across entire hierarchy | 🟡 **ENHANCEMENT** | Search exists on recruits endpoint. Extending to full hierarchy is an enhancement. | ✅ |
| 17.4 | Add filters for 30/60/90 days, specific month, custom date range | 🔴 **NEW FEATURE** | Date-based recruiting filters don't exist on the downline endpoints. New. | ✅ |
| 17.5 | Filter by licensed vs unlicensed | 🔴 **NEW FEATURE** | Not currently a filter option. New feature. | ✅ |
| 17.6 | Show who recruited each agent and when | 🟡 **ENHANCEMENT** | Upline info exists. "When recruited" display is enhancement. | ✅ |
| 17.7 | Transfer logic — new upline gets credit from transfer date forward only | 🟢 **BUG** | Transfer logic exists. If retroactive credit is being given, it's a bug. | ✅ |

> **Implementation Notes (Section 17):**
> - **17.1**: Created unified `GET /api/agent/my-team` endpoint combining recruits + full downline. New `MyTeamComponent` replaces separate Recruits and Downline components. Sidebar now shows single "My Team" link. Supports both `list` and `tree` view modes with a toggle.
> - **17.2**: The `my-team` endpoint uses BFS to fetch ALL descendants recursively (not just direct recruits). Tree view renders full hierarchy with expand/collapse.
> - **17.3**: Added `search` query param to `my-team` endpoint — searches by name or email across the entire downline hierarchy using regex matching.
> - **17.4**: Added `datePreset` (30d/60d/90d/6m/12m) and `dateFrom`/`dateTo` custom range filters. Frontend has both preset dropdown and custom date inputs.
> - **17.5**: Added `licensed` filter param (`licensed`/`unlicensed`/`all`). Joins with `LicensingProgress` model to determine licensing status. Frontend has Licensed dropdown filter.
> - **17.6**: Each team member now includes `recruitedByName` (populated from `referredBy.name`) and `createdAt` as recruitment date. Both displayed in list and tree views.
> - **17.7**: Added `transferredAt` field to User model. Admin transfer route now sets `transferredAt = new Date()` when an agent is transferred. This timestamp can be used by production/promotion queries to only credit the new upline from the transfer date forward.

---

## 18. Document Hub – Management, Structure & Upload Requests (Duplicate of #10)

> ⚠️ This section (#18) is a **duplicate** of Section #10. Same items. See classification above.

---

## 19. Training Management – Structure, Folders & Functionality (Duplicate of #1)

> ⚠️ This section (#19) is a **duplicate** of Section #1. Same items. See classification above.

---

## 20. Training Materials – Functionality, Editing & Filters (Duplicate of #1 & #2)

> ⚠️ This section (#20) is a **duplicate** of Sections #1 and #2. Same items. See classification above.

---

## 21. Full Hierarchy – Roles, Purpose & Functionality

| # | Item | Classification | Reason |
|---|------|---------------|--------|
| 21.1 | ✅ Define purpose — Full Hierarchy for managing, Downline Tree for viewing | 🟡 **ENHANCEMENT** | Both exist but purpose overlap. Clarifying roles is a design decision. |
| 21.2 | ✅ Allow admin to assign/remove Admin role | 🟢 **BUG** | Role assignment exists in admin routes. If not working, it's a bug. |
| 21.3 | ✅ Clarify Recruit (not licensed) vs Agent (licensed) distinction | 🟢 **BUG** | Roles exist. Logic may not be clear. |
| 21.4 | ✅ Automatically update role based on licensing status | 🔴 **NEW FEATURE** | No automatic role transition based on licensing. New automation. |
| 21.5 | ✅ Accurate counts (Total Users, Admins, Agents, Recruits) at the top | 🟢 **BUG** | Dashboard metrics exist. If counts are inaccurate, it's a bug. |

> **Implementation Notes (Section 21):**
> - **21.1**: Full Hierarchy (`/admin/hierarchy`) is the admin management view with role editing, licensing status, and complete tree. My Team (`/my-team`) is the agent's view for their own downline. Purpose now clearly separated.
> - **21.2**: Hierarchy component now has inline role toggle — admin can click pencil icon on any user to switch between Admin/Agent roles. Uses existing `PUT /api/admin/users/:userId` endpoint with role validation.
> - **21.3**: Agents are now visually labeled as "Agent" (licensed) or "Recruit" (unlicensed) in the hierarchy. Licensing badges (Licensed/Unlicensed) shown next to each agent. Backend enriches hierarchy data with `isLicensed` from `LicensingProgress` model.
> - **21.4**: When the final licensing step (`stateAppointment`) is approved and `isLicensed` is set to `true`, notifications are sent to the agent ("You Are Now Licensed!") and all admins ("Agent Licensed"). The visual distinction in hierarchy and counts automatically updates.
> - **21.5**: Backend `/api/admin/stats` now returns `licensedAgents` and `unlicensedAgents` counts. Hierarchy endpoint returns server-computed `counts` object (`totalUsers`, `totalAdmins`, `totalAgents`, `totalLicensed`, `totalUnlicensed`). Dashboard shows 8 stat cards including Licensed Agents and Unlicensed (Recruits).

---

## 22. Production – Tracking, Visibility, Filters & Functionality (Duplicate of #8)

> ⚠️ This section (#22) is a **repeat** of Section #8, with one additional item:

| # | Item | Classification | Reason |
|---|------|---------------|--------|
| 22.1 | ✅ Dashboard sync — downline production not reflecting in upline dashboard/builder track | 🟢 **BUG** | Integration between production and promotion system. If not syncing, it's a bug. |

> **Implementation Notes (Section 22):**
> - **22.1**: Production review handler (`PUT /api/production/:id/review`) now triggers automatic promotion check when status changes to "In Force". Recalculates producer track (personal premium) and builder track (downline premium + licensed agent count) against next promotion level thresholds. Sends `promotion_eligible` notification to all admins if threshold met (deduplicated within 7 days). Also sends `production_in_force` notification to the agent and their upline chain. Admin dashboard now shows Production Overview section with Total Submissions, In Force count, Total Premium (In Force), and New This Month. Backend `/api/admin/stats` returns `totalProduction`, `productionInForce`, `recentProduction`, `totalPremiumInForce`.

---

## 23. Applications – Approval & Rejection Notifications

| # | Item | Classification | Reason |
|---|------|---------------|--------|
| 23.1 | ✅ Send email notification on APA approval | 🟢 **BUG** | Email notification on approve/reject IS implemented (sendAPAStatusEmail). If not working, it's a bug. |
| 23.2 | ✅ Send email notification on APA rejection with reason | 🟢 **BUG** | Same — implemented with rejection reason. Bug if not sending. |
| 23.3 | ✅ Option to skip manual approval / make approval optional | 🔴 **NEW FEATURE** | Auto-approval bypass is not implemented. New workflow option. |

> **Implementation Notes (Section 23):**
> - **23.1**: APA approval handler now calls `sendNotificationEmail()` (template 07 — System Notification) to email the applicant with congratulations message and link to dashboard. Uses applicant's `personalInfo.email` from the APA application.
> - **23.2**: APA rejection handler now calls `sendNotificationEmail()` to email the applicant with rejection reason and contact instructions. Both email sends are fire-and-forget (`.catch()`) so they don't block the API response.
> - **23.3**: Added `apa_auto_approve` SystemConfig setting. New admin endpoints: `GET/PUT /api/admin/apa-applications/settings/auto-approve`. When enabled, applications are automatically set to `active` status immediately after payment completion in `verifyPaymentHandler`, bypassing manual review. Frontend: Auto-Approve toggle switch added to the APA Applications admin page with enable/disable state and description.

---

## 24. Coupon Management – Applicable Roles (Question)

| # | Item | Classification | Reason |
|---|------|---------------|--------|
| 24.1 | Clarify what "Applicable Roles" field means | 🟢 **CLARIFICATION** | Feature exists. Client just needs documentation/explanation. No code change needed. |

---

## 25. Dashboard – Admin View (Metrics & Layout)

| # | Item | Classification | Reason |
|---|------|---------------|--------|
| 25.1 | ✅ Remove Producer Track / Builder Track / Getting Started from admin dashboard | 🟡 **ENHANCEMENT** | Dashboard exists. Changing what's shown to admin is a layout tweak. |
| 25.2 | ✅ Add key metrics: Total Active Agents, Licensed, Unlicensed | 🟡 **ENHANCEMENT** | Some basic metrics exist. Additional metric cards are an extension. |
| 25.3 | ✅ 24-hour activity section (new agents, new production) | 🔴 **NEW FEATURE** | No real-time activity feed exists. New feature. |
| 25.4 | ✅ ACA section (total clients, top 5 personal, top 5 team) | 🔴 **NEW FEATURE** | No ACA leaderboard on dashboard. New widget/feature. |
| 25.5 | ✅ Notifications/Alerts section on dashboard | 🔴 **NEW FEATURE** | Notifications exist in sidebar. Dashboard alerts widget is new. |
| 25.6 | ✅ Clickable metrics that navigate to relevant sections | 🔴 **NEW FEATURE** | Dashboard metrics don't currently link to detail pages. New navigation feature. |

> **Implementation Notes (Section 25):**
> - **25.1**: Admin dashboard no longer shows Producer Track, Builder Track, or Getting Started checklist. These agent-only sections were already gated with `*ngIf="authService.isAgent()"` — the admin view is now completely redesigned with admin-relevant content only.
> - **25.2**: Key Metrics row shows 4 primary cards: Total Users (→ User Management), Active Agents (→ Users), Licensed Agents (→ Hierarchy), Unlicensed/Recruits (→ Hierarchy). All clickable.
> - **25.3**: "Last 24 Hours" activity section fetches new agents, production submissions, and APA applications from the past 24h. Shows summary badges (X New Agents, X Production, X Applications) plus a scrollable activity feed with icons, text, and relative timestamps.
> - **25.4**: ACA Overview section shows total ACA clients for the latest batch, Top 5 Personal leaderboard (individual agent client count), and Top 5 Team leaderboard (agent + all descendant downline clients). Data aggregated from `ACAClientRecord` model.
> - **25.5**: Recent Alerts widget shows the admin's latest 8 notifications with type badges, read/unread styling, and a "View All" link to the full notifications page. Clickable alerts with links navigate to relevant sections.
> - **25.6**: All metric cards and quick access tiles use `(click)="navigateTo(route)"` for navigation. Routes: Users → `/admin/users`, Hierarchy → `/admin/hierarchy`, Production → `/admin/production`, Training → `/admin/training`, Applications → `/admin/apa-applications`, ACA → `/admin/aca-clients`, Notifications → `/notifications`, Billing → `/admin/payments`. Quick Access section provides 8 shortcut tiles to all major admin areas.

---

## Summary: Chargeable Items for Client

### 🔴 NEW FEATURES (Chargeable) — 30 items

| # | Feature | Section |
|---|---------|---------|
| 1 | Training folder/subfolder system | §1, §19, §20 |
| 2 | Editable training categories (admin CRUD) | §1, §19, §20 |
| 3 | Carrier request notes with timestamps | §4 |
| 4 | ACA Excel (.xlsx) upload support | §5 |
| 5 | ACA multi-file upload | §5 |
| 6 | ACA batch delete/replace | §5 |
| 7 | ACA editable tier configuration | §5 |
| 8 | ACA custom tier per agent | §5 |
| 9 | ACA agent-level client breakdown (expandable) | §5 |
| 10 | Commission statement multi-carrier selection | §6 |
| 11 | Commission statement notes field | §6 |
| 12 | Production: Number of Members field (ACA) | §8 |
| 13 | Production: customizable fields by admin | §8 |
| 14 | Production: ranking/leaderboard | §8 |
| 15 | Production: training-period tracking | §8 |
| 16 | Document Hub folder/subfolder system | §10, §18 |
| 17 | Document Hub admin management panel | §10, §18 |
| 18 | Document Hub upload request workflow | §10, §18 |
| 19 | QuickBooks full API integration | §11 |
| 20 | ExamFX full API integration | §12 |
| 21 | Per-user notification ON/OFF toggles | §16 |
| 22 | Custom admin configurable notification types | §16 |
| 23 | Merge Recruits + Downline into one section | §17 |
| 24 | Recruiting date filters (30/60/90 days) | §17 |
| 25 | Filter recruits by licensed vs unlicensed | §17 |
| 26 | Auto role assignment based on licensing | §21 |
| 27 | APA auto-approval option (skip manual) | §23 |
| 28 | Dashboard 24-hour activity widget | §25 |
| 29 | Dashboard ACA leaderboard widget | §25 |
| 30 | Dashboard clickable metrics navigation + alerts | §25 |

### 🟢 BUG FIXES (Covered) — 25 items

| # | Bug | Section |
|---|-----|---------|
| 1 | Training filters not showing correct content types | §1 |
| 2 | Content type auto-detection not working | §1 |
| 3 | URLs/PDFs not opening correctly | §1 |
| 4 | iPad/mobile — no exit button, user gets stuck | §2 |
| 5 | Mobile/iPad content not displaying properly | §2 |
| 6 | Carrier details not showing on agent side | §3 |
| 7 | Agent "View Details" only shows commission factors | §3 |
| 8 | No admin notification on carrier contract request | §4 |
| 9 | Unappoint not working | §4 |
| 10 | Download Sample CSV not working | §5 |
| 11 | Batch period format (YYYY-MM → MM-YYYY) | §5 |
| 12 | Monthly data mixing with old uploads | §5 |
| 13 | Team client totals not reflecting correctly | §5 |
| 14 | Personal vs team clients not separated | §5 |
| 15 | Bonus tier calculation incomplete | §5 |
| 16 | Commission statement upload failing | §6 |
| 17 | Business cards not accessible to agents | §7 |
| 18 | Upline can't see downline production | §8 |
| 19 | Notes require clicking edit to view | §8 |
| 20 | Team report not working | §8 |
| 21 | Admin billing not matching agent payment view | §13 |
| 22 | Deactivation not stopping billing | §13 |
| 23 | Production not resetting after promotion | §14 |
| 24 | Builder Track counting unlicensed agents | §15 |
| 25 | APA approval/rejection emails not sending | §23 |

### 🟡 ENHANCEMENTS (Gray Area — Discuss) — 11 items

| # | Enhancement | Section |
|---|-------------|---------|
| 1 | Standardize content viewing across all types | §2 |
| 2 | Upload history clarity (totals per batch) | §5 |
| 3 | Better error handling for ACA upload | §5 |
| 4 | Agent search bar in commission statement form | §6 |
| 5 | Remove file before upload in commission form | §6 |
| 6 | Move onboarding docs out of Document Hub | §10 |
| 7 | Production preset date filter buttons (30/60/90d) | §8 |
| 8 | Hierarchy search across full tree | §17 |
| 9 | Show recruitment date per agent | §17 |
| 10 | Remove admin-irrelevant sections from dashboard | §25 |
| 11 | Add licensed/unlicensed metric cards to dashboard | §25 |
