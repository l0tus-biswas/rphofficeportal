# Test Evidence — RHP Office E2E (2026-06-21)

Browser: Playwright MCP (local Chromium). Target: http://localhost:4200 (Angular dev) → API :5000.
Screenshots saved at repo root: `agent-dashboard.png`, `agent-my-team.png`, `admin-dashboard.png`.
Per-page snapshots/console logs under `.playwright-mcp/`.

## Agent role — page results (all PASS, console clean except favicon/dev-lint)
| Page | Result | Evidence |
|------|--------|----------|
| /dashboard | PASS | agent-dashboard.png; socket `Connected`; stats load |
| /my-team | PASS | agent-my-team.png; 4 members, level breakdown |
| /onboarding (APA) | PASS | "My APA Application", 2 tables |
| /onboarding-upload | PASS | 5-step wizard |
| /onboarding-hub | PASS | progress 1 approved / 5 submitted |
| /training | PASS | folders + materials |
| /licensing | PASS | 100% licensed, checklist |
| /examfx-progress | PASS | team % (Rebacca 60%, Lotus 85%) |
| /production | PASS | 3 submissions, $601 premium, filters |
| /carriers | PASS | categories + appointment status |
| /commissions | PASS | statements table + downloads |
| /document-hub | PASS | folders + doc requests |
| /business-cards | PASS | Merch store, order options |
| /profile | PASS | edit+save verified (then reverted) |
| /transactions | PASS | subscription active $20/mo |
| /broadcasts | PASS | 23 announcements |
| /notifications | PASS | 580 notifications, prefs |
| /recruits, /downline | PASS | 3 recruits / 5 downline / 3 levels |
| /translation | PASS | loads |

## Admin role — page results (all PASS, 0 console errors)
User Management (10 users) · Hierarchy (18) · APA Applications (9) + detail drill-in ·
Product Mgmt (46) · Coupons (3) · Carrier Mgmt (111) · Carrier Appointments (8) ·
Commission Statements (5) · Payment Mgmt (12) · Onboarding Doc Types (6) · Onboarding Mgmt (17) ·
ACA Client Volume Mgmt · Admin Licensing · ExamFX Mgmt · Training Mgmt (58 cards) ·
Printful Config · Store Orders · Promotion Mgmt · Broadcast Mgmt (20) · Branding ·
Welcome Message · System Config · System Monitoring.

## Workflow evidence
- **Profile edit (agent):** Edit → change Timezone → Save → "Profile updated successfully!" → reverted. PASS.
- **APA detail (admin):** /admin/apa-applications/:id → Personal/Recruiting/Compliance sections + 8 action buttons. PASS.
- **AuthZ (security):** agent token → admin APIs = 403; agent → /admin/* UI = redirect. PASS.
