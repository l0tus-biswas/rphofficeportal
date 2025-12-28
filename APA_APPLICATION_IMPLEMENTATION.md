# APA Application System - Implementation Summary

## Overview
Replaced the old 6-step onboarding document upload system with a comprehensive 5-section APA (Agent Producer Agreement) application form. The new system follows this workflow:

**Application → DocuSign Signature → Payment Setup**

## What Was Changed

### 1. Backend

#### New Files Created:
- **`backend/models/APAApplication.js`** - Complete schema with 5 sections:
  - Personal Information (names, DOB, SSN, addresses)
  - Recruiting Information (recruiter details, team info)
  - Compliance Questions (6 yes/no questions with conditional explanations)
  - Financial Background (judgments, liens, bankruptcy)
  - Licensing Status (current licenses, states, numbers)
  - DocuSign tracking (envelope ID, status, dates)
  - Payment tracking (fees, Stripe IDs, authorization)

- **`backend/routes/apa.routes.js`** - API endpoints:
  - `POST /api/public/apa-application` - Submit new application
  - `GET /api/public/apa-application/:id` - Get application status
  - `POST /api/public/docusign-webhook` - Handle signature completion
  - `GET /api/public/payment-page` - Check payment readiness

- **`backend/uploads/apa-compliance/`** - Directory for compliance document uploads

#### Modified Files:
- **`backend/server.js`** - Registered apa.routes

### 2. Frontend

#### Replaced Files:
- **`frontend/src/app/components/apply/apply.component.ts`**
  - Changed from 6-step document upload to 5-section application form
  - Added 5 separate FormGroups (section1Form through section5Form)
  - Implemented dynamic validation for conditional fields
  - Added navigation methods (nextSection, previousSection)
  - Added submission method that posts to backend
  - Added buildApplicationData() to format form data for API

- **`frontend/src/app/components/apply/apply.component.html`**
  - Complete redesign with modern UI
  - Progress bar showing section X of 5
  - Section tabs (Personal, Recruiting, Compliance, Financial, Licensing)
  - Conditional field rendering (mailing address, compliance explanations, bankruptcy details, license info)
  - Form validation with error messages
  - Navigation buttons (Previous/Next/Submit)

#### Modified Files:
- **`frontend/src/app/services/public.service.ts`** - Added methods:
  - `submitAPAApplication(data)` - POST to /api/public/apa-application
  - `getAPAApplicationStatus(id)` - GET application status
  - `uploadComplianceDocument()` - Upload compliance files

## New Application Structure

### Section 1: Personal Information
- Legal name (first, middle, last)
- Gender, DOB, SSN
- Mobile phone, email
- Home address (street, city, state, zip)
- Optional mailing address (if different)
- Previously contracted checkbox

### Section 2: Recruiting Information
- Recruiter full name
- Recruiter agent ID (optional)
- Recruiter contact
- Upline leader name (optional)
- Team name (optional)
- Referral code (auto-filled from URL)

### Section 3: Compliance & Background
6 yes/no questions with conditional text explanations:
1. Previously contracted with other companies
2. Felony conviction
3. Fraud/misrepresentation conviction
4. Civil action/regulatory proceedings
5. License denied/suspended/revoked
6. Surety bond issues

### Section 4: Financial Background
- Unsatisfied judgments (yes/no)
- Unsatisfied tax liens (yes/no)
- Bankruptcy filed (yes/no)
  - If yes: Chapter (7/11/13) and Status (Active/Discharged/Dismissed)

### Section 5: Licensing Status
- Currently licensed (yes/no)
- If yes:
  - License types (Life, Health, Other checkboxes)
  - States licensed in (comma-separated)
  - Primary license number
  - License status (Active/Pending Renewal/Expired)

## Workflow After Submission

1. **Form Submission**
   - User completes all 5 sections
   - Frontend validates all forms
   - Posts data to `/api/public/apa-application`

2. **Backend Processing**
   - Checks for duplicate email
   - Creates APAApplication record with status='pending_signature'
   - Initiates DocuSign envelope (placeholder for now)
   - Sends confirmation email to applicant

3. **DocuSign Signature** (To be implemented)
   - User receives DocuSign email
   - Signs APA agreement electronically
   - DocuSign webhook updates application status to 'pending_payment'
   - Backend sends payment link email

