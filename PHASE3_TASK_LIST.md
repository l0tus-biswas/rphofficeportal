# Phase 3 — Master Task List
**Ordered: Easiest → Hardest**  
**Each task is self-contained and sequentially numbered.**

> Codebase is Node.js / Express / MongoDB (Mongoose) backend + Angular frontend.  
> Refer to `PHASE3_ENGINEERING_PLAN.md` for full requirements context.

---

## 📋 CLIENT INFORMATION STATUS — Updated March 10, 2026

**✅ INFORMATION RECEIVED** (see *Phase 3 - Development Information Request.md* for details):

1. **Production Submission Statuses** - CONFIRMED  
   - Status flow: `Submitted → Pending → In Force → Lapsed → Cancelled`
   - Tasks unblocked: TASK 002, 003, 004

2. **Product Categories & Types** - COMPLETE LIST PROVIDED  
   - 7 main categories with full product type breakdowns
   - Categories: Life Insurance, Health Insurance, Medicare, Supplemental Insurance, Retirement/Annuities, Property & Casualty (Personal & Commercial)
   - Tasks unblocked: TASK 005, 009

3. **Carrier Lists by Category** - PROVIDED WITH IMAGES  
   - Life & Supplemental: Trans America (80%), American Amicable (90%), Assurity, Foresters, GTL, Mutual of Omaha + others
   - ACA: 48 carriers (Ambetter, Aetna, Anthem BCBS, Kaiser Permanente, UnitedHealthcare, etc.)
   - Medicare: 58 carriers (Aetna, Humana, Alignment Health, Wellcare, etc.)
   - ⚠️ ACTION: Extract exact commission factors from images before implementing TASK 010, 011
   - Tasks partially unblocked: TASK 010, 011, 012

4. **Promotion Level Structure** - IMAGES PROVIDED  
   - 8 levels: Associate (60%) → Senior National Executive (130%)
   - Producer track and Builder track thresholds shown in images
   - Skip-level promotion rules included
   - ⚠️ ACTION: Extract exact premium thresholds, agent counts, time windows from images before implementing TASK 020, 021
   - Tasks partially unblocked: TASK 020, 021, 022

5. **ACA CSV Upload Format** - IMAGE PROVIDED  
   - CSV structure screenshot included
   - ⚠️ ACTION: Extract exact column names and format before implementing TASK 018
   - Task partially unblocked: TASK 018

6. **Vistaprint Business Cards** - COMPLETE INFO PROVIDED  
   - Credentials: Rhpinsurance@gmail.com / Rhp2026!
   - Affiliate program redirect integration approach confirmed
   - English and Spanish design images provided
   - Task unblocked: TASK 025 (new)

**❌ STILL WAITING FOR:**
- ExamFX API credentials and documentation (TASK 023)
- QuickBooks integration approach confirmation (TASK 024 Phase B)

---

## TIER 1 — Quick Fixes (< 1 day each)

---

### ✅ TASK 001 — Fix Training Management Nav Icon
**Effort:** 30 min  
**File(s):** Angular admin sidebar component / nav template  
**What:** The Training Management item in the admin sidebar is missing an icon, making it visually inconsistent with all other nav items.  
**Steps:**
1. Open the admin sidebar/nav template file (likely `frontend/src/app/admin/` layout component).
2. Find the Training Management `<li>` or `<a>` nav item.
3. Add an appropriate icon — e.g., `bi-journal-text`, `fa-graduation-cap` (match whatever icon library is already used).
4. Verify it renders consistently with other nav items.

**Done when:** Training Management nav item shows an icon matching the style of adjacent items.

---

### ✅ TASK 002 — Update Production Submission Status Enum Values
**Effort:** 1–2 hours  
**File(s):** `backend/models/ProductionSubmission.js`  
**What:** The `status` field currently uses `['submitted', 'pending', 'approved', 'rejected', 'paid']`. Client requires new values: `Submitted`, `Pending`, `In Force`, `Lapsed`, `Cancelled`.  
**✅ CLIENT CONFIRMED:** Status values are confirmed as: `Submitted → Pending → In Force → Lapsed → Cancelled`  
**Steps:**
1. Open `backend/models/ProductionSubmission.js`.
2. Locate the `status` field (currently around line 72).
3. Change the `enum` array to:
   ```js
   enum: ['Submitted', 'Pending', 'In Force', 'Lapsed', 'Cancelled']
   ```
4. Change the `default` to `'Submitted'`.
5. Open `backend/routes/production.routes.js` — find any hardcoded status string references and update them.
6. Open the Angular production form component — update the status dropdown options to match the new values.
7. Write a one-time MongoDB migration script in `backend/scripts/` to update existing records:
   ```js
   // map old → new
   // 'submitted' → 'Submitted'
   // 'pending'   → 'Pending'
   // 'approved'  → 'In Force'
   // 'paid'      → 'In Force'
   // 'rejected'  → 'Cancelled'
   ```
8. Run the migration on staging and verify, then production.

**Done when:** All new submissions default to `Submitted`; dropdown shows the 5 new values; old records are migrated.

---

### ✅ TASK 003 — Add Status Field to New Production Submission Form
**Effort:** 1–2 hours  
**Depends on:** TASK 002  
**File(s):** Angular production submission form component  
**What:** The "New Submission" form currently has no status field. Agent should be able to set status when creating a submission (defaults to `Submitted`).  
**Steps:**
1. Open the Angular new-production-submission form component/template.
2. Add a `<select>` dropdown bound to the `status` form control.
3. Options: `Submitted`, `Pending`, `In Force`, `Lapsed`, `Cancelled`.
4. Default selected value: `Submitted`.
5. Ensure the `status` value is included in the POST body to `POST /api/production`.
6. Confirm the backend route accepts and saves the `status` field.

**Done when:** New submission form shows a status dropdown; submitted value is stored correctly.

---

### ✅ TASK 004 — Make Production Submission Status Editable via Edit Action
**Effort:** 1 hour  
**Depends on:** TASK 002  
**File(s):** Angular production list component (edit/pencil modal), backend production update route  
**What:** Currently the edit (pencil) action on the production list may not expose the `status` field. It must be editable for both admin and agent.  
**Steps:**
1. Open the edit-submission modal/form in Angular.
2. Ensure the `status` field is present as a dropdown (same values as TASK 003).
3. Verify the `PATCH /api/production/:id` backend route includes `status` in the allowed update fields.
4. Test that both admin and agent roles can update the status.

**Done when:** Clicking the pencil icon on any production record shows a status dropdown and saving updates it correctly.

