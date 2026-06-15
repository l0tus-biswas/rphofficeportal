# RHP Office — Test Scenarios
**Audit Date:** June 13, 2026  
**Status:** Missing tests identified during product audit

---

## 1. FUNCTIONAL TESTS

### 1.1 APA Application Flow
| ID | Scenario | Type | Priority |
|----|----------|------|----------|
| F-001 | Submit complete APA application with all fields | Happy Path | Critical |
| F-002 | Submit APA with missing required fields (each section) | Negative | Critical |
| F-003 | Submit APA with duplicate email (existing user) | Negative | Critical |
| F-004 | Submit APA with invalid referral code | Negative | High |
| F-005 | Submit APA with expired/used referral code | Edge | Medium |
| F-006 | Resume incomplete APA application (if draft saved) | Happy Path | High |
| F-007 | APA submission → DocuSign envelope creation verification | Integration | Critical |
| F-008 | DocuSign signing → webhook status update → payment page redirect | Integration | Critical |
| F-009 | APA payment → Stripe charge → account activation | Integration | Critical |
| F-010 | Admin approve APA → user account created → welcome email sent | Integration | Critical |
| F-011 | Admin reject APA with reason → rejection email sent | Integration | High |
| F-012 | APA with all compliance questions answered "Yes" with explanations | Edge | Medium |
| F-013 | APA with mailing address different from home address | Edge | Medium |

### 1.2 Authentication & Session
| ID | Scenario | Type | Priority |
|----|----------|------|----------|
| F-014 | Login with valid credentials → JWT issued → dashboard redirect | Happy Path | Critical |
| F-015 | Login with wrong password → error message shown | Negative | Critical |
| F-016 | Login with non-existent email → generic error (no enumeration) | Security | Critical |
| F-017 | Login with deactivated account → access denied | Negative | Critical |
| F-018 | Login during maintenance mode (agent) → 503 returned | Negative | High |
| F-019 | Login during maintenance mode (admin) → access granted | Positive | High |
| F-020 | Password reset flow: request → email → token → new password | Happy Path | Critical |
| F-021 | Password reset with expired token → error | Negative | High |
| F-022 | Password reset with already-used token → error | Edge | Medium |
| F-023 | JWT expiry → 401 → redirect to login | Security | Critical |
| F-024 | Concurrent sessions (multiple tabs/devices) | Edge | Medium |

### 1.3 Production Submissions
| ID | Scenario | Type | Priority |
|----|----------|------|----------|
| F-025 | Agent submits production with all required fields | Happy Path | Critical |
| F-026 | Agent submits production with missing carrier | Negative | High |
| F-027 | Agent views own production history with filters | Happy Path | High |
| F-028 | Admin reviews production → marks "In Force" → promotion check triggers | Integration | Critical |
| F-029 | Admin reviews production → marks "Cancelled" → no promotion effect | Negative | High |
| F-030 | Agent with scope=team sees downline production (client names hidden) | Security | Critical |
| F-031 | Agent without team cannot see others' production | Security | Critical |
| F-032 | Production CSV upload with valid data → records created | Happy Path | High |
| F-033 | Production CSV upload with malformed data → validation errors returned | Negative | High |
| F-034 | Production export to CSV with date filters | Happy Path | Medium |
| F-035 | Production ranking leaderboard with different sort options | Happy Path | Medium |

### 1.4 Commission Statements
| ID | Scenario | Type | Priority |
|----|----------|------|----------|
| F-036 | Admin uploads commission PDF for agent with carrier and pay period | Happy Path | Critical |
| F-037 | Admin uploads commission with multiple carriers | Happy Path | High |
| F-038 | Agent downloads own commission statement PDF | Happy Path | Critical |
| F-039 | Agent cannot access another agent's commission statement | Security | Critical |
| F-040 | Admin adds notes to commission statement | Happy Path | Medium |
| F-041 | Agent views commission history sorted by date | Happy Path | Medium |

