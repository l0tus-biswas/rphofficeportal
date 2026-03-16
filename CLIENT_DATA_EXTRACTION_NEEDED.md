# Client Data Extraction Required

**Created:** March 10, 2026  
**Source:** Phase 3 - Development Information Request.md (contains images)  
**Purpose:** Extract detailed data from client-provided images before implementation

---

## 🎯 EXTRACTION TASKS

### 1. Life & Supplemental Carrier Commission Factors
**For:** TASK 010, 011  
**Source Images:** See Phase 3 Development Information Request.md - images 3-21  

**Carriers to Extract:**

#### Trans America
- **Base Factor:** 80% (confirmed in text)
- **Action:** Review image to confirm any product-specific variations

#### American Amicable
- **Base Factor:** 90% (confirmed in text)
- **Action:** Review image to confirm any product-specific variations

#### Assurity
- **Note:** Client mentions "multiple pages due to various products"
- **Action:** Extract from images:
  - Product name
  - Commission factor/percentage for each product
  - Supplemental product designation (if applicable)
  - Supplemental level mapping (Level 1, Level 2, etc.)
- **Special:** Extract supplemental level guide content for agent reference

#### Foresters
- **Note:** "A lot of products. There's more than one sheet."
- **Action:** Extract complete product list with factors from all sheets

#### GTL (Supplemental Carrier)
- **Action:** Extract:
  - Commission levels/factors
  - Supplemental level mapping guide content (Level 1, Level 2, etc. based on agent title)
  - Reference guide for agents

#### Mutual of Omaha
- **Note:** "Multiple products"
- **Action:** Extract complete product and factor matrix from images

#### Additional Carriers
- **Action:** Review remaining images (7-21) to identify any other Life & Supplemental carriers and their factors

**Output Format:**
```json
{
  "carrierName": "Trans America",
  "category": "Life Insurance",
  "baseFactor": 80,
  "products": [
    {
      "productName": "Term Life - 10 Year",
      "factor": 80,
      "level": null
    }
  ],
  "supplementalLevelGuide": null
}
```

---

### 2. Promotion Level Thresholds
**For:** TASK 020, 021, 022  
**Source Images:** Producer track image (image1), Builder track image (image2)  

**Required Data for Each of 8 Levels:**

| Level Name | Commission % | Extract From Images |
|------------|--------------|---------------------|
| Associate | 60% | Starting level - confirm $0 threshold |
| Senior Associate | 70% | Producer premium, Builder premium + agent count, time windows |
| Manager | 80% | Producer premium, Builder premium + agent count, time windows |
| Senior Manager | 90% | Producer premium, Builder premium + agent count, time windows |
| Regional Executive | 100% | Producer premium, Builder premium + agent count, time windows |
| Senior Regional Executive | 110% | Producer premium, Builder premium + agent count, time windows |
| National Executive | 120% | Producer premium, Builder premium + agent count, time windows |
| Senior National Executive | 130% | Producer premium, Builder premium + agent count, time windows |

**For Each Level Extract:**
1. **Producer Track:**
   - Premium threshold amount (In Force Life & Supplemental)
   - Time window (30 days, 60 days, 90 days, etc.)

2. **Builder Track:**
   - Premium threshold amount (Team In Force Life & Supplemental)
   - Active agent count requirement
   - Time window (30 days, 60 days, 90 days, etc.)

3. **Skip-Level Promotion Rules:**
   - Client mentioned: "In the pictures you'll also find a rule for skipping promotion levels"
   - Extract: Conditions under which an agent can skip from one level to another
   - Format: "Can skip from X to Z if condition Y is met within W days"

**Output Format:**
```json
{
  "level": "Senior Associate",
  "rank": 2,
  "commissionPercent": 70,
  "producer": {
    "premiumThreshold": 5000,
    "windowDays": 30
  },
  "builder": {
    "premiumThreshold": 10000,
    "activeAgentCount": 2,
    "windowDays": 60
  },
  "skipRules": "Can skip directly to Manager if $25,000 in 60 days"
}
```