---

### ✅ TASK 005 — Add `productCategory` Field to Production Submission
**Effort:** 2 hours  
**File(s):** `backend/models/ProductionSubmission.js`, Angular production form  
**What:** Production submissions need to be tagged by category so the promotion tracker can correctly exclude ACA and Medicare Advantage from calculations.  
**Steps:**
1. Add `productCategory` field to the Mongoose schema:
   ```js
   productCategory: {
     type: String,
     enum: ['Life & Supplemental', 'ACA', 'Medicare'],
     required: true
   }
   ```
2. Auto-derive the category based on `productSold` selection using a pre-save hook or frontend logic:
   - `Life & Supplemental`: everything except Medicare Advantage and ACA.
   - `Medicare`: Medicare Advantage.
   - `ACA`: any ACA / health insurance product.
3. Add the category as a read-only display field on the submission form (auto-populated when product is selected).
4. Update backend route to save the field.

**Done when:** Every production record has a `productCategory` value; ACA and Medicare records are excluded from Life & Supplemental promotion tracking.

---

## TIER 2 — Easy Features (1–3 days each)

---

### ✅ TASK 006 — CSV Export for Production Data
**Effort:** 1 day  
**File(s):** `backend/routes/production.routes.js`, Angular production list component  
**What:** Admin and agents need to download a CSV of their production records filtered by whatever is currently displayed.  
**Steps:**
1. Install `json2csv` or `csv-express` in the backend: `npm install json2csv`.
2. Add a new route: `GET /api/production/export` that:
   - Accepts the same query params as the list endpoint (date range, status, carrier, agent).
   - Applies the same role-based access filtering.
   - Returns a `Content-Disposition: attachment; filename="production.csv"` response.
   - Columns: Agent Name, Client Name, Product, Product Category, Carrier, Premium Amount, Status, Submission Date, Notes.
3. In Angular, add a **Download CSV** button on the production tab.
4. On click, call the export endpoint with current active filters and trigger a file download.

**Done when:** Clicking "Download CSV" downloads a valid CSV reflecting current filters.

---

### ✅ TASK 007 — Training Material: Add PDF Attachment Support
**Effort:** 1 day  
**File(s):** `backend/models/TrainingMaterial.js`, training routes, Angular training admin form  
**What:** Each training material should support an optional PDF attachment in addition to its video/link URL.  
**Steps:**
1. Add `pdfAttachment` field to `TrainingMaterial` schema:
   ```js
   pdfAttachment: {
     fileName: String,
     filePath: String,
     uploadedAt: { type: Date, default: Date.now }
   }
   ```
2. Update the training material upload route to handle multipart form data (use existing `multer` setup already in the project).
3. In the Angular training admin form, add a file input for PDF upload.
4. In the agent-facing training view, display a **Download PDF** link/button below each material that has an attachment.

**Done when:** Admin can attach a PDF to a training material; agents see a download link on the material card.

---

### ✅ TASK 008 — Training Material: Support Loom Embed
**Effort:** 2–3 hours  
**File(s):** `backend/models/TrainingMaterial.js`, Angular training view component  
**What:** The training material type enum has `youtube` but not `loom`. Loom URLs need to be embeddable in an `<iframe>`.  
**Steps:**
1. Add `'loom'` to the `type` enum in `TrainingMaterial.js`.
2. In the Angular training card/detail component, add logic:
   - If `type === 'loom'`: convert the Loom share URL to its embed URL format (`https://www.loom.com/share/ID` → `https://www.loom.com/embed/ID`) and render in `<iframe>`.
   - If `type === 'youtube'`: use existing YouTube embed logic.
   - If `type === 'link'` or `'document'`: show a link/button.
3. Update the admin form to show a `Loom` option in the type dropdown.

**Done when:** Loom URLs embed and play inside the platform without opening an external tab.

---

### ✅ TASK 009 — Product Management Admin UI
**Effort:** 2 days  
**File(s):** New model `backend/models/ProductType.js`, new routes, Angular admin section  
**What:** Admin needs to add/edit/deactivate product types without developer changes. This mirrors the existing Carrier Management UI.  
**✅ CLIENT PROVIDED:** Complete list of product categories and types (see TASK 005).  
**Steps:**
1. Create `backend/models/ProductType.js`:
   ```js
   {
     name: { type: String, required: true, unique: true, trim: true },
     category: { 
       type: String, 
       enum: ['Life Insurance', 'Health Insurance', 'Medicare', 'Supplemental Insurance', 'Retirement / Annuities', 'Property & Casualty - Personal', 'Property & Casualty - Commercial'], 
       required: true 
     },
     isActive: { type: Boolean, default: true },
     addedBy: { type: ObjectId, ref: 'User' }
   }
   ```
2. Seed it with all product types from the client-provided list (see TASK 005 for complete list).
3. Create `backend/routes/admin-products.routes.js` with:
   - `GET /api/admin/products` — list all
   - `POST /api/admin/products` — create
   - `PUT /api/admin/products/:id` — update
   - `DELETE /api/admin/products/:id` — soft-delete (set `isActive: false`)
4. Register the routes in `server.js`.
5. Build Angular admin "Product Management" page (copy/adapt the Carrier Management component).
6. Update the production submission form: replace the hardcoded `productSold` `<select>` with a dynamic list fetched from `GET /api/admin/products`. Auto-populate `productCategory` based on the selected product's category.
7. Remove the hardcoded `enum` from `ProductionSubmission.js` `productSold` field (or keep as soft validation, pull real constraint from `ProductType`).

**Done when:** Admin can add/edit/deactivate product types; production form dropdown is dynamically driven.

---

## TIER 3 — Medium Features (3–7 days each)

---

### ✅ TASK 010 — Carrier Schema Overhaul (Add Category, Factor, Instructions)
**Effort:** 2 days  
**File(s):** `backend/models/Carrier.js`, carrier routes, Angular admin carrier form  
**What:** Carriers need new fields: product category, commission factor %, contracting link/instructions, and a "What to Expect" section.  
**✅ CLIENT PROVIDED:** Complete carrier lists by category with factor information in attached images.  

**Life & Supplemental Carriers (factors in images):**
- Trans America (80%)
- American Amicable (90%)
- Assurity (multiple products with varying factors - see images)
- Foresters (multiple products - see images)
- GTL (supplemental carrier - factors in images)
- Mutual of Omaha (multiple products - see images)
- *Note: Client provided detailed commission schedules for each carrier with multiple product types. See Phase 3 Development Information Request.md for image references.*

