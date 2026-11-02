# Test plan: RHP Office Portal (core features)

Build: 77c7dee + working tree  Date: 2026-11-02  Env: local only. Throwaway MongoDB in Docker (`rph_e2e` on :27018), backend :5000, Angular :4200.
Test account: `lotushotmail111@gmail.com` (agent, seeded locally). The shared Atlas database in `backend/.env` is never touched.

There is no recon map (this is an existing app, not a clone), so flows are derived from the code and routes.
Run: `npm run test:e2e` (see "How to run").

| flow | scope |
| --- | --- |
| F01 | Authentication: login, errors, session, reset, tokens |
| F02 | Access control: admin-only endpoints, privilege escalation, hash leakage |
| F03 | Production submissions: create, isolation, duplicates, validation |
| F04 | Income Paid: submit, admin approve/reject, ownership, state rules |
| F05 | Team hierarchy: downline visibility, isolation, admin tree, transfer |
| F06 | Promotion levels: admin CRUD, validation, tracker |

| case | flow | type | expected | auto | result |
| --- | --- | --- | --- | --- | --- |
| F01-H1 | login | happy | agent signs in, lands on /dashboard | e2e | pass |
| F01-N1 | login | wrong password | "Invalid credentials", stays on /login | e2e | pass |
| F01-N2 | login | deactivated account | 403 | e2e | pass |
| F01-N3 | login | unknown email vs wrong password | same status and body (no enumeration) | e2e | pass |
| F01-N4 | forgot password | real vs unknown email | identical response | e2e | pass |
| F01-N5 | reset password | garbage token | 4xx | e2e | pass |
| F01-N6 | session | missing / tampered / `none` JWT | 401 | e2e | pass |
| F01-E1 | login | empty / invalid input | submit disabled, message shown, no request | e2e | pass |
| F01-E2 | login | padded, upper-case email | 200 or 400, never 5xx | e2e | pass |
| F01-E3 | login | 5000-char email, emoji, 100 KB password | never 5xx | e2e | pass |
| F01-E4 | session | signed-out redirect, refresh keeps session | /login, then /dashboard | e2e | pass |
| F01-A11Y | login | axe scan | no violations | e2e | pass (after BUG-004 fix) |
| F02-N1 | access | agent calls 11 admin-only endpoints | 403 each | e2e | pass |
| F02-N2 | access | anonymous calls the same 11 | 401 each | e2e | pass |
| F02-N3 | access | agent promote/deactivate/delete/impersonate/transfer another user | 403, victim unchanged | e2e | pass |
| F02-N4 | access | agent sets `role: admin` via profile update | role stays agent | e2e | pass |
| F02-N5 | access | password hash in /me or /admin/users | never present | e2e | pass |
| F03-H1 | production | agent creates, sees it in list | 201, status Submitted | e2e | pass |
| F03-I1 | production | other agent reads/edits/deletes my record | 403 each | e2e | pass |
| F03-I2 | production | other agent's list | never contains mine | e2e | pass |
| F03-E1 | production | two simultaneous identical submits | one 201, one 409 | e2e | pass (after BUG-002 fix) |
| F03-E2 | production | emoji + accents stored intact, 501-char name | 201 intact, 400 | e2e | pass |
| F03-N1 | production | 9 invalid payloads incl. NoSQL operator | 4xx, never 5xx | e2e | pass |
| F03-N2 | production | malformed id in path | 4xx | e2e | pass (after BUG-003 fix) |
| F04-H1 | income paid | agent submits, admin approves, agent sees approved | approved | e2e | pass |
| F04-I1 | income paid | attach to another agent's submission | 404 | e2e | pass |
| F04-I2 | income paid | agent approves/rejects own entry | 403 | e2e | pass |
| F04-N1 | income paid | re-approve, or approved to rejected | 409 | e2e | pass (after BUG-001 fix) |
| F04-N2 | income paid | owner deletes approved entry | 403 | e2e | pass |
| F04-N3 | income paid | other agent deletes my pending entry | 403 | e2e | pass |
| F04-N4 | income paid | negative amount, missing date | 400 | e2e | pass |
| F05-H1 | team | agent sees own recruits and stats | child listed | e2e | pass |
| F05-I1 | team | agent sees other team / admin in my-team, downline, recruits | never | e2e | pass |
| F05-I2 | team | downline agent sees anyone above or beside | never | e2e | pass |
| F05-H2 | team | admin hierarchy shows the whole tree | all 4 users | e2e | pass |
| F05-N1 | team | transfer an agent under their own child | 400, tree intact | e2e | pass (after BUG-005 fix) |
| F05-UI1 | team | My Team page: no console errors, no 5xx, no other team visible | clean | e2e | pass |
| F05-A11Y1 | team | My Team axe scan | no violations | e2e | expected fail, BUG-006 open |
| F06-H1 | promotion | admin creates level, agent can read it, admin deletes | ok | e2e | pass |
| F06-N1 | promotion | empty name, rank 0 / negative / missing / text | 4xx | e2e | pass |
| F06-N2 | promotion | duplicate level name | 400 | e2e | pass |
| F06-N3 | promotion | agent creates/edits/reorders/deletes levels | 403 | e2e | pass |
| F06-E1 | promotion | tracker with no levels configured | 200 success | e2e | pass |
| F06-E2 | promotion | malformed level id | 4xx | e2e | pass |

## Not automated yet (manual pass needed, needs real providers)

- Stripe: card declined `4000 0000 0000 0002`, subscription start/cancel/resume, webhook ordering (Jest covers the webhook handlers with mocks only).
- APA registration end to end: /apply, DocuSign signing, payment, activation email.
- Email delivery (Neuzmail), password reset link arriving, welcome emails.
- Commission statement upload/download and agent isolation; onboarding and document hub uploads.
- Two tabs at once, slow network, offline, time zones/DST, mobile width, keyboard-only.

## How to run

```
docker run -d --name rph-e2e-mongo -p 27018:27017 mongo:7
MONGODB_URI=mongodb://localhost:27018/rph_e2e node e2e/seed.js
cd backend && MONGODB_URI=mongodb://localhost:27018/rph_e2e NODE_ENV=development node server.js
cd frontend && npx ng serve
npx playwright test -c e2e/playwright.config.ts
```

`seed.js` refuses to run unless `MONGODB_URI` is localhost. Re-seed before each run: the specs create records.

## Update: extended coverage (2026-11-02)

Specs now: f01 auth, f02 access control, f03 production + income paid, f05 hierarchy, f06 promotion, f10 commission statements, f11 /uploads access, f12 onboarding hub uploads, f13 legacy onboarding, f14 carriers, f20 licensing, f21 ExamFX, f22 ACA, f30 training, f31 products, f32 coupons, f33 broadcasts and notifications, f40 billing and payments, f41 APA admin, f42 admin users, f50 dashboard, f51 document hub, f52 production extras, z route sweep (all 327 routes: anonymous 401, agent on admin 403, malformed ids and empty bodies never 5xx).

Result on a clean database: Playwright 242 passed (1 expected failure: BUG-006), Jest 540 passed in 53 suites.

Run: seed (e2e/seed.js), start backend with e2e/safe-env.sh, set E2E_MONGO and E2E_DB to the local DB, then npx playwright test -c e2e/playwright.config.ts. Re-seed before each run. Regenerate the route table with npm run e2e:routes.