### 1.5 RHP Vault
| ID | Scenario | Type | Priority |
|----|----------|------|----------|
| F-042 | Admin creates folder hierarchy (nested folders) | Happy Path | High |
| F-043 | Admin uploads file with visibility=all → agents can see | Happy Path | High |
| F-044 | Admin uploads file with visibility=admin → agents cannot see | Security | Critical |
| F-045 | Admin uploads file with visibility=restricted → only listed agents see | Security | Critical |
| F-046 | Agent downloads file they have access to | Happy Path | High |
| F-047 | Agent cannot download admin-only file | Security | Critical |
| F-048 | Admin creates document request → agents notified | Integration | High |
| F-049 | Agent responds to document request → file uploaded → admin notified | Integration | High |
| F-050 | Admin approves response → file published to hub | Integration | High |
| F-051 | Admin rejects response with notes → agent sees feedback | Integration | High |
| F-052 | Folder deletion cascades children to parent | Business Logic | High |
| F-053 | File search by name and description | Happy Path | Medium |
| F-054 | Drag-drop reordering of folders and files | UX | Medium |

### 1.6 Onboarding
| ID | Scenario | Type | Priority |
|----|----------|------|----------|
| F-055 | Agent uploads all 5 required documents | Happy Path | Critical |
| F-056 | Agent uploads non-PDF file → rejected | Negative | High |
| F-057 | Agent uploads file exceeding 10MB → rejected | Negative | High |
| F-058 | Admin approves all steps → overall status approved | Happy Path | Critical |
| F-059 | Admin rejects step with comment → agent sees feedback | Happy Path | High |
| F-060 | Agent re-uploads after rejection | Happy Path | High |
| F-061 | Onboarding progress percentage calculation | Business Logic | High |

---

## 2. BUSINESS LOGIC TESTS

### 2.1 Promotion System
| ID | Scenario | Type | Priority |
|----|----------|------|----------|
| BL-001 | Producer track: agent reaches premium threshold → eligible | Happy Path | Critical |
| BL-002 | Producer track: agent below threshold → not eligible | Negative | Critical |
| BL-003 | Builder track: team premium + agent count both met → eligible | Happy Path | Critical |
| BL-004 | Builder track: premium met but agents below threshold → not eligible | Negative | Critical |
| BL-005 | Builder track: 50% leg cap violated → not eligible | Business Rule | Critical |
| BL-006 | Fast-track skip: 1.4x threshold met → skip-level eligible | Business Rule | High |
| BL-007 | Fast-track skip: 1.39x threshold → no skip (boundary) | Edge | High |
| BL-008 | Only qualifying categories count (Life, Supplemental, Retirement) | Business Rule | Critical |
| BL-009 | Health Insurance and P&C excluded from promotion | Business Rule | Critical |
| BL-010 | Only "In Force" status counts toward promotion | Business Rule | Critical |
| BL-011 | Rolling window calculation with promotedAt as start date | Business Rule | High |
| BL-012 | Rolling window calculation without promotedAt (uses window days) | Business Rule | High |
| BL-013 | Max level agent: no promotion target shown | Edge | Medium |
| BL-014 | Admin notification sent when agent becomes eligible (deduplication) | Integration | High |

### 2.2 Hierarchy & Genealogy
| ID | Scenario | Type | Priority |
|----|----------|------|----------|
| BL-015 | Referral code creates parent-child relationship | Happy Path | Critical |
| BL-016 | getDownlineIds returns all recursive descendants | Business Logic | Critical |
| BL-017 | Agent transfer updates hierarchy correctly | Business Logic | High |
| BL-018 | Soft-delete cascades to all related records | Business Logic | Critical |
| BL-019 | Restore soft-deleted user restores all related records | Business Logic | High |
| BL-020 | Team production scope shows correct downline data | Business Logic | High |

### 2.3 Payment & Subscription
| ID | Scenario | Type | Priority |
|----|----------|------|----------|
| BL-021 | Stripe subscription created → status active | Happy Path | Critical |
| BL-022 | Subscription payment fails → status past_due | Negative | Critical |
| BL-023 | User cancels subscription → cancelAtPeriodEnd set | Business Logic | High |
| BL-024 | Billing-exempt user bypasses payment checks | Business Logic | Critical |
| BL-025 | Coupon validation: valid code → discount applied | Happy Path | High |
| BL-026 | Coupon validation: expired code → rejected | Negative | High |
| BL-027 | Coupon validation: usage limit reached → rejected | Negative | High |
| BL-028 | Coupon validation: user already used → rejected | Edge | Medium |