**ACA Carriers:**
Ambetter (Centene), Aetna/Aetna CVS Health, Alignment Health Plan, AmeriHealth, Anthem BCBS/Elevance Health, AvMed, Blue Cross Blue Shield Plans, Blue Shield of California, CareSource, Capital BlueCross, Celtic Insurance Company, Cigna Healthcare, Community Health Choice, Dean Health Plan, EmblemHealth, Excellus BCBS, Fallon Health, Florida Blue, Harvard Pilgrim Health Care, Health Alliance Medical Plans, Health First Health Plans, Health Net, Highmark BCBS, Horizon BCBS, Independence Blue Cross, Kaiser Permanente, L.A. Care Health Plan, Medica, MercyCare HMO, Molina Healthcare, MVP Health Care, Neighborhood Health Plan of RI, Oscar Health, PacificSource Health Plans, Presbyterian Health Plan, Priority Health, Quartz Health Solutions, Regence BlueShield, Sanford Health Plan, Security Health Plan, SelectHealth, Sharp Health Plan, Simply Healthcare/Wellpoint, UCare, UnitedHealthcare, University of Utah Health Plans, Wellmark BCBS

**Medicare Carriers:**
Aetna, Alignment Health, AmeriHealth, AmeriHealth Caritas, Anthem, Asuris Northwest Health, BayCare Plus, Blue Cross Blue Shield, Capital Blue Cross, CareFirst, CareSource, Cigna, Clear Spring Health, Clever Care Health Plan, Clover Health, Devoted Health, Elderplan, EmblemHealth, Essence Healthcare, Excellus, Florida Blue, Freedom Health, Geisinger Health Plan, Health First Health Plans, Highmark, Horizon, Humana, Independence Blue Cross, Jefferson Health Plans, Johns Hopkins Healthcare, Kaiser Permanente, Keystone First VIP Choice, Medica, Medical Mutual, MediGold, MetroPlus Health, Molina Healthcare, Mutual of Omaha, MyTru Advantage, PacificSource, Paramount Elite, Priority Health, Providence Health Plan, Regence, SCAN Health Plan, Sentara Health Plans, Simply Healthcare, Sonder Health, SummaCare, The Health Plan, UCLA Health, UnitedHealthcare, Univera Healthcare, UPMC Health Plan, VillageCareMAX, VNS Health, Wellcare, Wellpoint, Zing Health

**Steps:**
1. Extend `backend/models/Carrier.js` with new fields:
   ```js
   category: {
     type: String,
     enum: ['Life Insurance', 'Health Insurance', 'Medicare', 'Supplemental Insurance'],
     required: true
   },
   // For carriers with multiple products/factors, store as a JSON object or separate ProductFactor subdocuments
   factor: {
     type: Number, // default/base commission percentage e.g. 80 = 80%
     min: 0,
     max: 200
   },
   // NEW: Support for multiple products with different factors
   productFactors: [{
     productName: String,
     factor: Number,
     level: String // for supplemental products (Level 1, Level 2, etc.)
   }],
   contractingLink: { type: String, trim: true },
   contractingInstructions: { type: String },
   whatToExpect: { type: String },
   // NEW: Support for supplemental level mapping guides
   supplementalLevelGuide: { type: String } // path to uploaded guide PDF
   ```
2. Update `PUT /api/carriers/:id` and `POST /api/carriers` to accept these fields. Add admin-only guard on `factor`, `productFactors`, `contractingLink`, `contractingInstructions`, `whatToExpect`.
3. Update the Angular admin Carrier Management form to:
   - Include inputs for all new fields
   - Support adding multiple product/factor pairs for carriers with varying commission structures
   - Allow PDF upload for supplemental level guides (GTL, Assurity, etc.)
4. Migration: Seed all carriers from the client-provided lists. For Life & Supplemental carriers, manually enter factor data from provided images into the database.
5. **IMPORTANT:** Review all images in Phase 3 Development Information Request.md to extract exact factor values for each carrier/product combination.

**Done when:** Admin can set category, factor(s), and instructions for any carrier. Multi-product carriers support varying factors. Supplemental carriers have level guide attachments.

---

### ✅ TASK 011 — Carrier Tab: Four-Category View (Agent Side)
**Effort:** 2 days  
**Depends on:** TASK 010  
**File(s):** Angular agent carrier/appointments component  
**What:** The agent-facing Carrier tab should show four tabs: Life Insurance, Supplemental Insurance, Health Insurance (ACA), Medicare — each listing the relevant carriers.  
**✅ CLIENT PROVIDED:** Complete carrier lists for all categories (see TASK 010).
**Steps:**
1. Update the `GET /api/carriers` endpoint to support filtering by `?category=Life Insurance` / `Supplemental Insurance` / `Health Insurance` / `Medicare`.
2. In Angular, replace the flat carrier list with a four-tab layout (use `<mat-tab-group>` or Bootstrap nav-tabs):
   - **Life Insurance** tab
   - **Supplemental Insurance** tab (includes carriers like GTL, Assurity with level guides)
   - **Health Insurance (ACA)** tab
   - **Medicare** tab
3. Each tab fetches and displays carriers for its category.
4. Each carrier card shows: 
   - Name
   - Factor % (or link to detailed commission schedule for multi-product carriers)
   - Contracting Link (clickable button) or Instructions text
   - "What to Expect" collapsible section
   - Agent's status with that carrier (TASK 012)
   - For supplemental carriers: Download link to level guide PDF if available
5. For carriers with multiple product factors, show a collapsible table or modal with all products and their respective factors.

**Done when:** Agent sees four tabs on the Carrier page; clicking a tab filters to that product category; supplemental carriers show level guides.

---

### ✅ TASK 012 — Agent Carrier Status (Request Contract / Appointed)
**Effort:** 1–2 days  
**Depends on:** TASK 010, TASK 011  
**File(s):** New model `backend/models/AgentCarrierStatus.js`, new routes  
**What:** Each agent has an individual status with each carrier: `Requested` or `Appointed`. Agents click "Request Contract"; admin marks them as "Appointed."  
**Steps:**
1. Create `backend/models/AgentCarrierStatus.js`:
   ```js
   {
     agent: { type: ObjectId, ref: 'User', required: true },
     carrier: { type: ObjectId, ref: 'Carrier', required: true },
     status: { type: String, enum: ['Requested', 'Appointed'], default: 'Requested' },
     requestedAt: { type: Date, default: Date.now },
     appointedAt: Date,
     appointedBy: { type: ObjectId, ref: 'User' }
   }
   // Compound unique index: { agent: 1, carrier: 1 }
   ```
