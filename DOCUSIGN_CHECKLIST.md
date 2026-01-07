# DocuSign Integration - Quick Checklist

## ✅ Completed
- [x] DocuSign utility functions created (`backend/utils/docusign.js`)
- [x] APA routes updated to use real DocuSign integration
- [x] Webhook endpoint with signature validation implemented
- [x] Environment variables added to `.env.example`
- [x] DocuSign SDK installed (`docusign-esign`)
- [x] Comprehensive setup guide created (`DOCUSIGN_SETUP.md`)

## 📋 Required from You

### 1. DocuSign Developer Account Setup
- [ ] Create account at https://developers.docusign.com/
- [ ] Log in to https://admindemo.docusign.com
- [ ] Navigate to Settings → Apps and Keys

### 2. Create Integration Key
- [ ] Click "Add App and Integration Key"
- [ ] Name: "RHP Office APA Integration"
- [ ] Copy the **Integration Key** → Add to `.env` as `DOCUSIGN_INTEGRATION_KEY`

### 3. Generate RSA Key Pair
- [ ] In your app settings, click "Generate RSA"
- [ ] Download the private key file
- [ ] Create directory: `mkdir backend/config`
- [ ] Save file as: `backend/config/docusign_private.key`
- [ ] Verify it's added to `.gitignore`

### 4. Get Account and User IDs
- [ ] Get **Account ID** from DocuSign Admin dashboard
- [ ] Get **User ID** (API Username) from Users section
- [ ] Add both to `.env`

### 5. Configure Redirect URIs
- [ ] In app settings, add Redirect URIs:
  - Development: `http://localhost:4200/apa-signing-complete`
  - Production: `https://yourdomain.com/apa-signing-complete`

### 6. Create APA Template
- [ ] Log in to https://demo.docusign.net
- [ ] Go to Templates → New → Create Template
- [ ] Upload APA PDF document
- [ ] Add signature fields and text fields (see full guide)
- [ ] Create recipient role named: `Applicant`
- [ ] Save template and copy **Template ID** → Add to `.env`

### 7. Setup DocuSign Connect (Webhook)
- [ ] In DocuSign Admin → Settings → Connect
- [ ] Click "Add Configuration"
- [ ] Set webhook URL (use ngrok for local dev)
- [ ] Enable HMAC signature
- [ ] Copy HMAC secret → Add to `.env` as `DOCUSIGN_WEBHOOK_SECRET`
- [ ] Select trigger events: Sent, Completed, Declined, Voided
- [ ] Set payload format to JSON

### 8. Update Environment Variables
- [ ] Copy `.env.example` to `.env` (if not already done)
- [ ] Fill in all DocuSign variables:
```env
DOCUSIGN_INTEGRATION_KEY=your-integration-key
DOCUSIGN_ACCOUNT_ID=your-account-id
DOCUSIGN_USER_ID=your-user-id
DOCUSIGN_PRIVATE_KEY_PATH=./config/docusign_private.key
DOCUSIGN_BASE_PATH=https://demo.docusign.net/restapi
DOCUSIGN_TEMPLATE_ID=your-template-id
DOCUSIGN_WEBHOOK_SECRET=your-webhook-secret
```

### 9. Grant Consent (One-Time)
- [ ] Visit consent URL (replace YOUR_INTEGRATION_KEY):
```
https://account-d.docusign.com/oauth/auth?response_type=code&scope=signature%20impersonation&client_id=YOUR_INTEGRATION_KEY&redirect_uri=http://localhost:4200
```
- [ ] Click "Allow Access"

### 10. Test the Integration
- [ ] Start backend server: `npm run dev`
- [ ] Submit a test APA application
- [ ] Check logs for "DocuSign Envelope Created"
- [ ] Check email for DocuSign signing link
- [ ] Complete the signature
- [ ] Verify webhook is received and processed
- [ ] Check that signed document is downloaded

## 📁 File Structure

```
backend/
├── config/
│   └── docusign_private.key     ← Your RSA private key (create this)
├── utils/
│   └── docusign.js              ✅ Created
├── routes/
│   └── apa.routes.js            ✅ Updated
├── uploads/
│   └── apa-signed/              ← Signed documents saved here
├── .env                         ← Add DocuSign variables here
└── .env.example                 ✅ Updated with DocuSign vars
```

## 🔒 Security Checklist

- [ ] `docusign_private.key` is in `.gitignore`
- [ ] `.env` file is in `.gitignore`
- [ ] Never commit credentials to git
- [ ] Use HTTPS for webhook URL in production
- [ ] Webhook signature validation is enabled

## 🧪 Testing Checklist

After setup, test these scenarios:

### Happy Path:
- [ ] Application submission creates DocuSign envelope
- [ ] Email is sent to applicant with signing link
- [ ] Applicant can view and sign the document
- [ ] Webhook is received when signature completes
- [ ] Application status changes to `pending_payment`
- [ ] Payment link email is sent
- [ ] Signed document is downloaded and saved

### Edge Cases:
- [ ] Applicant declines envelope → Status updated correctly
- [ ] Envelope is voided → Status updated correctly
- [ ] Invalid webhook signature → Rejected with 401
- [ ] Duplicate envelope creation → Prevented
- [ ] DocuSign API error → Graceful fallback or error message

## 🚀 Deployment Notes

### For Production:
1. Switch to production DocuSign account
2. Update `DOCUSIGN_BASE_PATH=https://www.docusign.net/restapi`
3. Create production template and update `DOCUSIGN_TEMPLATE_ID`
4. Update webhook URL to production domain with HTTPS
5. Generate new RSA keys for production
6. Grant consent for production account

## 📞 Need Help?

- Full Setup Guide: See `DOCUSIGN_SETUP.md`
- DocuSign Developer Docs: https://developers.docusign.com/
- API Reference: https://developers.docusign.com/docs/esign-rest-api/
- Support: https://developers.docusign.com/support

## 🎯 Current Status

The code is **ready to use**. Once you complete the checklist above, the integration will work with real DocuSign envelopes.

**Fallback Mode**: If DocuSign is not configured (missing environment variables), the code automatically falls back to the mock signing page, so you can test other features while setting up DocuSign.
