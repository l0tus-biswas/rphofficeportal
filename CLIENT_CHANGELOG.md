# RHP Office — Project Changelog & Deliverables

---

## 🔷 Core Platform

- Full **MERN Stack** application (MongoDB, Express, Angular, Node.js)
- **Role-Based Authentication** (Admin & Agent) with JWT tokens
- **Audit Logging** on all user actions
- **Rate Limiting**, CORS, Helmet security headers
- **28 Database Models**, **24 API Route Files**

---

## 🔷 New Features

### APA Application & Recruiting
- 5-section APA (Agent Producer Agreement) application form
- Public recruiting links with unique referral codes per agent
- Recruiter field editable during APA entry
- "Other" option for licensing status with free-text input

### DocuSign Integration
- Automated envelope creation with **75 pre-filled & locked fields**
- Email-based remote signing workflow
- Webhook processing — application status auto-updates on signing
- Inline email edit before envelope send
- Migrated to new RHP APA Agreement template

### Stripe Payment Processing
- $20/month subscription billing
- Stripe Checkout integration with coupon/discount code support
- Webhook handlers: checkout completed, invoice paid, payment failed, subscription updated/deleted
- Auto account creation after successful payment
- Coupon management (LICENSED, WELCOME50, FIRSTMONTHFREE)

### Email System (Neuzmail)
- 7 professional HTML email templates:
  1. Welcome with Temporary Password
  2. Welcome with Set Password Link
  3. Password Reset
  4. APA Application Confirmation
  5. Payment Setup Link (post-DocuSign)
  6. Account Activated (post-payment)
  7. System Notification

### Promotion Tracker (Dashboard)
- **Producer Track** — personal In Force premium (Life & Supplemental)
- **Builder Track** — team premium + active producing agent count
- Visual progress bars with rolling time window (30–180 days)
- 6 promotion levels: Associate → Senior Associate → Manager → Senior Manager → Division Executive → National Executive
- Admin-configurable promotion thresholds

### ACA Client Volume Tracker
- Team-wide health insurance client counts
- Reported vs. Verified data tracking
- Bonus tier system ($1–$3/client/month)
- CSV upload for carrier-verified counts
- Household size aggregation

### Production Management
- Submit, edit, and track production entries (Submitted → Pending → In Force → Lapsed → Cancelled)
- Product categories: Life, Health, Medicare, Supplemental, Retirement/Annuities, P&C
- CSV export of filtered production data
- Team production reports with upline/downline visibility
- Date range filters (30/60/90 day presets + custom)

### Onboarding Document Hub
- Structured document cards: APA Agreement, CMS Certificate, E&O Insurance, W-9, Direct Deposit
- Agent upload/download capability
- Admin-configurable document types
- Read-only display of signed APA (DocuSign PDFs)
- Auto-completion tracking with progress bar

### Document Hub (General Resources)
- Folder & subfolder system with drag-and-drop reordering
- File management with visibility controls (admin-only vs. all)
- Document request workflow — admin can request docs from agents
- Breadcrumb navigation

### Carrier Management
- 3-tab system: Life & Supplemental / ACA / Medicare
- Per-carrier fields: Commission Factor %, Contracting Instructions, "What to Expect", Notes
- Agent contract request workflow with admin appointment/unappoint
- Contract request notifications

### Commission Statements
- Admin uploads PDF statements tagged by carrier & date
- Agent filtering by carrier and period
- In-portal PDF viewer
- Admin notes on statements

### Training Management
- Folder hierarchy with categories (e.g., "ACA University")
- Video embeds (Loom, YouTube), PDF attachments, external links
- Content filtering by type
- Mobile/iPad support with close button
- Admin CRUD for categories and materials

### Notifications & Communications
- 30+ in-app notification types
- Customizable notification preferences per user
- Admin broadcast messaging system
- Notifications for: promotions, document requests, contract requests, production updates, commissions, system alerts

### Next Steps Checklist (Dashboard)
- Contextual task list for new agents
- Licensing-focused for unlicensed agents, onboarding-focused for licensed
- Auto-completion on document/action submission
- Progress bar for overall onboarding %

### Business Cards
- Vistaprint integration for agent business cards
- English/Spanish design support

---

## 🔷 Bug Fixes

### APA / DocuSign Flow
- Fixed recruiter field — now editable during APA entry
- Removed yellow DocuSign instruction banner
- Fixed duplicate emails after APA submission
- Locked all DocuSign form fields (read-only during signing)
- Fixed sender branding to "RHP Office"
- Fixed post-DocuSign status updates — immediate reflection
- Fixed payment setup email trigger timing

### Payment Flow
- Removed $179 setup fee — changed to $20/month subscription only
- Updated all payment messaging and Stripe products
- Fixed ESCAPE branding → RHP Office branding
- Fixed coupon application in payment flow

### Account Creation & Onboarding
- Fixed password setup auto-routing after payment
- Fixed welcome email with set-password token
- Fixed onboarding tab visibility for newly recruited agents

### Training Management
- Fixed content type filters (PDFs, Links, Videos)
- Fixed auto-categorization of YouTube/Loom/PDFs/Links
- Fixed URLs/PDFs not opening correctly
- Fixed mobile/iPad content viewing

### Carrier Management
- Fixed admin-entered fields not syncing to agent view
- Fixed "View Details" showing full carrier info
- Fixed contract request notifications to admin
- Fixed unappoint functionality

### ACA Management
- Fixed "Download Sample CSV" functionality
- Fixed batch period display format (MM-YYYY)
- Fixed upload history clarity (totals, clients/batch, agents/batch)
- Fixed monthly data replacement logic
- Improved error handling (unmatched agents, row-level issues)
- Fixed team tracking calculations and bonus tiers

### Production & Commission
- Fixed upline visibility into downline production
- Fixed notes display (visible without clicking edit)
- Fixed commission upload functionality

---

## 🔷 Enhancements

- Date range filters with preset buttons on production views
- Restructured Document Hub (separated onboarding docs from general resources)
- Breadcrumb navigation on document folders
- Improved ACA upload error handling and feedback
- Enhanced training materials mobile responsiveness
- Admin management panel for document hub

---

## 🔷 Admin Panel

- User management: create, edit, activate/deactivate, hierarchy view
- Agent transfer between teams with hierarchy updates
- Promotion level threshold configuration
- Product type management (add/edit/deactivate without code changes)
- Onboarding document type configuration
- Training category management
- ACA batch upload management with error reporting
- APA application review
- Branding configuration (colors, logos)
- System configuration panel
- Audit logs

---

## 🔷 Security

- JWT token authentication
- Password hashing (bcryptjs)
- Rate limiting middleware
- CORS with specific origin control
- Helmet HTTP security headers
- Joi request validation
- Role-based authorization middleware
- Secure password reset flow
- DocuSign webhook signature validation
- Full audit trail

---

## 🔷 Deployment & Infrastructure

- PM2 process management (production-ready)
- Nginx reverse proxy with SSL configuration
- Netlify support for frontend hosting
- Environment-based configuration (.env)
- 28 backend utility scripts (seeding, migrations, testing)

---

## 🔷 Summary Stats

| Metric | Count |
|---|---|
| Database Models | 28 |
| API Route Files | 24 |
| Email Templates | 7 |
| DocuSign Mapped Fields | 75 |
| Promotion Levels | 6 |
| Product Categories | 3 |
| Notification Types | 30+ |
| Backend Utility Scripts | 28 |