2. Routes:
   - `POST /api/carriers/:carrierId/request` — agent requests a contract (creates record or no-ops if already requested).
   - `PUT /api/admin/carrier-status/:id/appoint` — admin marks as appointed.
   - `GET /api/carriers/my-statuses` — agent gets all their carrier statuses (for displaying current state on the UI).
3. In Angular carrier card (TASK 011): show a **Request Contract** button if no status exists; show status badge (`Requested` / `Appointed`) if status exists.
4. In admin User Management or a new "Carrier Appointments" admin page: list all pending requests and allow marking as Appointed.

**Done when:** Agent can request a contract; admin can appoint them; status badge updates on the carrier card.

---

### ✅ TASK 013 — Commission Statements Tab
**Effort:** 2–3 days  
**File(s):** New model `backend/models/CommissionStatement.js`, new routes, Angular agent portal  
**What:** Admin uploads PDF commission statements per agent/carrier/pay period. Agents view and download their own statements.  
**Steps:**
1. Create `backend/models/CommissionStatement.js`:
   ```js
   {
     agent: { type: ObjectId, ref: 'User', required: true },
     carrier: { type: String, required: true }, // plain string, no foreign key needed
     payPeriod: { type: Date, required: true },  // week-ending date
     filePath: { type: String, required: true },
     originalFileName: String,
     uploadedBy: { type: ObjectId, ref: 'User' },
     uploadedAt: { type: Date, default: Date.now }
   }
   ```
2. Routes:
   - `POST /api/admin/commission-statements` — multipart upload (PDF + metadata). Admin only.
   - `GET /api/commission-statements` — agent gets their own; supports `?carrier=&from=&to=` filters.
   - `GET /api/commission-statements/:id/download` — returns the PDF file (auth required, agent can only access own).
3. Use the existing `multer` storage setup; store under `uploads/commission-statements/`.
4. In Angular, add a **Commissions** tab to the agent sidebar.
5. Tab displays a filterable list (carrier dropdown, date range): each row shows date, carrier, and a **View Statement** button that opens the PDF.
6. In admin panel, add a **Upload Commission Statement** form (select agent, enter carrier string, pick pay date, attach PDF).

**Done when:** Admin can upload a statement; agent sees it under Commissions and can open the PDF.

---

### ✅ TASK 014 — Onboarding Document Hub
**Effort:** 3 days  
**File(s):** New models `OnboardingDocType.js` + `OnboardingDocument.js`, new routes, Angular onboarding component  
**What:** Replace/enhance the current onboarding tab with a structured document hub — card-based UI for APA Agreement, CMS Certificate, E&O Insurance, W-9, Direct Deposit, and any others admin configures.  
**Steps:**
1. Create `backend/models/OnboardingDocType.js`:
   ```js
   {
     name: { type: String, required: true }, // e.g. 'CMS Certificate'
     required: { type: Boolean, default: false },
     agentCanUpload: { type: Boolean, default: true },
     agentCanDelete: { type: Boolean, default: true },
     isReadOnlyLink: { type: Boolean, default: false }, // true for APA Agreement
     sortOrder: { type: Number, default: 0 },
     isActive: { type: Boolean, default: true }
   }
   ```
2. Seed 5 default document types: APA Agreement (`isReadOnlyLink: true`, `agentCanUpload: false`, `agentCanDelete: false`), CMS Certificate, E&O Insurance, W-9, Direct Deposit.
3. Create `backend/models/OnboardingDocument.js`:
   ```js
   {
     agent: { type: ObjectId, ref: 'User', required: true },
     docType: { type: ObjectId, ref: 'OnboardingDocType', required: true },
     filePath: String,
     externalLink: String, // for APA Agreement (DocuSign signed URL)
     uploadedBy: { type: ObjectId, ref: 'User' },
     uploadedAt: { type: Date, default: Date.now },
     deletedAt: Date
   }
   ```
4. Routes:
   - `GET /api/onboarding/doc-types` — list all active doc types.
   - `POST /api/onboarding/documents` — upload a document (agent, upline, or admin).
   - `GET /api/onboarding/documents/:agentId` — list all documents for an agent (with access control: own or upline or admin).
   - `DELETE /api/onboarding/documents/:id` — delete (respect `agentCanDelete` flag).
   - `GET /api/admin/onboarding/doc-types` — admin CRUD for document types.
5. Auto-link APA Agreement: when an agent's DocuSign envelope is completed (existing DocuSign webhook), create an `OnboardingDocument` record with the `externalLink` pointing to the signed document URL.
6. In Angular, replace/augment the onboarding tab with a grid of document cards.
   - Each card shows the document type name, upload status (uploaded / missing), upload date.
   - Cards with `isReadOnlyLink: true` show a **View** button (no upload option).
   - Other cards show **Upload** button (if not yet uploaded) and **View / Download** + **Delete** (if uploaded).
7. Admin panel: add an "Onboarding Document Types" management page (add/edit/reorder/deactivate).
8. Log all upload/delete events to the existing `AuditLog` model (actor + agentId + docType + action).

**Done when:** Agent sees document cards for all configured types; can upload/view/delete allowed documents; APA Agreement appears automatically as a read-only link after signing.

---

### ✅ TASK 015 — Dashboard Next Steps Checklist
**Effort:** 2 days  
**Depends on:** TASK 014  
**File(s):** Angular dashboard component, new `GET /api/dashboard/checklist` endpoint  
**What:** A "Next Steps" widget on the agent dashboard showing actionable tasks with a completion progress bar.  
**Steps:**
1. Create `GET /api/dashboard/checklist` that returns a list of checklist items with `{label, completed, link}` for the authenticated agent:
   - **Unlicensed agents:**
     - "Get your insurance license" — completed when `user.isLicensed === true`
     - "Study on ExamFX" — static link, never auto-complete
   - **Licensed agents:**
     - "Upload W-9" — completed when OnboardingDocument record exists for W-9 type
     - "Upload Direct Deposit" — completed when OnboardingDocument record exists
     - "Upload E&O Insurance" — completed when OnboardingDocument record exists
     - "Upload CMS Certificate" — completed when OnboardingDocument record exists
     - "Request Carrier Appointments" — completed when agent has ≥1 `AgentCarrierStatus` record
     - "Complete W-9 / Direct Deposit via QuickBooks" — link to QuickBooks invite URL (static, configured by admin in SystemConfig)