---

### 3. ACA CSV Upload Format
**For:** TASK 018  
**Source Image:** image22 in Phase 3 Development Information Request.md  

**Extract:**
1. **Column Names:** List all column headers exactly as they appear
2. **Data Types:** Note the format of each column (text, number, date, etc.)
3. **Agent Identifier:** Determine if CSV uses:
   - Agent ID (numeric/alphanumeric)
   - Agent Email
   - Agent Name
   - Other identifier
4. **Date/Period Format:** 
   - Examples: "2026-03", "March 2026", "03/2026"
   - Note exact format used
5. **Client Count Column:** Confirm column name for the count value

**Output Format:**
```
Column 1: Agent ID (format: numeric)
Column 2: Agent Name (format: text)
Column 3: Client Count (format: integer)
Column 4: Period (format: YYYY-MM)
...
```

**Sample Row Mapping:**
- How to match agents: by email, ID, or name?
- Is there a header row?
- What delimiter is used (comma, tab, etc.)?

---

### 4. Production Submission Status Confirmation
**For:** TASK 002, 003, 004  
**Source Image:** image23  
**Status:** ✅ CONFIRMED in text - no extraction needed

Text confirms: `Submitted → Pending → In Force → Lapsed → Cancelled`

---

### 5. Vistaprint Business Card Designs
**For:** TASK 025  
**Source Image:** image24  

**Extract:**
1. **English Design:**
   - Layout/template specifications
   - Fields to pre-populate (agent name, title, contact info)
   - Design elements/branding

2. **Spanish Design:**
   - Layout/template specifications
   - Fields to pre-populate (agent name, title, contact info)
   - Design elements/branding
   - Spanish text translations

3. **Vistaprint Details:**
   - Template URL/ID (if visible)
   - Product SKU or category
   - Any visible customization parameters

---

## 📝 EXTRACTION WORKFLOW

1. **Open:** Phase 3 - Development Information Request.md in a viewer that supports embedded images
2. **For Each Section Above:** 
   - Locate the referenced image(s)
   - Extract data into the specified format
   - Document any ambiguities or questions
3. **Create Seed Files:** 
   - `backend/scripts/seed-carriers.json` - all carrier data
   - `backend/scripts/seed-promotion-levels.json` - all promotion thresholds
   - `backend/scripts/aca-csv-mapping.json` - CSV column configuration
4. **Update Task List:** Mark extraction as complete in PHASE3_TASK_LIST.md

---

## 🔍 QUESTIONS TO RESOLVE DURING EXTRACTION

### Carriers:
- [ ] Do any carriers have state-specific factors?
- [ ] Are there effective dates for commission factors?
- [ ] Do supplemental level guides apply to all agents or only specific states?

### Promotion Levels:
- [ ] Are skip-level promotions automatic or require admin approval?
- [ ] Do time windows overlap or reset with each promotion?
- [ ] Is "In Force" status checked at the moment of calculation or locked at submission?

### ACA CSV:
- [ ] What happens if an agent appears multiple times in one upload?
- [ ] Should the system validate client count increases month-over-month?
- [ ] Are there any columns to ignore/skip?

### Vistaprint:
- [ ] Does Vistaprint API support pre-populating agent information in the order URL?
- [ ] Are there specific Vistaprint product IDs for these templates?
- [ ] Should we store completed order references?

---

## ✅ COMPLETION CHECKLIST

- [ ] All carrier factors extracted and documented
- [ ] Supplemental level guides content captured
- [ ] All 8 promotion levels fully specified (Producer + Builder tracks)
- [ ] Skip-level promotion rules documented
- [ ] ACA CSV column mapping completed
- [ ] Vistaprint template specifications documented
- [ ] Seed data files created
- [ ] Questions list sent to client for clarification
- [ ] PHASE3_TASK_LIST.md updated with extraction completion dates
