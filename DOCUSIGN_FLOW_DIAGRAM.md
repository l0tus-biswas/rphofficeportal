# DocuSign Integration Flow Diagram

## Complete APA Application Flow with Real DocuSign

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         STEP 1: APPLICATION SUBMISSION                       │
└─────────────────────────────────────────────────────────────────────────────┘

    Frontend (Angular)                Backend (Express)              DocuSign API
         │                                   │                            │
         │  POST /apa-application            │                            │
         │────────────────────────────────>  │                            │
         │  {personalInfo, licensing, ...}   │                            │
         │                                   │                            │
         │                                   │ Validate Data              │
         │                                   │ Check Duplicates           │
         │                                   │                            │
         │                                   │ createAPAEnvelope()        │
         │                                   │─────────────────────────>  │
         │                                   │                            │
         │                                   │  JWT Authentication        │
         │                                   │  Create Envelope           │
         │                                   │  Use Template              │
         │                                   │  Pre-fill Applicant Data   │
         │                                   │                            │
         │                                   │ <───────────────────────── │
         │                                   │ { envelopeId, signingUrl } │
         │                                   │                            │
         │                                   │ Save Application           │
         │                                   │ status: pending_signature  │
         │                                   │                            │
         │                                   │ Send Confirmation Email    │
         │                                   │ (with signing link)        │
         │                                   │                            │
         │ <──────────────────────────────── │                            │
         │  { applicationId, docusignUrl }   │                            │
         │                                   │                            │

┌─────────────────────────────────────────────────────────────────────────────┐
│                         STEP 2: DOCUMENT SIGNING                            │
└─────────────────────────────────────────────────────────────────────────────┘

    Applicant Email            DocuSign Portal              Backend
         │                            │                        │
         │  Click "Review Document"   │                        │
         │─────────────────────────>  │                        │
         │                            │                        │
         │  View APA Agreement        │                        │
         │  (Pre-filled with data)    │                        │
         │                            │                        │
         │  Click "Sign"              │                        │
         │  Draw/Type Signature       │                        │
         │  Click "Finish"            │                        │
         │                            │                        │
         │                            │  Webhook: Completed    │
         │                            │─────────────────────>  │
         │                            │  POST /docusign-webhook│
         │                            │  {envelopeId, status}  │
         │                            │                        │
         │                            │                        │ Validate HMAC
         │                            │                        │ Find Application
         │                            │                        │ Update Status
         │                            │                        │
         │                            │ <───────────────────── │
         │                            │  200 OK                │
         │                            │                        │

┌─────────────────────────────────────────────────────────────────────────────┐
│                    STEP 3: POST-SIGNATURE PROCESSING                        │
└─────────────────────────────────────────────────────────────────────────────┘

         Backend                    DocuSign API              Database
            │                            │                        │
            │  downloadSignedDocument()  │                        │
            │─────────────────────────>  │                        │
            │                            │                        │
            │ <───────────────────────── │                        │
            │  PDF Bytes                 │                        │
            │                            │                        │
            │  Save to uploads/apa-signed/                        │
            │                                                     │
            │  Update Application                                 │
            │────────────────────────────────────────────────────>│
            │  status: pending_payment                            │
            │  docusign.signedDate: Date                          │
            │  docusign.signedDocumentPath: /path/to/pdf          │
            │                                                     │
            │ <───────────────────────────────────────────────────│
            │  Updated                                            │
            │                                                     │
            │  sendPaymentLinkEmail()                             │
            │────────────────────────>                            │
            │  "Complete Payment Setup"                           │
            │                                                     │

┌─────────────────────────────────────────────────────────────────────────────┐
│                         STEP 4: PAYMENT & ACTIVATION                        │
└─────────────────────────────────────────────────────────────────────────────┘

    Applicant Email         Frontend                Backend            Database
         │                     │                        │                  │
         │  Click "Complete    │                        │                  │
         │  Payment Setup"     │                        │                  │
         │──────────────────>  │                        │                  │
         │                     │                        │                  │
         │  /apa-payment       │                        │                  │
         │  ?applicationId=... │                        │                  │
         │                     │                        │                  │
         │                     │  Stripe Payment        │                  │
         │                     │  Flow                  │                  │
         │                     │                        │                  │
         │                     │  POST /complete-payment│                  │
         │                     │─────────────────────>  │                  │
         │                     │                        │                  │
         │                     │                        │ Create User      │
         │                     │                        │ Create Payment   │
         │                     │                        │ Create Subscription
         │                     │                        │ Update Application
         │                     │                        │────────────────> │
         │                     │                        │                  │
         │                     │  sendWelcomeEmail()    │                  │
         │                     │  (with credentials)    │                  │
         │                     │                        │                  │
         │  Welcome Email <──────────────────────────────                  │
         │  Login: user@email.com                                          │
         │  Password: generated                                            │
         │                                                                 │