2. Store the QuickBooks invite URL in the existing `SystemConfig` model so admin can edit it.
3. In Angular dashboard, add a `NextStepsChecklistComponent`:
   - Show above existing dashboard content (below promotion tracker in TASK 020).
   - List each step with a checkbox icon (green check if done, grey circle if not).
   - Show a linear progress bar: X of N steps completed.
   - Each step label can be a clickable link if a `link` is provided.
4. Hide the widget entirely once all steps are complete.

**Done when:** Agent sees a personalised checklist on login; items check off automatically as they complete actions.

---

### ✅ TASK 016 — Upline Visibility Rules
**Effort:** 2 days  
**File(s):** `backend/routes/production.routes.js`, agent/downline routes, `backend/utils/helpers.js`  
**What:** An upline (recruiter) must always be able to view their entire downline's production data (premium totals, recruit counts, promotion level) — but NOT client names.  
**Steps:**
1. Create a helper `getDownlineIds(userId)` in `backend/utils/helpers.js` that recursively traverses the `referredBy` / `children` relationship and returns all descendant agent IDs.
2. Update `GET /api/production` to support a `?scope=team` query param:
   - If `scope=team` and the requesting agent has downline agents, return their aggregated production (sum of premium, count of submissions) grouped by agent sub-document.
   - **Strip `clientName` from all returned records** when the requester is an upline (not the agent's own record).
3. Update the downline/team report endpoint (or create `GET /api/production/team-report`) to accept a `?window=30` rolling window and return: total premium In Force, number of active agents, number of new recruits — for the full downline.
4. In Angular, add a **Team Report** button/section on the production or downline tab that calls this endpoint and displays results.
5. Ensure admin can also access any agent's data.

**Done when:** Uplines see team production totals and individual downline breakdowns without seeing client names.

---

### ✅ TASK 017 — Agent Transfer Between Teams (Admin)
**Effort:** 1 day  
**File(s):** `backend/routes/admin.routes.js`, Angular admin user management component  
**What:** Admin can reassign an agent's upline/recruiter via the User Management panel.  
**Steps:**
1. Create `PUT /api/admin/users/:id/transfer`:
   - Body: `{ newUplineId: "..." }`
   - Update the agent's `referredBy` field to `newUplineId`.
   - Remove the agent's ID from the old upline's `children` array.
   - Add the agent's ID to the new upline's `children` array.
   - Log the transfer in `AuditLog` with old and new upline IDs.
2. In Angular admin User Management, add a **Transfer Agent** button on each agent row.
3. Clicking opens a modal with a searchable dropdown of all active agents (excluding the agent being transferred).
4. Confirm dialog: "Transfer [Agent Name] from [Old Upline] to [New Upline]?"
5. On confirm, call the API and refresh the list.

**Done when:** Admin can move an agent to a new upline from the UI; hierarchy updates immediately.

---

## TIER 4 — Hard Features (1–2 weeks each)

---

### ✅ TASK 018 — ACA Client Volume Tracker (Dashboard Widget)
**Effort:** 4–5 days  
**File(s):** `backend/models/ACAClientRecord.js`, ACA routes, Angular dashboard + admin panel  
**What:** Monthly Verified Totals via admin-only CSV upload. Does **not** modify individual production submissions. Stores verified ACA member counts, In Force premium, and producing-agent counts. The dashboard widget displays **Reported vs Verified** totals so agents can compare self-reported production against carrier-verified numbers.

**⚠️ CLIENT CONFIRMED (Final):** CSV format provided — one row per client with columns: `first_name`, `last_name`, `issuer`, `agent`, `household_size`. Order required: 1) first_name, 2) last_name, 3) issuer, 4) agent, 5) household_size.

---

#### A. Data Model

**`backend/models/ACAClientRecord.js`** — stores per-agent verified totals from each monthly upload:
```js
{
  agent: { type: ObjectId, ref: 'User', required: true },
  clientCount: { type: Number, required: true },        // verified ACA members (sum of household_size)
  verifiedPremium: { type: Number, default: 0 },        // verified In Force premium ($) — derived or entered
  isProducing: { type: Boolean, default: true },         // agent had ≥1 client row → counted as producing
  uploadedBy: { type: ObjectId, ref: 'User' },
  uploadBatch: { type: String },                         // ISO month, e.g. '2026-03'
  uploadedAt: { type: Date, default: Date.now },
  source: { type: String, default: 'csv' }
}
```
- Always keep full upload history. Query for the latest batch when displaying.

---

#### B. Admin CSV Upload

**`POST /api/admin/aca-clients/upload`** (admin only):
1. Accepts a multipart CSV file.
2. CSV columns (in order): `first_name`, `last_name`, `issuer`, `agent`, `household_size`.
3. Parse using `csv-parse`.
4. **Group rows by `agent` name** → sum `household_size` per agent group → that sum becomes the agent's `clientCount`.
5. Match each agent name to a `User` document (case-insensitive, partial name fallback).
6. For **unmatched** agent groups, return them in the response — do NOT silently skip.
7. Upsert `ACAClientRecord` per matched agent with the current `uploadBatch` month.
8. Response includes: `{ matched, unmatchedCount, unmatched[], totalClientRows, agentGroupsFound }`.

---

#### C. Dashboard Widget — Reported vs Verified

**`GET /api/dashboard/aca-tracker`** returns for the requesting agent (own + full downline):

| Field | Source | Description |
|---|---|---|
| `reportedClientCount` | `ProductionSubmission` where `productCategory === 'ACA'` and `status === 'In Force'` | Self-reported count from agent submissions |
| `verifiedClientCount` | `ACAClientRecord` latest batch | Carrier-verified count from admin CSV |
| `reportedPremium` | Sum of `premiumAmount` from ACA In Force submissions | Self-reported premium total |
| `verifiedPremium` | `ACAClientRecord.verifiedPremium` latest batch | Carrier-verified premium |
| `reportedProducingAgents` | Distinct agents in downline with ≥1 ACA In Force submission | Self-reported producing count |
| `verifiedProducingAgents` | Count of `ACAClientRecord` in latest batch where `isProducing === true` and agent is in downline | Verified producing count |
| `currentTier` | Derived from `verifiedClientCount` | Bonus tier (0–3) |
| `uploadBatch` | Latest batch string | e.g. '2026-03' |
| `uploadedAt` | Latest upload timestamp | Date of last admin CSV upload |

- **Tier logic (based on verified count):** 0–999 → Tier 0 ($0); 1000–1999 → Tier 1 ($1/client); 2000–2999 → Tier 2 ($2/client); 3000+ → Tier 3 ($3/client).

---

#### D. Angular Dashboard — `AcaTrackerComponent`

