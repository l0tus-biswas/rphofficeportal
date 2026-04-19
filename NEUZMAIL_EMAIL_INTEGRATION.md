# Neuzmail Email Integration Plan

## Overview
Replace **nodemailer SMTP** with **Neuzmail Transactional API** for all system emails. Each email type gets its own template in Neuzmail, with `{MERGE_TAG}` placeholders for dynamic content.

---

## API Configuration

| Setting | Value |
|---------|-------|
| **Endpoint** | `POST https://app.neuzmail.in/api/v1/transactional/send` |
| **Auth Header** | `X-Api-Token` |
| **Env Variable** | `NEUZMAIL_API_TOKEN` |

### .env additions needed:
```env
# Neuzmail Transactional API
NEUZMAIL_API_TOKEN=FIIG7sx2cd5wvaJOzLUEehERpd35UvIIOvj70bMfBRQ5BLqVQYQLN3FDEjVE

# Template UIDs (fill after creating templates in Neuzmail)
NEUZMAIL_TPL_WELCOME_PASSWORD=69d600767574c
NEUZMAIL_TPL_WELCOME_SET_PASSWORD=69d609920758f
NEUZMAIL_TPL_PASSWORD_RESET=69d609c0acc70
NEUZMAIL_TPL_APA_CONFIRM=69d609e5276ef
NEUZMAIL_TPL_PAYMENT_LINK=69d60a0468d48
NEUZMAIL_TPL_ACCOUNT_ACTIVATED=69d60a2898e50
NEUZMAIL_TPL_NOTIFICATION=69d60a445def3
```

---

## Template Inventory (7 Templates)

### 01 - Welcome with Temporary Password
| Field | Value |
|-------|-------|
| **File** | `backend/email-templates/01-welcome-with-password.html` |
| **Subject** | `Welcome to {APP_NAME} - Your Account Details` |
| **Trigger** | Admin creates user, referral signup, post-payment account creation |
| **Neuzmail UID Env** | `NEUZMAIL_TPL_WELCOME_PASSWORD` |

**Merge Tags:**
| Tag | Description | Example |
|-----|-------------|---------|
| `{APP_NAME}` | Application name | Escape |
| `{APP_LOGO_URL}` | Logo URL | https://rhpoffice.com/uploads/logo.png |
| `{USER_NAME}` | Full name | John Doe |
| `{USER_EMAIL}` | Email | john@example.com |
| `{TEMP_PASSWORD}` | Temporary password | xK9#mP2q |
| `{REFERRAL_CODE}` | Referral code | AG4K8NZ2LP |
| `{REFERRED_BY}` | Referring agent name | Jane Smith |
| `{LOGIN_URL}` | Login page URL | https://rhpoffice.com/login |
| `{APP_URL}` | Base URL | https://rhpoffice.com |
| `{CURRENT_YEAR}` | Year | 2026 |

---

### 02 - Welcome with Set Password Link
| Field | Value |
|-------|-------|
| **File** | `backend/email-templates/02-welcome-set-password.html` |
| **Subject** | `Welcome to {APP_NAME} - Set Your Password` |
| **Trigger** | Admin creates user with set-password token |
| **Neuzmail UID Env** | `NEUZMAIL_TPL_WELCOME_SET_PASSWORD` |

**Merge Tags:**
| Tag | Description |
|-----|-------------|
| `{APP_NAME}` | Application name |
| `{APP_LOGO_URL}` | Logo URL |
| `{USER_NAME}` | Full name |
| `{USER_EMAIL}` | Email |
| `{REFERRED_BY}` | Referring agent name |
| `{SET_PASSWORD_URL}` | Password set link with token |
| `{LOGIN_URL}` | Login page URL |
| `{APP_URL}` | Base URL |
| `{CURRENT_YEAR}` | Year |

---

### 03 - Password Reset
| Field | Value |
|-------|-------|
| **File** | `backend/email-templates/03-password-reset.html` |
| **Subject** | `Password Reset Request - {APP_NAME}` |
| **Trigger** | User clicks Forgot Password |
| **Neuzmail UID Env** | `NEUZMAIL_TPL_PASSWORD_RESET` |

**Merge Tags:**
| Tag | Description |
|-----|-------------|
| `{APP_NAME}` | Application name |
| `{APP_LOGO_URL}` | Logo URL |
| `{USER_NAME}` | Full name |
| `{RESET_URL}` | Password reset link with token |
| `{APP_URL}` | Base URL |
| `{CURRENT_YEAR}` | Year |

---

### 04 - APA Application Confirmation
| Field | Value |
|-------|-------|
| **File** | `backend/email-templates/04-apa-application-confirmation.html` |
| **Subject** | `Application Submitted - Review & Send Your Agreement` |
| **Trigger** | After APA form submission |
| **Neuzmail UID Env** | `NEUZMAIL_TPL_APA_CONFIRM` |