4. **Payment Setup** (To be implemented)
   - User visits payment page with applicationId
   - System checks:
     - Application status must be 'pending_payment'
     - Calculates fees: $169 onboarding (waived if licensed) + $25/month recurring
   - Stripe payment form with authorization checkbox
   - After payment: Create user account, update status to 'active'

## Payment Logic

### One-Time Onboarding Fee: $169
- **Waived if**: User has `currentlyLicensed: true` OR uses coupon code "LICENSED"
- Collected via Stripe Payment Intent

### Monthly Recurring Fee: $25
- **Required**: User must check authorization box
- Collected via Stripe Subscription
- First charge immediate, then monthly

## What Still Needs to be Done

1. **DocuSign Integration**
   - Set up DocuSign account and API credentials
   - Replace `initiateDocuSign()` placeholder with real API calls
   - Configure APA document template in DocuSign
   - Test webhook for signature completion

2. **Payment Component**
   - Create new component at `/apa-payment` route
   - Implement Stripe payment form
   - Add coupon code validation (LICENSED)
   - Handle payment success and create user account

3. **Email Templates**
   - Application confirmation email
   - DocuSign signature request
   - Payment link email
   - Account activation email

4. **Admin Review Interface**
   - View all APA applications
   - Filter by status (pending_signature, pending_payment, active, rejected)
   - Approve/reject applications manually
   - View compliance explanations and documents

5. **Testing**
   - End-to-end workflow testing
   - Form validation testing
   - File upload testing (for compliance documents)
   - Payment flow testing
   - Email delivery testing

## Key Features

✅ Multi-section wizard with progress tracking
✅ Dynamic field validation based on user responses
✅ Conditional field rendering (mailing address, compliance explanations, etc.)
✅ Referral code verification and auto-fill
✅ Modern Bootstrap 5 UI with icons
✅ Mobile-responsive design
✅ Form state preservation during navigation
✅ Comprehensive data collection for compliance
✅ SSN validation with proper format
✅ Email uniqueness check

## API Endpoints

### Public Endpoints
- `POST /api/public/apa-application` - Submit application
- `GET /api/public/apa-application/:id` - Get status (no sensitive data)
- `POST /api/public/docusign-webhook` - DocuSign webhook handler
- `GET /api/public/payment-page` - Check payment eligibility

### Admin Endpoints (Future)
- `GET /api/admin/apa-applications` - List all applications
- `GET /api/admin/apa-application/:id` - Get full application details
- `PUT /api/admin/apa-application/:id/approve` - Approve application
- `PUT /api/admin/apa-application/:id/reject` - Reject application

## Database Schema

```javascript
APAApplication {
  personalInfo: {
    legalFirstName, legalMiddleName, legalLastName,
    gender, dateOfBirth, ssn,
    mobilePhone, email,
    homeAddress: { street, city, state, zipCode },
    mailingAddress: { street, city, state, zipCode },
    previouslyContracted
  },
  recruitingInfo: {
    recruiterFullName, recruiterAgentId, recruiterContact,
    uplineLeaderName, teamName, referralCode
  },
  complianceQuestions: {
    [questionKey]: { answer: Boolean, explanation: String }
  },
  financialBackground: {
    unsatisfiedJudgments, unsatisfiedLiens,
    bankruptcy: { filed, chapter, status }
  },
  licensingStatus: {
    currentlyLicensed, licenseTypes[],
    statesLicensed[], licenseNumber, licenseStatus
  },
  docusign: {
    envelopeId, status, sentDate, signedDate
  },
  payment: {
    onboardingFee, monthlyFee, onboardingFeeWaived,
    stripeCustomerId, stripePaymentIntentId, stripeSubscriptionId,
    paymentDate, monthlyAuthorized
  },
  status, submittedAt, lastUpdated
}
```

## Testing the New Application

1. Navigate to `/apply?ref=YOURCODE` (referral code required)
2. Fill out Section 1 (Personal Information)
3. Click "Next" to proceed to Section 2
4. Complete all 5 sections
5. Click "Submit Application"
6. Application should be created with status='pending_signature'
7. User should receive confirmation email (when email template is implemented)
8. User should be redirected to DocuSign (when integration is complete)

## Notes

- Old apply component was 6-step document upload system
- New system collects all info first, then signatures, then payment (separate)
- Payment is NOT part of initial application - it comes after DocuSign signature
- Licensed users get $169 onboarding fee waived
- All users must authorize $25/month recurring subscription
- SSN is encrypted in database (using mongoose encryption plugin - to be added)
- Compliance documents can be uploaded separately if explanations are provided
