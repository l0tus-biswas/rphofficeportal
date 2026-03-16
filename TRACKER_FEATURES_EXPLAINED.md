# Promotion Tracker & ACA Client Volume Tracker — How They Work

---

## 1. Promotion Tracker

### What It Is
A dashboard widget visible to every agent that shows **how close they are to their next promotion level** across two independent tracks — Producer and Builder.

---

### Promotion Levels
There are **6 promotion levels**, each with a name, commission percentage, and threshold values. Admins can configure the thresholds in the admin panel under **Promotion Levels**.

| Level | Commission % | Unlocks by meeting... |
|---|---|---|
| Level 1 (entry) | lowest % | — |
| Level 2 | ↑ | Producer or Builder threshold |
| Level 3 | ↑ | Producer or Builder threshold |
| Level 4 | ↑ | Producer or Builder threshold |
| Level 5 | ↑ | Producer or Builder threshold |
| Level 6 (max) | highest % | Achieved max — both bars complete |

---

### Two Tracks

#### Producer Track — *Personal Production*
- Measures only **this agent's own** policies that are **In Force**.
- **Eligible products:** Life Insurance and Supplemental only.  
  ACA (health) and Medicare are **excluded** from this track.
- **Rolling time window:** 30, 60, 90, 120, 150, or 180 days (agent picks via dropdown).
- **What it shows:**
  - Current In Force premium vs. the target premium for the next level.
  - A progress bar (green → amber → red based on % complete).
  - The rolling window currently selected (e.g., "Rolling 30-day window").

#### Builder Track — *Team Production*
- Measures the **agent's entire downline team**.
- Tracks **two dimensions simultaneously**:
  1. **Team In Force premium** — sum of all downline agents' In Force production value.
  2. **Active producing agents** — count of downline agents who have logged at least one In Force policy within the selected time window.
- Both sub-bars must progress toward their targets.
- The overall Builder Track progress is the combined progress of both.

---

### Time Window Selector
The widget has a dropdown in the top-right corner:
- Options: 1 Month (30 days), 2 Months, 3 Months, 4 Months, 5 Months, 6 Months.
- Changing it immediately reloads tracker data for that window.
- The backend aggregates production submissions within that rolling window from today backward.

---

### Data Flow

```
Agent submits production (status: In Force)
        ↓
backend/routes/production.routes.js stores ProductionSubmission
        ↓
GET /api/promotion/tracker?window=30
        ↓
Aggregates:
  - Producer: SUM premiumAmount WHERE category=Life/Supp, status=In Force, withinWindow
  - Builder: SUM team premiumAmount + COUNT distinct active agents in downline
        ↓
Returns: PromotionTrackerData { currentLevel, nextLevel, producer{}, builder{} }
        ↓
Angular PromotionTrackerComponent renders two side-by-side track cards
```

---

### What the Agent Sees

```
┌─────────────────────────────────────────────────────────────┐
│  Promotion Tracker                          Window: [1 Month]│
├─────────────────────────────────────────────────────────────┤
│                  ● Level 3 (65%)  →  Level 4 (70%)          │
│                                                             │
│  ┌──── Producer Track ────┐   ┌──── Builder Track ────┐    │
│  │ In Force Premium       │   │ Team Premium           │    │
│  │ $4,200 / $10,000       │   │ $18,000 / $30,000      │    │
│  │ ████████░░░░░░░  42%   │   │ ██████████░░  60%      │    │
│  │ Rolling 30-day window  │   │                        │    │
│  └────────────────────────┘   │ Active Agents          │    │
│                               │ 3 / 5 agents           │    │
│                               │ ████████████░  60%     │    │
│                               └────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

- If the agent is at **max level**, a green "Max Level" badge replaces both bars.
- If **no production data** exists yet, the widget shows a placeholder message.

---

### Admin Configuration
Admins can set thresholds per level at **Admin → Promotion Levels**:
- Level name
- Commission %
- Producer Track: premium threshold + default window (days)
- Builder Track: premium threshold + agent count threshold + default window (days)
- Skip-to rules (optional: allow skipping a level with conditions)

---

---

## 2. ACA Client Volume Tracker

### What It Is
A dashboard widget below the Promotion Tracker that shows **team-wide ACA (health insurance) client counts** split into:
- **Reported** — what agents entered into their own production submissions.
- **Verified** — what the carrier confirmed via a monthly admin CSV upload.

Bonus tiers unlock based on the **verified** count.

---

### Why Two Numbers (Reported vs. Verified)?
Agents manually submit production entries through the portal. The carrier (health insurance system) separately provides a monthly export of actual enrolled clients. The widget surfaces both so agents can see if their self-reported numbers match carrier records, and the bonus is only ever paid on **carrier-verified data**.

---

### Bonus Tier Structure

| Verified ACA Clients (Team) | Tier | Bonus Rate | Monthly Bonus Example |
|---|---|---|---|
| 0 – 999 | Tier 0 | $0 | No bonus |
| 1,000 – 1,999 | Tier 1 | $1 per client | 1,500 clients = $1,500/mo |
| 2,000 – 2,999 | Tier 2 | $2 per client | 2,500 clients = $5,000/mo |
| 3,000+ | Tier 3 | $3 per client | 3,000 clients = $9,000/mo |

---

### How Verified Data Gets In — Admin CSV Upload

Each month, an admin downloads the client file from the carrier system and uploads it at **Admin → ACA Management**.

**CSV format (columns, in order):**

| # | Column | Description |
|---|---|---|
| 1 | `first_name` | Client first name |
| 2 | `last_name` | Client last name |
| 3 | `issuer` | Insurance carrier/issuer name |
| 4 | `agent` | Agent name who enrolled the client |
| 5 | `household_size` | Number of people in household enrolled |

**Processing logic:**
1. Parse every row.
2. **Group rows by `agent` name**, sum `household_size` per group → this becomes the agent's verified `clientCount`.
3. Match each agent name to a User in the database (case-insensitive, partial name fallback).
4. Any **unmatched** agent names are returned visibly so the admin can investigate — they are never silently dropped.
5. Upsert one `ACAClientRecord` per matched agent, tagged with the upload month (e.g., `2026-03`).
6. Full upload history is preserved — the widget always displays data from the **latest batch**.

---

### Data Flow

```
Admin uploads CSV at /admin/aca-management
        ↓