Place below the promotion bars on the agent dashboard:
1. **Three stat cards** side by side:
   - **ACA Members:** Reported X | Verified Y
   - **In Force Premium:** Reported $X | Verified $Y
   - **Producing Agents:** Reported X | Verified Y
2. Colour-code each pair: green if verified ≥ reported, amber/red if verified < reported.
3. Progress bar from current Tier threshold to next Tier threshold (based on **verified** count).
4. Display: current tier label, bonus rate, estimated bonus amount.
5. Disclaimer: *"Verified totals are updated monthly from carrier data. Subject to monthly verification."*
6. Show the date of last admin CSV upload.

---

#### E. Admin Panel — ACA Management Page

Route: `/admin/aca-management`
1. **CSV Upload section:** file input, upload button, format description showing expected columns.
2. **Upload Results section:** after upload, show 3-stat summary (total client rows, agent groups found, matched/unmatched counts) + table of unmatched agent names.
3. **Batch History section:** list of previous upload batches with date and agent count.

---

**Done when:** Admin uploads monthly CSV; agent dashboard shows Reported vs Verified totals for ACA members, premium, and producing agents; tier progress uses verified count; unmatched rows surface to admin.

---

### TASK 019 — Transactional Email Service Setup + Daily Licensing Countdown Email
**Effort:** 3 days  
**File(s):** `backend/utils/email.js`, `.env` / config, `backend/server.js` (cron setup)  
**What:** Replace personal-alias email sending with a professional transactional service. Add daily emails to unlicensed agents.  
**Steps:**
1. **Email provider setup:**
   - Sign up for SendGrid (recommended) or Brevo free tier.
   - Create a Sender Identity for `contracting@rhpoffice.com`.
   - Create the mailbox `contracting@rhpoffice.com` in Hostinger DNS (SMTP credentials).
   - Add SPF/DKIM DNS records in Hostinger for the chosen provider.
   - Save the API key in `.env` as `SENDGRID_API_KEY=` (or `BREVO_API_KEY=`).
2. **Update `backend/utils/email.js`:**
   - Install: `npm install @sendgrid/mail` (or `npm install nodemailer` + Brevo SMTP).
   - Replace the current sending transport with SendGrid API or SMTP credentials.
   - Set `from: 'contracting@rhpoffice.com'` on all outgoing messages.
   - Test by triggering an existing email (e.g., welcome email) on staging.
3. **Daily licensing countdown cron job:**
   - Install `node-cron`: `npm install node-cron`.
   - Add to `server.js` or a dedicated `backend/jobs/scheduler.js`:
     ```js
     cron.schedule('0 9 * * *', async () => { // 9am daily
       const unlicensedAgents = await User.find({ isLicensed: false, isActive: true });
       for (const agent of unlicensedAgents) {
         const daysRemaining = calculateDaysRemaining(agent.licensingDeadline);
         await sendEmail({
           to: agent.email,
           subject: `Your licensing countdown: ${daysRemaining} days remaining`,
           html: `<p>Hi ${agent.name}, you have <strong>${daysRemaining} days</strong> remaining to obtain your license...</p>`
         });
       }
     });
     ```
   - Determine the `licensingDeadline` field — add it to `User` model if not present.
4. Import and start the scheduler in `server.js`.

**Done when:** All system emails arrive from `contracting@rhpoffice.com`; unlicensed agents receive a daily countdown email.

---

### TASK 020 — Dashboard Promotion Tracker — Producer Track
**Effort:** 5 days  
**File(s):** New model `PromotionLevel.js`, new routes, Angular dashboard, admin panel  
**What:** The first progress bar showing an agent's personal In Force Life & Supplemental premium vs. the next promotion threshold, with rolling time window.  
**⚠️ CLIENT PROVIDED:** Promotion level images with thresholds and skipping rules provided - see Phase 3 Development Information Request.md for Producer and Builder track images. Extract exact values before implementation.  
**Steps:**
1. Create `backend/models/PromotionLevel.js`:
   ```js
   {
     name: { type: String, required: true },  // e.g. 'Associate'
     rank: { type: Number, required: true },   // 1 = lowest
     commissionLevel: { type: Number },        // e.g. 60, 70, 80, etc.
     producerPremiumThreshold: { type: Number, required: true },
     producerWindowDays: { type: Number, default: 30 },
     builderPremiumThreshold: { type: Number, required: true },
     builderAgentCountThreshold: { type: Number, required: true },
     builderWindowDays: { type: Number, default: 60 },
     canSkipTo: { type: Boolean, default: false }, // for skip-level promotion rules
     skipRequirements: { type: String } // description of skip conditions from images
   }
   ```
2. **IMPORTANT:** Review promotion level images in Phase 3 Development Information Request.md to extract:
   - Exact premium thresholds for Producer track
   - Exact premium thresholds for Builder track
   - Active agent count requirements for Builder track
   - Time windows for each level
   - Rules for skipping promotion levels
   - Commission percentages for each level (60%, 70%, 80%, 90%, 100%, 110%, 120%, 130%)

3. Seed promotion levels with data from images:
   - Associate (60%) - starting level
   - Senior Associate (70%)
   - Manager (80%)
   - Senior Manager (90%)
   - Regional Executive (100%)
   - Senior Regional Executive (110%)
   - National Executive (120%)
   - Senior National Executive (130%)

3. Create `GET /api/dashboard/promotion-tracker?window=30`:
   - Look up the agent's `level` field → find the corresponding `PromotionLevel` by name.
   - Find the next level (rank + 1).
   - Aggregate: sum of `premiumAmount` for all `ProductionSubmission` records where:
     - `agent === requestingAgent._id`
     - `status === 'In Force'`
     - `productCategory === 'Life & Supplemental'`
     - `submissionDate >= (today - window days)`
   - Return: `{ currentLevel, nextLevel, currentPremium, targetPremium, windowDays, progressPercent }`.
4. In Angular, create `PromotionTrackerComponent`:
   - Two panels side-by-side (or stacked on mobile): Producer bar (this task) + Builder bar (TASK 021).
   - Producer bar: label with current level name → progress bar → label with next level name.
   - Show `$X,XXX / $Y,XXX in force premium` below the bar.
   - Time-window dropdown: `1 Month | 2 Months | 3 Months | 4 Months | 5 Months | 6 Months`. Default from `PromotionLevel.producerWindowDays`.
   - Changing the dropdown re-fetches from the API with updated `?window=` param.
