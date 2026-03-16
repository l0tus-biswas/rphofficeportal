# RHP Office Phase 3 — Information Needed from Client

> **To:** [Client Name]  
> **From:** Development Team  
> **Date:** March 6, 2026  
> **Re:** Phase 3 Development — Pending Items

---

Hey, hope you're doing well! We've finished breaking down everything from our call into a full development plan and we're ready to start building. Before we can kick off a few of the bigger features, we need some specific information from your side. Once we have these answers we can move forward without any delays.

Here's exactly what we need:

---

## 1. Promotion Level Thresholds

**Needed for:** Dashboard Producer & Builder progress bars (the two arrows)

For each of the 6 levels below, please fill in:
- How much **In Force premium** an agent needs to hit (in dollars)
- The **time window** it applies to (e.g., last 30 days, 60 days, 90 days)
- For the **Builder track only** — how many **active agents** they also need on their team

| Level | Producer: Premium Needed | Producer: Time Window | Builder: Premium Needed | Builder: Active Agents Needed | Builder: Time Window |
|-------|--------------------------|----------------------|------------------------|-------------------------------|----------------------|
| Associate | *(starting level — no requirement)* | — | *(starting level)* | — | — |
| Senior Associate | $_____ | ___ days | $_____ | ___ agents | ___ days |
| Manager | $_____ | ___ days | $_____ | ___ agents | ___ days |
| Senior Manager | $_____ | ___ days | $_____ | ___ agents | ___ days |
| Division Executive | $_____ | ___ days | $_____ | ___ agents | ___ days |
| National Executive | $_____ | ___ days | $_____ | ___ agents | ___ days |

> You can also just reply with a simple list like:
> "Senior Associate = $5,000 in 30 days / Builder: $10,000 + 2 agents in 60 days" — whatever's easiest.

---

## 2. Carrier List by Product Category

**Needed for:** The new 3-tab Carrier Management section (Life & Supplemental / ACA / Medicare)

Please provide your carrier list organized into these 3 groups. For each carrier, also include the **commission factor %** if you know it.

**Life & Supplemental Carriers:**
- _(e.g., Trans America — 80%)_
- _(e.g., American Amicable — 90%)_
- _(add all carriers here)_

**ACA Carriers:**
- _(list here)_

**Medicare Carriers:**
- _(list here)_

> A spreadsheet or simple bullet list is totally fine — however's easiest for you.

---

## 3. ACA CSV Upload Format

**Needed for:** ACA Client Volume Tracker (the widget showing team health insurance client counts)

Each month you'll be downloading a file from your carrier system and uploading it into RHP Office. We need to know what columns are in that file so we can build the importer to match.

Please answer:
- What columns does your export file have? _(e.g., Agent Name, Agent Email, Client Count, Month)_
- Does it have a unique agent ID column, or just name/email?
- What format is the date/period column? _(e.g., "2026-03" or "March 2026")_

> If you can attach a sample row or screenshot of the file, that's perfect.

---

## 4. ExamFX API Access

**Needed for:** Showing agent study progress inside the Licensing tab

To connect ExamFX into RHP Office we'll need the following:

- [ ] Your **ExamFX login credentials** (manager/admin account email + password), OR an API key if they provide one separately
- [ ] Confirmation that you have a **manager-level account** that shows all your downline agents and their progress
- [ ] Any **API documentation** ExamFX has provided — or let us know if you can reach out to their support to ask if they have a developer API

> If you're unsure about the API, no problem — we can skip this for now and add it in a later phase. Just let us know.

---

## 5. QuickBooks — Two Options, Pick One

**Needed for:** The W-9 / Direct Deposit step in the agent onboarding checklist

We have two ways we can handle this. Pick whichever works best for you:

**Option A — Quick Link (recommended to start)**
> You generate a contractor invite link inside QuickBooks *(Payroll → Contractors → Invite Contractor)*, give us the link, and we embed it in the portal. Agent clicks it, fills out W-9 and direct deposit on QuickBooks' side. Simple, fast, no extra dev cost.

**Option B — Full Automation**
> When a new agent joins RHP Office and gets approved, the system automatically sends them a QuickBooks contractor invite — no action needed from you. Requires more development time and QuickBooks API setup.

**Which do you prefer?** _(Circle one: Option A / Option B)_

---

## 6. Production Submission Statuses — Quick Confirmation

**Needed for:** The status dropdown on production submissions

We're planning to use these 5 statuses:

> `Submitted` → `Pending` → `In Force` → `Lapsed` → `Cancelled`

Does that cover everything? Are there any other statuses you'd want added? _(e.g., "Under Review", "Approved", etc.)_

---

## How to Reply

You don't need to answer everything at once — even partial answers let us start on the items we have enough info for. Just reply inline to each section that you have answers for and we'll pick it up from there.

The **most important ones to unblock the big features** are:
1. **Promotion thresholds** (Section 1) — needed for the dashboard progress bars
2. **Carrier list** (Section 2) — needed for the carrier tab overhaul

Everything else can follow after.

Thanks!

— Development Team