POST /api/admin/aca-clients/upload
        ↓
Parse CSV → group by agent → sum household_size → match to User
        ↓
Save ACAClientRecord per agent { clientCount, uploadBatch, uploadedAt }
        ↓
Agent visits dashboard:
GET /api/dashboard/aca-tracker
        ↓
Aggregates for agent + full downline:
  - Reported: ProductionSubmission WHERE category=ACA, status=In Force
  - Verified: ACAClientRecord latest batch, all downline agents
  - Derives: currentTier, bonusRate, bonusAmount, progressPercent
        ↓
Angular AcaTrackerComponent renders the widget
```

---

### What the Agent Sees

```
┌──────────────────────────────────────────────── Tier 1 ────┐
│  ACA Client Volume Tracker          Reported vs Verified    │
│  Batch: 2026-03                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌── ACA Members ──┐  ┌── In Force Premium ──┐  ┌── Producing Agents ──┐ │
│  │ Reported: 1,240 │  │ Reported: $92,000    │  │ Reported: 8     │    │
│  │ Verified: 1,105 │  │ Verified: $87,500    │  │ Verified: 7     │    │
│  │ (amber — lower) │  │ (amber — lower)      │  │ (green = match) │    │
│  └─────────────────┘  └───────────────────────┘  └────────────────┘   │
│                                                             │
│  Tier Progress  ─────────────────────────────────────────   │
│  Tier 1 (1,000)  ██████████████░░░░░░░░░░  55%  Tier 2 (2,000) │
│                                                             │
│  Current Bonus: $1/client = $1,105/month estimated          │
│                                                             │
│  ⚠ Verified totals updated monthly. Subject to verification.│
│  Last upload: March 5, 2026                                 │
└─────────────────────────────────────────────────────────────┘
```

**Colour coding:**
- 🟢 Green — Verified count ≥ Reported count (good, carrier confirms or exceeds what agent reported)
- 🟡 Amber — Verified count < Reported count (carrier has fewer than agent reported)

---

### Three Stat Cards Explained

| Card | Reported Source | Verified Source |
|---|---|---|
| **ACA Members** | Count of `ProductionSubmission` rows with category=ACA, status=In Force, in downline | Sum of `clientCount` from `ACAClientRecord` latest batch, in downline |
| **In Force Premium** | Sum of `premiumAmount` from same ACA In Force submissions | Sum of `verifiedPremium` from `ACAClientRecord` latest batch |
| **Producing Agents** | Count of distinct agents in downline with ≥1 ACA In Force submission | Count of `ACAClientRecord` rows in latest batch where `isProducing = true`, in downline |

---

### Admin Management Panel (`/admin/aca-management`)

Three sections:

1. **Upload Section** — file picker for the monthly CSV, upload button, column format reminder.
2. **Upload Results** — after upload shows: total client rows parsed, agent groups found, matched count, unmatched count + table listing unmatched agent names.
3. **Batch History** — list of all previous uploads with date, agent count, total clients, and total verified premium.

---

## Summary Comparison

| Feature | Promotion Tracker | ACA Volume Tracker |
|---|---|---|
| Who sees it | All agents | All agents |
| Data source | Agent's own production submissions | Admin-uploaded monthly CSV from carrier |
| Updates when | Agent submits production | Admin uploads new CSV |
| Tracks | Personal premium + team premium + active agents | ACA client headcount (household-size-based) |
| Goal | Unlock next promotion/commission level | Hit ACA bonus tier ($1–$3/client/month) |
| Time dimension | Rolling window (30–180 days, agent picks) | Monthly batch (always latest upload) |
| Admin controls | Configure level thresholds & windows | Upload monthly CSV, review unmatched rows |