5. Place the component at the top of the agent dashboard template.
6. Admin panel — Promotion Level Config page: table of 6 levels with editable threshold and window fields. Save updates via `PUT /api/admin/promotion-levels/:id`.

**Done when:** Agent dashboard shows the Producer progress bar; changing the dropdown updates the bar; admin can edit thresholds.

---

### TASK 021 — Dashboard Promotion Tracker — Builder Track
**Effort:** 3 days  
**Depends on:** TASK 020  
**What:** The second progress bar tracking the Builder path: (a) team In Force premium and (b) number of active producing downline agents, both within the rolling window.  
**⚠️ CLIENT PROVIDED:** Builder track requirements in promotion level images - extract exact premium and agent count thresholds for each level.  
**Steps:**
1. Extend `GET /api/dashboard/promotion-tracker` response to also include:
   - **Builder Premium:** sum of `premiumAmount` for all `ProductionSubmission` where the `agent` is in the requesting agent's downline (`getDownlineIds()` helper from TASK 016) AND `status === 'In Force'` AND `productCategory` in ['Life Insurance', 'Supplemental Insurance', 'Retirement / Annuities'] AND within the time window.
   - **Active Builder Agents:** count of distinct agents in the downline who have ≥1 qualifying In Force submission in the window.
   - Return: `{ builderPremium, targetBuilderPremium, activeAgents, targetAgentCount, builderWindowDays }`.
   - **IMPORTANT:** Review builder promotion images to determine exact requirements for each level.
2. Note: `getDownlineIds()` may return a large list — use `$in` query with indexed `agent` field. Consider caching the downline ID list in Redis (TTL 5 minutes) for performance.
3. In `PromotionTrackerComponent`, add the Builder panel:
   - Left side of bar: active agents count (X / Y agents).
   - Right side of bar: team premium (X / Y premium).
   - Both use the same time-window dropdown (shared or independent — confirm with client).
   - Current level / next level labels displayed.
   - Implement skip-level promotion logic based on rules from images.
4. Add in-app notification trigger: after any production status is updated to `In Force`, run a background check — if the submitting agent's upline now meets the next promotion threshold (producer or builder), create a `Notification` record for the admin.

**Done when:** Builder bar appears on dashboard alongside Producer bar; active agent count and team premium both shown with correct targets; skip-level promotions work correctly.

---

### TASK 022 — Promotion Threshold Admin Config UI
**Effort:** 1 day  
**Depends on:** TASK 020  
**File(s):** Angular admin panel  
**What:** Admin UI to view and edit promotion level names, premium thresholds, agent count thresholds, and default time windows.  
**✅ CLIENT PROVIDED:** Initial promotion level data in images - use to seed the system.  
**Steps:**
1. Add `GET /api/admin/promotion-levels` and `PUT /api/admin/promotion-levels/:id` routes (protect with admin middleware).
2. In Angular admin panel, add a **Promotion Levels** configuration page:
   - Table with 8 rows (one per level from Associate to Senior National Executive).
   - Editable columns: Level Name, Commission %, Producer Premium Threshold, Producer Window (days), Builder Premium Threshold, Builder Agent Count, Builder Window (days), Skip-Level Enabled, Skip Requirements.
   - Inline editing with a Save button per row, or a single Save All.
3. Validate that rank order and names don't conflict.
4. Display current skip-level promotion rules for reference.

**Done when:** Admin can update all promotion thresholds from the UI without code changes.

---

## TIER 5 — Complex Integrations (Research required)

---

### TASK 023 — ExamFX API Integration (Licensing Tab)
**Effort:** 3–5 days (plus spiking API)  
**File(s):** New `backend/utils/examfx.js` service, licensing routes, Angular licensing tab  
**What:** Display each agent's ExamFX study progress (chapters, pre-licensing activity) inside their RHP Office licensing tab.  

> ⚠️ **Prerequisite:** Confirm ExamFX provides a REST API for manager-level accounts. Obtain API credentials and documentation from the client before starting.

**Steps:**
1. **API spike (Day 1):** Review ExamFX API docs. Identify endpoints for:
   - Listing all learners under a manager account.
   - Getting chapter/module progress per learner.
   - Authentication method (API key, OAuth, etc.).
2. Create `backend/utils/examfx.js`:
   - `listLearners()` — fetch all learners from the admin's ExamFX account.
   - `getLearnerProgress(learnerId)` — fetch chapter-level progress.
   - Add in-memory or Redis caching with a 1-hour TTL (avoid hitting the API on every dashboard load).
3. Create a sync service `backend/jobs/examfxSync.js`:
   - Run on a schedule (e.g., every 4 hours) or on-demand.
   - Match ExamFX learners to `User` records by email (preferred) or name.
   - Store matched progress in a lightweight `ExamFXProgress` sub-document or separate collection.
4. Expose `GET /api/licensing/examfx-progress` (agent gets own; admin can query any agent).
5. In Angular licensing tab, add an "ExamFX Progress" section:
   - Show chapter/module cards with completion status.
   - Show overall completion percentage.
   - Note: "Data refreshes every 4 hours."
6. For unmatched learners, surface a warning in the admin licensing management page.

**Done when:** Agent's licensing tab shows their ExamFX chapter progress, updated on the sync schedule.

---

### TASK 024 — QuickBooks Contractor Integration
**Effort:** 2–4 days (scope-dependent)  
**File(s):** Angular dashboard checklist (TASK 015), `SystemConfig` model, optional backend QuickBooks service  
**What:** Allow agents to submit W-9 and direct deposit info via QuickBooks contractor invite, accessible from the Next Steps checklist.  

> ⚠️ **Prerequisite:** Confirm with client whether a static QuickBooks invite link is sufficient, or whether full API-based contractor creation is required. Start with the link approach.

**Phase A — Static Invite Link (2 hours):**
1. Admin generates a contractor invite link in QuickBooks (Payroll → Contractors → Invite contractor).
2. Admin saves the link in `SystemConfig` under key `quickbooksContractorInviteUrl`.
3. In the Next Steps checklist (TASK 015), the "Submit W-9 / Direct Deposit" step links to this URL.

**Phase B — API Automation (3–4 days, if required):**
1. Register an app in the Intuit Developer Portal; obtain Client ID and Client Secret.
2. Implement QuickBooks OAuth 2.0 flow (admin one-time auth): `GET /api/admin/quickbooks/connect`.
3. Store tokens in `SystemConfig`. Implement token refresh.
4. On agent account approval, call QuickBooks API `POST /v3/company/{realmId}/vendor` to create the contractor with agent name and email.
5. QuickBooks then sends the agent a contractor onboarding email automatically.
6. Mark `quickbooksLinked: true` on the User record; check this flag to mark the checklist step as complete.