**Merge Tags:**
| Tag | Description |
|-----|-------------|
| `{FIRST_NAME}` | Legal first name |
| `{LAST_NAME}` | Legal last name |
| `{APPLICATION_ID}` | Application ID |
| `{APP_NAME}` | Application name |
| `{APP_URL}` | Base URL |
| `{CURRENT_YEAR}` | Year |

---

### 05 - Payment Setup Link
| Field | Value |
|-------|-------|
| **File** | `backend/email-templates/05-payment-setup-link.html` |
| **Subject** | `{APP_NAME} - Complete Your Payment Setup` |
| **Trigger** | After DocuSign signature completion |
| **Neuzmail UID Env** | `NEUZMAIL_TPL_PAYMENT_LINK` |

**Merge Tags:**
| Tag | Description |
|-----|-------------|
| `{FIRST_NAME}` | First name |
| `{PAYMENT_URL}` | Full payment page URL |
| `{APP_NAME}` | Application name |
| `{APP_URL}` | Base URL |
| `{CURRENT_YEAR}` | Year |

---

### 06 - Account Activated (Post-Payment)
| Field | Value |
|-------|-------|
| **File** | `backend/email-templates/06-account-activated.html` |
| **Subject** | `Welcome to {APP_NAME} - Your Account is Ready!` |
| **Trigger** | After successful payment |
| **Neuzmail UID Env** | `NEUZMAIL_TPL_ACCOUNT_ACTIVATED` |

**Merge Tags:**
| Tag | Description |
|-----|-------------|
| `{APP_NAME}` | Application name |
| `{USER_NAME}` | Full name |
| `{USER_EMAIL}` | Email |
| `{TEMP_PASSWORD}` | Temporary password |
| `{REFERRAL_CODE}` | User's referral code |
| `{LOGIN_URL}` | Login page URL |
| `{APP_URL}` | Base URL |
| `{CURRENT_YEAR}` | Year |

---

### 07 - System Notification (Generic)
| Field | Value |
|-------|-------|
| **File** | `backend/email-templates/07-system-notification.html` |
| **Subject** | Dynamic `{NOTIFICATION_TITLE}` |
| **Trigger** | Login alerts, password changes, recruit added, etc. |
| **Neuzmail UID Env** | `NEUZMAIL_TPL_NOTIFICATION` |

**Merge Tags:**
| Tag | Description |
|-----|-------------|
| `{APP_NAME}` | Application name |
| `{NOTIFICATION_TITLE}` | Email heading |
| `{NOTIFICATION_MESSAGE}` | Email body text |
| `{ACTION_URL}` | Button link URL |
| `{ACTION_LABEL}` | Button text (e.g., "View Details") |
| `{APP_URL}` | Base URL |
| `{CURRENT_YEAR}` | Year |

---

## Migration Steps

### Step 1: Create Templates in Neuzmail (You)
1. Log into Neuzmail dashboard → My Templates
2. Create 7 templates using the HTML files in `backend/email-templates/`
3. Copy-paste each HTML file as the template content
4. Note down each template's UID

### Step 2: Share Template UIDs (You → Me)
Share the 7 UIDs so I can add them to `.env`:
```
01-welcome-with-password     → UID: _______________
02-welcome-set-password      → UID: _______________
03-password-reset            → UID: _______________
04-apa-application-confirm   → UID: _______________
05-payment-setup-link        → UID: _______________
06-account-activated         → UID: _______________
07-system-notification       → UID: _______________
```

### Step 3: Wire Up Backend (Me)
1. Add `NEUZMAIL_API_TOKEN` + template UIDs to `.env`
2. Install `axios` if not already present
3. Replace imports in all routes:
   - `backend/utils/email.js` → `backend/utils/neuzmail.js`
4. Update function calls in:
   - `backend/routes/apa.routes.js` (4 email functions)
   - `backend/routes/auth.routes.js` (password reset)
   - `backend/routes/admin.routes.js` (welcome email)
   - `backend/routes/public.routes.js` (referral welcome)
   - `backend/models/Notification.js` (notification emails)

### Step 4: Test
1. Test each email type end-to-end
2. Verify merge tags render correctly
3. Check email deliverability and formatting
4. Remove old nodemailer dependency if fully migrated

---

## Files Created

```
backend/
  email-templates/
    01-welcome-with-password.html
    02-welcome-set-password.html
    03-password-reset.html
    04-apa-application-confirmation.html
    05-payment-setup-link.html
    06-account-activated.html
    07-system-notification.html
  utils/
    neuzmail.js          ← New Neuzmail API service (drop-in replacement)
    email.js             ← Old nodemailer service (keep until migration complete)
```

---

## Bug Found During Audit
In `backend/models/Notification.js` line ~104, `sendEmail()` is called with positional arguments `(email, title, html)` but `email.js` expects an object `{ email, subject, html }`. This will be fixed during migration.
