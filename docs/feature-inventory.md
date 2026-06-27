# Feature Inventory — RHP Office

Derived from `app-routing.module.ts`, `sidebar.component.html`, and `server.js` route mounts.
Status legend: ⬜ untested · 🟡 in progress · ✅ pass · ❌ fail · 🔧 fixed

## Public (no auth)
| Feature | Route | API | Priority | Status |
|---------|-------|-----|----------|--------|
| Login | /login | /api/auth | Critical | ⬜ |
| Agent application (apply) | /apply | /api/public | Critical | ⬜ |
| Application success | /application-success | — | Low | ⬜ |
| Forgot password | /forgot-password | /api/auth | High | ⬜ |
| Reset password | /reset-password | /api/auth | High | ⬜ |
| Sign APA | /sign-apa | /api/public (apa) | Critical | ⬜ |
| APA payment | /apa-payment | /api/payments | Critical | ⬜ |

## Agent / shared (auth)
| Feature | Route | API | Priority | Status |
|---------|-------|-----|----------|--------|
| Dashboard | /dashboard | /api/user, /api/aca | Critical | ⬜ |
| My Team | /my-team | /api/agent | High | ⬜ |
| My Onboarding | /onboarding | /api/onboarding | High | ⬜ |
| Onboarding upload | /onboarding-upload | /api/onboarding | High | ⬜ |
| Onboarding Docs hub | /onboarding-hub | /api/onboarding-hub | Medium | ⬜ |
| Training Materials | /training | /api/training | Medium | ⬜ |
| Licensing | /licensing | /api/licensing | High | ⬜ |
| ExamFX Progress | /examfx-progress | /api/examfx | Medium | ⬜ |
| Production | /production | /api/production | High | ⬜ |
| Carriers (agent) | /carriers | /api/carriers | High | ⬜ |
| My Commissions | /commissions | /api/commission-statements | High | ⬜ |
| RHP Vault (Document Hub) | /document-hub | /api/document-hub | Medium | ⬜ |
| Business Cards | /business-cards | /api/business-cards | Medium | ⬜ |
| My Profile | /profile | /api/user | High | ⬜ |
| Billing / Transactions | /transactions | /api/payments | High | ⬜ |
| Translation | /translation | — (Google) | Low | ⬜ |
| Announcements / Broadcasts | /broadcasts | /api/broadcasts | Medium | ⬜ |
| Notifications | /notifications | /api/notifications | Medium | ⬜ |
| Recruits | /recruits | /api/agent | Medium | ⬜ |
| Downline | /downline | /api/agent | Medium | ⬜ |
| One-time payment | /one-time-payment | /api/payments | High | ⬜ |
| Subscription payment | /subscription-payment | /api/payments | High | ⬜ |

## Admin (role: admin)
| Feature | Route | Priority | Status |
|---------|-------|----------|--------|
| User Management | /admin/users | Critical | ⬜ |
| Full Hierarchy | /admin/hierarchy | High | ⬜ |
| Licensing (admin) | /admin/licensing | High | ⬜ |
| ExamFX Management | /admin/examfx | Medium | ⬜ |
| APA Applications | /admin/apa-applications | Critical | ⬜ |
| Training Management | /admin/training | Medium | ⬜ |
| Product Management | /admin/products | High | ⬜ |
| Coupon Management | /admin/coupons | Medium | ⬜ |
| Carrier Management | /admin/carriers | High | ⬜ |
| Carrier Appointments | /admin/carrier-appointments | High | ⬜ |
| Commission Statements | /admin/commission-statements | High | ⬜ |
| Billing & Payments | /admin/payments | High | ⬜ |
| Onboarding Doc Types | /admin/onboarding-doc-types | Medium | ⬜ |
| Onboarding Management | /admin/onboarding | High | ⬜ |
| ACA Management | /admin/aca-management | High | ⬜ |
| Printful Config | /admin/vistaprint-config | Low | ⬜ |
| Store Orders | /admin/printful-orders | Low | ⬜ |
| Promotion Management | /admin/promotion-levels | Medium | ⬜ |
| Broadcast Management | /admin/broadcasts | Medium | ⬜ |
| Branding | /admin/branding | Low | ⬜ |
| Welcome Message | /admin/welcome-message | Low | ⬜ |
| System Configuration | /admin/config | High | ⬜ |
| System Monitoring | /admin/monitoring | Medium | ⬜ |