**Done when (Phase A):** Next Steps checklist links to the QuickBooks invite URL.  
**Done when (Phase B):** New agents are automatically added as QuickBooks contractors on account approval.

---

### TASK 025 — Vistaprint Business Cards Integration
**Effort:** 1–2 days  
**File(s):** Angular agent portal, SystemConfig model, new business cards component  
**What:** Allow agents to order business cards through Vistaprint affiliate integration with pre-designed templates (English and Spanish versions).  
**✅ CLIENT PROVIDED:** Vistaprint credentials and business card designs (English and Spanish) - see Phase 3 Development Information Request.md for images.  
**Credentials:** Rhpinsurance@gmail.com / Rhp2026!  
**Integration Method:** Redirect Integration via Vistaprint Affiliate Program  
**Steps:**
1. **Vistaprint Affiliate Setup:**
   - Register/login to Vistaprint Affiliate Program using provided credentials.
   - Obtain affiliate tracking links for business card products.
   - Configure redirect URLs and tracking parameters.
   
2. **Template Management:**
   - Extract business card design specifications from the two design images (English and Spanish) in Phase 3 Development Information Request.md.
   - Store template configurations in `SystemConfig` model:
     ```js
     vistaprintConfig: {
       affiliateId: String,
       englishTemplateUrl: String,
       spanishTemplateUrl: String,
       baseUrl: String,
       trackingParams: Object
     }
     ```
   
3. **Frontend Implementation:**
   - Create an Angular "Business Cards" component in agent portal.
   - Show preview images of both templates (English and Spanish).
   - Each template has an "Order Now" button.
   - On click, construct Vistaprint redirect URL with:
     - Affiliate tracking parameters
     - Agent's information (pre-fill name, title, contact info via URL params if supported)
     - Selected template/design ID
   - Open Vistaprint in a new tab to complete purchase.
   
4. **Admin Configuration Panel:**
   - In Angular admin settings, add "Vistaprint Configuration" section.
   - Editable fields: Affiliate ID, Template URLs, Tracking Parameters.
   - Upload/manage template preview images.
   
5. **Agent Portal Integration:**
   - Add "Business Cards" link to agent sidebar navigation (icon: `bi-card-heading` or similar).
   - Display both template options with preview images.
   - Include disclaimer: *"Purchases are processed securely through Vistaprint. RHP Office earns a commission on orders."*
   
6. **Optional - Order Tracking:**
   - If Vistaprint affiliate API supports it, implement callback/webhook to track successful orders.
   - Store order records in a `BusinessCardOrder` model for admin visibility.

**Done when:** Agents can view business card templates and are redirected to Vistaprint to complete purchase; affiliate tracking is working; admin can update template links.

---

## Appendix — Dependency Map

```
TASK 001  (no deps)
TASK 002  (no deps)
TASK 003  ← TASK 002
TASK 004  ← TASK 002
TASK 005  (no deps)
TASK 006  (no deps)
TASK 007  (no deps)
TASK 008  (no deps)
TASK 009  ← TASK 005
TASK 010  (no deps)
TASK 011  ← TASK 010
TASK 012  ← TASK 010, TASK 011
TASK 013  (no deps)
TASK 014  (no deps)
TASK 015  ← TASK 014, TASK 012
TASK 016  (no deps)
TASK 017  (no deps)
TASK 018  ← TASK 016
TASK 019  (no deps)
TASK 020  ← TASK 005
TASK 021  ← TASK 020, TASK 016
TASK 022  ← TASK 020
TASK 023  (API spike needed first)
TASK 024  ← TASK 015
TASK 025  (no deps)
```

---

## Appendix — Blocked Tasks (Waiting for Client Input)

| Task | Status | Notes |
|------|--------|-------|
| ~~TASK 002~~ | ✅ **UNBLOCKED** | Production submission statuses confirmed: Submitted → Pending → In Force → Lapsed → Cancelled |
| ~~TASK 005~~ | ✅ **UNBLOCKED** | Complete product category and type structure provided |
| ~~TASK 009~~ | ✅ **UNBLOCKED** | Product types and categories received - ready to implement |
| TASK 010 / 011 | ⚠️ **PARTIALLY UNBLOCKED** | Carrier lists received for all categories. **ACTION NEEDED:** Extract exact commission factors from images in Phase 3 Development Information Request.md before implementation |
| TASK 018 | ⚠️ **PARTIALLY UNBLOCKED** | ACA CSV format image provided. **ACTION NEEDED:** Extract exact column names and structure from image before implementation |
| TASK 020 / 021 / 022 | ⚠️ **PARTIALLY UNBLOCKED** | Promotion level images provided showing Producer/Builder tracks with thresholds and skip-level rules. **ACTION NEEDED:** Extract exact premium thresholds, agent counts, time windows, and skip rules from images before implementation |
| TASK 023 | ❌ **BLOCKED** | ExamFX API credentials + documentation still needed from client |
| TASK 024 Phase B | ❌ **BLOCKED** | Client needs to confirm: full QuickBooks API integration vs. static invite link approach |
| ~~TASK 025~~ | ✅ **UNBLOCKED** | Vistaprint credentials and business card designs provided - ready to implement |

---

## Appendix — Client Information Summary

**✅ Information Received:**
1. **Production Statuses:** Submitted → Pending → In Force → Lapsed → Cancelled (CONFIRMED)
2. **Product Categories & Types:** Complete 7-category structure with all product types
3. **Carrier Lists:**
   - Life & Supplemental: Trans America, American Amicable, Assurity, Foresters, GTL, Mutual of Omaha (with commission details in images)
   - ACA: 48 carriers listed
   - Medicare: 58 carriers listed
4. **Promotion Levels:** 8 levels (Associate 60% → Senior National Executive 130%) with images showing thresholds
5. **Vistaprint:** Credentials (Rhpinsurance@gmail.com / Rhp2026!) + English/Spanish design images
6. **ACA CSV Format:** Image showing upload format structure

**⚠️ Action Required (Extract from Images):**
- Exact commission factors for all Life & Supplemental carriers
- Supplemental level mapping guides (GTL, Assurity)
- Promotion level thresholds (Producer: premium amounts, Builder: premium + agent counts)
- Skip-level promotion rules
- ACA CSV exact column names and formats
- Time windows for each promotion level

**❌ Still Waiting For:**
- ExamFX API credentials and documentation
- QuickBooks integration approach confirmation (API vs. static link)