```

## Data Flow Summary

### Application Object Evolution:

```javascript
// 1. Initial Submission
{
  personalInfo: { ... },
  status: 'pending_signature',
  docusign: {
    envelopeId: '12345678-abcd-...',
    status: 'sent',
    sentAt: Date
  }
}

// 2. After Signature (via webhook)
{
  personalInfo: { ... },
  status: 'pending_payment',
  docusign: {
    envelopeId: '12345678-abcd-...',
    status: 'completed',
    sentAt: Date,
    signedDate: Date,
    signedDocumentPath: '/uploads/apa-signed/...'
  }
}

// 3. After Payment
{
  personalInfo: { ... },
  status: 'active',
  userId: ObjectId('...'),
  completedAt: Date,
  docusign: { ... },
  payment: {
    onboardingFeePaid: true,
    stripePaymentIntentId: 'pi_...',
    stripeSubscriptionId: 'sub_...'
  }
}
```

## System Components

```
┌──────────────────────────────────────────────────────────────┐
│                    RHP Office Backend                        │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │          Routes (apa.routes.js)                     │   │
│  │  - POST /apa-application                            │   │
│  │  - POST /docusign-webhook                           │   │
│  │  - POST /complete-payment                           │   │
│  └───────────────┬─────────────────────────────────────┘   │
│                  │                                          │
│  ┌───────────────▼─────────────────────────────────────┐   │
│  │       Utilities (utils/docusign.js)                 │   │
│  │  - authenticateWithJWT()                            │   │
│  │  - createAPAEnvelope()                              │   │
│  │  - getEnvelopeStatus()                              │   │
│  │  - downloadSignedDocument()                         │   │
│  │  - processWebhook()                                 │   │
│  │  - validateWebhookSignature()                       │   │
│  └───────────────┬─────────────────────────────────────┘   │
│                  │                                          │
│  ┌───────────────▼─────────────────────────────────────┐   │
│  │           Models (MongoDB)                          │   │
│  │  - APAApplication                                   │   │
│  │  - User                                             │   │
│  │  - Payment                                          │   │
│  │  - Subscription                                     │   │
│  └─────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
                              │
                              │ API Calls
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                   DocuSign API                               │
│                                                              │
│  Authentication: JWT with RSA Keys                          │
│  Endpoints Used:                                            │
│   - POST /v2.1/accounts/{accountId}/envelopes              │
│   - GET  /v2.1/accounts/{accountId}/envelopes/{id}         │
│   - GET  /v2.1/accounts/{accountId}/envelopes/{id}/docs   │
│                                                              │
│  Webhooks (DocuSign Connect):                               │
│   - Envelope Sent → POST to our webhook                    │
│   - Envelope Completed → POST to our webhook               │
│   - Envelope Declined → POST to our webhook                │
│   - Envelope Voided → POST to our webhook                  │
└──────────────────────────────────────────────────────────────┘
```

## Webhook Event Flow

```
DocuSign                           Our Backend
   │                                    │
   │  Applicant signs document          │
   │                                    │
   │  POST /docusign-webhook            │
   │─────────────────────────────────>  │
   │                                    │
   │  Headers:                          │  1. Validate HMAC
   │   X-DocuSign-Signature-1          │     Signature
   │                                    │
   │  Body (JSON):                      │  2. Parse webhook data
   │   {                                │     Extract envelopeId
   │     envelopeId: "...",             │
   │     status: "completed",           │  3. Find application
   │     data: { ... }                  │     by envelopeId
   │   }                                │
   │                                    │  4. Download signed doc
   │                                    │
   │                                    │  5. Update status
   │                                    │
   │                                    │  6. Send payment email
   │                                    │
   │ <───────────────────────────────── │
   │  200 OK                            │
   │                                    │
```

## Error Handling

```
┌──────────────────────────────────────────────────────────┐
│                    Error Scenarios                       │
└──────────────────────────────────────────────────────────┘

1. DocuSign Not Configured
   ├─> Check: DOCUSIGN_INTEGRATION_KEY exists?
   │   No ─> Use mock signing page (fallback)
   │   Yes ─> Proceed with DocuSign
   └─> User experience: Seamless fallback