### 2.4 Broadcast System
| ID | Scenario | Type | Priority |
|----|----------|------|----------|
| BL-029 | New agent only sees broadcasts created after their account | Business Rule | Critical |
| BL-030 | Multiple unread broadcasts display one-by-one as popups | Business Rule | High |
| BL-031 | Email notification respects user preferences (mute) | Business Rule | High |
| BL-032 | Email rate limiting: max 4 emails per 61 seconds | Business Logic | Medium |
| BL-033 | Duplicate email prevention (emailSent flag) | Business Logic | Medium |
| BL-034 | Role-targeted broadcast only shows to matching roles | Business Logic | High |

---

## 3. SECURITY TESTS

| ID | Scenario | Type | Priority |
|----|----------|------|----------|
| SEC-001 | Unauthenticated request to protected endpoint → 401 | Auth | Critical |
| SEC-002 | Agent accessing admin-only endpoint → 403 | RBAC | Critical |
| SEC-003 | Agent accessing another agent's profile → denied | IDOR | Critical |
| SEC-004 | Agent downloading admin-only document → denied | IDOR | Critical |
| SEC-005 | Agent downloading restricted document (not in list) → denied | IDOR | Critical |
| SEC-006 | Agent downloading another agent's document request response → denied | IDOR | Critical |
| SEC-007 | Expired JWT → 401 | Auth | Critical |
| SEC-008 | Malformed JWT → 401 | Auth | Critical |
| SEC-009 | Rate limit exceeded on login → 429 | Rate Limit | High |
| SEC-010 | Rate limit exceeded on password reset → 429 | Rate Limit | High |
| SEC-011 | SQL/NoSQL injection in search fields → sanitized | Injection | Critical |
| SEC-012 | Path traversal in file download (../../etc/passwd) → denied | Traversal | Critical |
| SEC-013 | XSS payload in broadcast message → sanitized | XSS | High |
| SEC-014 | XSS payload in client name → sanitized on display | XSS | High |
| SEC-015 | CSRF attack on state-changing endpoint → prevented | CSRF | High |
| SEC-016 | File upload with disguised extension (.exe → .pdf) → rejected | Upload | High |
| SEC-017 | File upload exceeding size limit → rejected | Upload | High |
| SEC-018 | DocuSign webhook with invalid signature → rejected | Webhook | Critical |
| SEC-019 | Stripe webhook with invalid signature → rejected | Webhook | Critical |
| SEC-020 | SSN not visible in API responses (except to authorized admin) | Data | Critical |
| SEC-021 | Password not included in user API responses | Data | Critical |
| SEC-022 | Audit log records all admin actions | Audit | High |
| SEC-023 | Audit log redacts sensitive fields (password, SSN, tokens) | Audit | High |
| SEC-024 | Soft-deleted user cannot login | Auth | Critical |
| SEC-025 | Deactivated user cannot login | Auth | Critical |

---

## 4. API TESTS

| ID | Scenario | Type | Priority |
|----|----------|------|----------|
| API-001 | All GET endpoints return consistent JSON envelope | Contract | Medium |
| API-002 | All POST endpoints validate required fields → 400 | Validation | High |
| API-003 | All DELETE endpoints return proper status codes | Contract | Medium |
| API-004 | Pagination works correctly (page, limit, total) | Functional | High |
| API-005 | Date range filters work correctly (startDate, endDate) | Functional | High |
| API-006 | Search/filter endpoints handle special characters | Edge | Medium |
| API-007 | File upload endpoints accept valid MIME types | Functional | High |
| API-008 | File upload endpoints reject invalid MIME types | Security | High |
| API-009 | WebSocket connection authenticates with JWT | Integration | High |
| API-010 | WebSocket emits events to correct user rooms | Integration | High |

---

