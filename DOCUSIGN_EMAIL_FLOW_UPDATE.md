# DocuSign Email-Based Signing Flow Update

## Overview
Updated the APA application DocuSign integration to use **email-based remote signing** instead of embedded signing with redirect URLs.

## Changes Summary

### 1. **DocuSign Envelope Creation** (`backend/utils/docusign.js`)
- ✅ Removed embedded signing logic (no more `RecipientViewRequest`)
- ✅ Removed `clientUserId` from signer configuration
- ✅ DocuSign now sends signing email automatically
- ✅ Returns only `{ envelopeId, status }` (no signingUrl)
- ✅ Added custom email subject and message for better UX

### 2. **Application Submission Flow** (`backend/routes/apa.routes.js`)
- ✅ Updated `/api/public/apa-application` endpoint to not return `docusignUrl`
- ✅ Response now indicates user should check email from DocuSign
- ✅ Updated confirmation email to inform users about DocuSign email

### 3. **Webhook Handler** (already implemented correctly)
- ✅ Webhook endpoint `/api/public/apa-application/docusign-webhook` already triggers payment email
- ✅ When document status becomes 'completed', automatically:
  - Updates application status to 'pending_payment'
  - Downloads signed document
  - Sends payment setup email to user

### 4. **Legacy Endpoint Cleanup**
- ✅ Updated `/api/public/apa-application/:id/docusign-return` to legacy mode
- ✅ Now shows friendly message and redirects to home (backwards compatibility)

## New User Flow

### Step 1: User Submits APA Application
1. User fills out APA application form
2. System creates DocuSign envelope and triggers it
3. User receives **confirmation email** from system

### Step 2: DocuSign Sends Signing Email (Separate from Our System)
1. **DocuSign** automatically sends signing email **directly to user** from their own email system (typically `dse@docusign.net`)
2. Email contains "Review Document" button
3. User clicks and signs through DocuSign's secure portal
4. No redirect URL needed - all handled by DocuSign
5. **Note**: This email is NOT sent by our application - DocuSign sends it when we create the envelope

### Step 3: Webhook Triggers Payment
1. User completes signing in DocuSign
2. DocuSign sends webhook to our system
3. Our webhook handler automatically:
   - Updates application status to 'pending_payment'
   - Downloads signed document
   - **Sends payment setup email to user**

### Step 4: User Completes Payment
1. User receives payment email with link
2. User completes payment setup
3. Account is activated

## Key Benefits

✅ **Better UX**: Users don't need to be redirected - everything happens via email
✅ **More Reliable**: No reliance on redirect URLs which can break
✅ **Professional**: DocuSign's native email experience
✅ **Automated**: Payment email sent automatically after signing
✅ **Mobile Friendly**: DocuSign emails work perfectly on mobile devices

## Email Sequence

1. **Confirmation Email** (from OUR system - our SMTP server)
   - From: Your configured SMTP email address
   - Subject: "Application Submitted - Check Your Email for Signature Request"
   - Purpose: Tells user to watch for DocuSign email

2. **Signing Email** (from DOCUSIGN - automatically sent by DocuSign's servers)
   - From: `dse@docusign.net` or similar DocuSign address
   - Subject: "Please sign your Agent Partnership Agreement"
   - Contains "Review Document" button
   - **Important**: This email is sent by DocuSign, NOT by our application

3. **Payment Email** (from OUR system - triggered by webhook)
   - From: Your configured SMTP email address
   - Subject: "APA Agreement Signed - Complete Payment Setup"
   - Contains payment setup link

4. **Welcome Email** (from OUR system - after payment)
   - From: Your configured SMTP email address
   - Subject: "Welcome to RHP Office - Your Account is Ready!"
   - Contains login credentials

## Webhook Configuration

Ensure DocuSign webhook is configured to send events to:
```
POST https://your-domain.com/api/public/apa-application/docusign-webhook
```

Required events:
- `envelope-completed`
- `envelope-declined`
- `envelope-voided`

### Webhook Testing (Local Development)

Since DocuSign cannot reach `localhost`, you have two options:

**Option 1: Use ngrok or similar tool**
```bash
ngrok http 5000
# Then configure DocuSign webhook to use the ngrok URL
```

**Option 2: Manually trigger webhook for testing**
```bash
# Get the envelope ID
cd backend
node scripts/get-envelope-id.js

# Test the webhook manually with the envelope ID
node scripts/test-webhook-manually.js ENVELOPE_1766662609741
```

The webhook endpoint now has enhanced logging to help debug any issues.

## Environment Variables

Required DocuSign configuration:
```env
DOCUSIGN_INTEGRATION_KEY=your_integration_key
DOCUSIGN_ACCOUNT_ID=your_account_id
DOCUSIGN_USER_ID=your_user_id
DOCUSIGN_PRIVATE_KEY=base64_encoded_private_key
DOCUSIGN_TEMPLATE_ID=your_apa_template_id
DOCUSIGN_BASE_PATH=https://demo.docusign.net/restapi
DOCUSIGN_WEBHOOK_SECRET=your_webhook_secret
```

## Testing Checklist

- [ ] Submit APA application
- [ ] Verify confirmation email received
- [ ] Verify DocuSign signing email received (check spam folder)
- [ ] Sign document through DocuSign email link
- [ ] Verify webhook received and processed
- [ ] Verify payment email received after signing
- [ ] Verify signed Source**: The signing email comes directly from DocuSign's email servers (typically `dse@docusign.net`), NOT from your application's SMTP server.

⚠️ **DocuSign Email Delay**: Signing emails typically arrive within 1-2 minutes but can take up to 10 minutes.

⚠️ **Spam Folders**: Remind users to check spam/junk folders for DocuSign emails. Some email filters may flag DocuSign emails.

⚠️ **Email Whitelisting**: Consider instructing users to whitelist `@docusign.net` addresses to ensure delivery
## Important Notes

⚠️ **DocuSign Email Delay**: Signing emails typically arrive within 1-2 minutes but can take up to 10 minutes.

⚠️ **Spam Folders**: Remind users to check spam/junk folders for DocuSign emails.

⚠️ **Webhook Reliability**: Ensure webhook endpoint is publicly accessible and returns 200 OK quickly.

## Rollback Information

If you need to revert to embedded signing:
1. Add back `clientUserId` to signer in `createAPAEnvelope()`
2. Add back `RecipientViewRequest` code
3. Update confirmation email to include signing URL
4. Restore `/docusign-return` endpoint functionality

---

**Updated**: January 13, 2026
**Status**: ✅ Implemented and Ready for Testing
