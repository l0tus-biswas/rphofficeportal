# Test Users — RHP Office E2E

> Existing accounts used for this run. No accounts were created or deleted.
> No test data was added; the only write performed (agent timezone) was reverted to its original value.

| Role | Email | Password | Notes |
|------|-------|----------|-------|
| Agent | lotushotmail111@gmail.com | 123456 | Primary agent under test. Name: "Lotus Biswas", referral `AGT4L`, active $20/mo subscription, downline of 5 (3 levels). |
| Admin | contracting@rhpoffice.com | admin123 | Full admin. Org has 18 members. |
| Agent (spare) | lotusbiswaswork@gmail.com | — | Listed as reusable; not used this run. |

## Data-integrity statement
- Per the run mandate, **no data was deleted**.
- No new test records were created (the app already contained realistic data: 18 users, 111 carriers,
  46 products, 9 APA applications, broadcasts, commission statements, etc.).
- The single mutation performed during workflow testing — changing the agent's Timezone preference to
  "Eastern Time" then back to "Use system default" — was fully reverted.