## 5. EDGE CASE TESTS

| ID | Scenario | Type | Priority |
|----|----------|------|----------|
| EDGE-001 | Submit APA with Unicode characters in name | Data | Medium |
| EDGE-002 | Submit APA with emoji in description fields | Data | Low |
| EDGE-003 | Submit production with $0.00 premium | Boundary | High |
| EDGE-004 | Submit production with $999,999,999 premium | Boundary | Medium |
| EDGE-005 | Upload exactly 25MB file (boundary) | Boundary | Medium |
| EDGE-006 | Upload 10 files simultaneously (max batch) | Boundary | Medium |
| EDGE-007 | Create folder with 255-character name | Boundary | Low |
| EDGE-008 | Create deeply nested folder hierarchy (10+ levels) | Boundary | Medium |
| EDGE-009 | Agent with 0 downline views team report | Edge | Medium |
| EDGE-010 | Agent at max promotion level submits more production | Edge | Medium |
| EDGE-011 | Rapid double-click on submit button | Concurrency | High |
| EDGE-012 | Multiple tabs: submit same production twice | Concurrency | High |
| EDGE-013 | Browser back button after form submission | UX | Medium |
| EDGE-014 | Session expiry during form filling | UX | Medium |
| EDGE-015 | Network timeout during file upload | Reliability | Medium |
| EDGE-016 | Server restart during active WebSocket session | Reliability | Medium |
| EDGE-017 | MongoDB connection drop and recovery | Reliability | High |

---

## 6. PERFORMANCE TESTS

| ID | Scenario | Metric | Target |
|----|----------|--------|--------|
| PERF-001 | Login endpoint response time | Latency | < 500ms |
| PERF-002 | Dashboard load with all widgets | Latency | < 2s |
| PERF-003 | Production list with 10,000 records paginated | Latency | < 1s |
| PERF-004 | Promotion calculation for agent with 500 downline | Latency | < 3s |
| PERF-005 | File upload (25MB) completion time | Throughput | < 10s |
| PERF-006 | Broadcast email to 500 agents | Duration | < 30 min |
| PERF-007 | RHP Vault search across 10,000 files | Latency | < 1s |
| PERF-008 | Hierarchy tree rendering with 1,000 agents | Latency | < 2s |
| PERF-009 | 50 concurrent WebSocket connections | Stability | 0 drops |
| PERF-010 | CSV import with 5,000 rows | Duration | < 60s |

---

## 7. ACCESSIBILITY TESTS

| ID | Scenario | Standard | Priority |
|----|----------|----------|----------|
| A11Y-001 | All forms have proper labels and ARIA attributes | WCAG 2.1 AA | High |
| A11Y-002 | Color contrast meets 4.5:1 ratio | WCAG 2.1 AA | High |
| A11Y-003 | Keyboard navigation works for all interactive elements | WCAG 2.1 AA | High |
| A11Y-004 | Screen reader can navigate sidebar and main content | WCAG 2.1 AA | Medium |
| A11Y-005 | Error messages are announced to screen readers | WCAG 2.1 AA | Medium |
| A11Y-006 | Focus management in modals | WCAG 2.1 AA | Medium |
| A11Y-007 | Images have alt text | WCAG 2.1 A | Medium |
| A11Y-008 | Page has proper heading hierarchy | WCAG 2.1 A | Medium |

---

## 8. MOBILE TESTS

| ID | Scenario | Device | Priority |
|----|----------|--------|----------|
| MOB-001 | Login page responsive on iPhone SE (375px) | Mobile | High |
| MOB-002 | Dashboard layout on iPad (768px) | Tablet | High |
| MOB-003 | Sidebar collapses/hides on mobile | Mobile | High |
| MOB-004 | File upload works on mobile browser | Mobile | High |
| MOB-005 | APA 5-step form navigable on mobile | Mobile | High |
| MOB-006 | Data tables scrollable on small screens | Mobile | Medium |
| MOB-007 | Broadcast popup dismissable on mobile | Mobile | Medium |
| MOB-008 | Touch targets meet 44x44px minimum | Mobile | Medium |