2. JWT Authentication Fails
   ├─> Error: USER_AUTHENTICATION_FAILED
   ├─> Check: Private key correct?
   ├─> Check: Consent granted?
   └─> Response: Error message to frontend

3. Envelope Creation Fails
   ├─> Error: INVALID_REQUEST_BODY
   ├─> Check: Template ID correct?
   ├─> Check: Required fields match?
   └─> Response: Error with details

4. Webhook Signature Invalid
   ├─> Error: Invalid HMAC signature
   ├─> Log: Security warning
   └─> Response: 401 Unauthorized

5. Document Download Fails
   ├─> Log: Warning (non-critical)
   ├─> Continue: Application flow proceeds
   └─> Note: Document can be retrieved later
```

## Development vs Production

```
┌─────────────────────┬──────────────────────┬──────────────────────┐
│     Setting         │   Development        │    Production        │
├─────────────────────┼──────────────────────┼──────────────────────┤
│ DocuSign Portal     │ demo.docusign.net    │ www.docusign.net     │
│ Admin Console       │ admindemo.docusign.  │ admin.docusign.com   │
│                     │         com          │                      │
│ Base Path           │ demo.docusign.net/   │ www.docusign.net/    │
│                     │       restapi        │      restapi         │
│ Webhook URL         │ ngrok.io/api/...     │ yourdomain.com/api   │
│                     │ (HTTP OK)            │ (HTTPS required)     │
│ RSA Keys            │ Dev keys             │ Production keys      │
│                     │                      │ (rotate regularly)   │
│ Envelopes           │ Free, unlimited      │ Count against quota  │
│ Testing             │ No email limits      │ Be mindful of quotas │
└─────────────────────┴──────────────────────┴──────────────────────┘
```

## Template Structure

```
┌────────────────────────────────────────────────────────────┐
│           DocuSign APA Template Structure                  │
└────────────────────────────────────────────────────────────┘

Document: Agent Partnership Agreement (PDF)

Page 1:
  ┌──────────────────────────────────────────────┐
  │  AGENT PARTNERSHIP AGREEMENT                 │
  │                                              │
  │  This agreement is entered into between:     │
  │                                              │
  │  Agent Name: [applicant_name]────────────┐  │ ← Text Tab (pre-filled)
  │  Email: [applicant_email]────────────────┤  │
  │  Phone: [applicant_phone]────────────────┤  │
  │  Address: [applicant_address]────────────┘  │
  │                                              │
  │  ... [agreement text] ...                    │
  └──────────────────────────────────────────────┘

Page 3:
  ┌──────────────────────────────────────────────┐
  │  Licensing Information:                      │
  │                                              │
  │  State: [license_state]──────────────────┐  │
  │  License #: [license_number]─────────────┘  │
  │                                              │
  │  Recruiting Information:                     │
  │  Referred by: [referral_code]────────────   │
  │                                              │
  │  ... [more text] ...                         │
  └──────────────────────────────────────────────┘

Final Page:
  ┌──────────────────────────────────────────────┐
  │  SIGNATURES                                  │
  │                                              │
  │  Applicant Signature:                        │
  │  [applicant_signature]───────────────────┐  │ ← Sign Here Tab
  │                                          │  │   (Required)
  │  Date: [signature_date]──────────────────┘  │ ← Date Signed Tab
  │                                              │   (Auto-fill)
  │                                              │
  │  Company Representative:                     │
  │  [company_signature]─────────────────────   │ ← Sign Here Tab
  │                                              │   (Auto-signed or
  │  Date: [company_date]────────────────────   │    pre-signed)
  └──────────────────────────────────────────────┘

Recipient Roles:
  1. Applicant (signer) - Must sign
  2. Company Rep (signer) - Pre-signed or auto-sign
```

## Monitoring & Logging

```
Backend Logs to Monitor:

✅ Success:
   "Creating DocuSign envelope for application: 673a1b2c..."
   "DocuSign Envelope Created: 11111111-2222-3333..."
   "Processing DocuSign webhook: { envelopeId: ..., status: completed }"
   "Signed document saved: /uploads/apa-signed/..."
   "Webhook processed successfully"

⚠️ Warnings:
   "DocuSign not configured - using mock signing page"
   "Failed to download signed document: ..." (non-critical)
   "Envelope not found, webhook acknowledged"

❌ Errors:
   "Failed to authenticate with DocuSign: ..."
   "Failed to create DocuSign envelope: ..."
   "Invalid DocuSign webhook signature"
   "DocuSign Webhook Error: ..."
```

---

**Visual Reference**: This diagram shows the complete flow from application submission through DocuSign signing to final account creation. Use this alongside the setup guide and checklist.
