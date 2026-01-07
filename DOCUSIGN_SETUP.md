# DocuSign Integration Setup Guide

This guide walks you through setting up real DocuSign integration for the APA application signing process.

## Prerequisites

- DocuSign Developer Account (or Production Account)
- Node.js and npm installed
- RSA Key Pair for JWT authentication

## Step 1: Install DocuSign SDK

```bash
cd backend
npm install docusign-esign
```

## Step 2: Create DocuSign Developer Account

1. Go to https://developers.docusign.com/
2. Click "Get a Developer Account" (it's free)
3. Fill out the registration form
4. Verify your email address
5. Log in to https://admindemo.docusign.com

## Step 3: Create Integration Key (App)

1. In DocuSign Admin (https://admindemo.docusign.com), go to **Settings**
2. Click **Apps and Keys** in the left sidebar
3. Click **Add App and Integration Key**
4. Enter App Name: "RHP Office APA Integration"
5. Click **Create App**
6. **Save the Integration Key** (you'll need this for DOCUSIGN_INTEGRATION_KEY)

## Step 4: Generate RSA Key Pair

1. On the same Apps and Keys page, find your app
2. Scroll down to **Authentication** section
3. Click **Generate RSA** button
4. Click **Download RSA** to save the private key file
5. Save this file as `backend/config/docusign_private.key`
6. **Important**: Add this file to `.gitignore` to keep it secure

Alternatively, you can generate RSA keys using OpenSSL:
```bash
# Generate private key
openssl genrsa -out docusign_private.key 2048

# Generate public key
openssl rsa -in docusign_private.key -pubout -out docusign_public.key
```

Then upload the public key in DocuSign Admin under your app's Authentication section.

## Step 5: Get Account and User IDs

### Account ID:
1. In DocuSign Admin, click your profile icon (top right)
2. Select **Go to Admin**
3. Note the **Account ID** in the URL or under Account Settings
4. Format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

### User ID (API Username):
1. In DocuSign Admin, go to **Users**
2. Click on your user
3. Find **API Username** (looks like a GUID)
4. Or get it from: https://admindemo.docusign.com/restapi/v2.1/accounts

## Step 6: Configure Redirect URIs

1. In your app settings on DocuSign Admin
2. Scroll to **Redirect URIs** section
3. Add your application URLs:
   - Development: `http://localhost:4200/apa-signing-complete`
   - Production: `https://yourdomain.com/apa-signing-complete`
4. Click **Save**

## Step 7: Create APA Template in DocuSign

1. Log in to https://demo.docusign.net (or production)
2. Go to **Templates** → **New** → **Create Template**
3. Upload your APA PDF document or create from scratch
4. Add the following fields (drag and drop onto document):

### Signature Fields:
- **Sign Here** tab - Label: `applicant_signature` - Required
- **Date Signed** tab - Label: `signature_date` - Auto-fill

### Text Fields (to be pre-filled by code):
- `applicant_name` - Applicant's full name
- `applicant_email` - Email address
- `applicant_phone` - Phone number
- `applicant_address` - Full address
- `applicant_dob` - Date of birth
- `applicant_ssn` - SSN (last 4 digits recommended)
- `license_state` - State where licensed
- `license_number` - License number
- `referral_code` - Recruiter's referral code

5. Add a **Recipient Role** named `Applicant` (must match code)
6. Assign all fields to the `Applicant` role
7. Save the template
8. Note the **Template ID** from the URL (format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)

## Step 8: Configure Webhooks (DocuSign Connect)

1. In DocuSign Admin, go to **Settings** → **Connect**
2. Click **Add Configuration**
3. Enter Configuration Name: "RHP Office APA Webhooks"
4. Set URL: `https://yourdomain.com/api/public/apa-application/docusign-webhook`
   - For development, use ngrok or similar: `https://abc123.ngrok.io/api/public/apa-application/docusign-webhook`
5. Select **Include HMAC Signature**
6. Generate and save the **HMAC Secret** (use for DOCUSIGN_WEBHOOK_SECRET)
7. Under **Trigger Events**, select:
   - ☑ Envelope Sent
   - ☑ Envelope Completed
   - ☑ Envelope Declined
   - ☑ Envelope Voided
8. Set **Payload Format** to `JSON` (recommended)
9. Click **Save**

## Step 9: Update Environment Variables

Create or update `backend/.env`:

```env
# DocuSign Integration
DOCUSIGN_INTEGRATION_KEY=12345678-1234-1234-1234-123456789012
DOCUSIGN_SECRET_KEY=your-secret-key-from-docusign
DOCUSIGN_ACCOUNT_ID=87654321-4321-4321-4321-210987654321
DOCUSIGN_USER_ID=11111111-2222-3333-4444-555555555555
DOCUSIGN_PRIVATE_KEY_PATH=./config/docusign_private.key
DOCUSIGN_BASE_PATH=https://demo.docusign.net/restapi
DOCUSIGN_TEMPLATE_ID=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
DOCUSIGN_WEBHOOK_SECRET=your-hmac-secret-from-connect
```

### For Production:
```env
DOCUSIGN_BASE_PATH=https://www.docusign.net/restapi
```

## Step 10: Test the Integration

### Test Envelope Creation:

```bash
# Start the backend server
cd backend
npm run dev
```

Then submit a test APA application through the frontend. Check the logs for:
```
Creating DocuSign envelope for application: 673a1b2c3d4e5f6g7h8i9j0k
DocuSign Envelope Created: 11111111-2222-3333-4444-555555555555
```

### Test Webhook:

1. Check your email for the DocuSign signing link
2. Click the link and complete the signature
3. Monitor backend logs for webhook processing:
```
Processing DocuSign webhook: { envelopeId: '...', status: 'completed', ... }
Webhook processed successfully
```

4. Verify the application status changed to `pending_payment`
5. Check that the signed document was downloaded to `uploads/apa-signed/`

## Step 11: Grant Consent (One-Time)

After configuring everything, you need to grant consent for JWT authentication:

1. Visit this URL (replace with your Integration Key):
```
https://account-d.docusign.com/oauth/auth?response_type=code&scope=signature%20impersonation&client_id=YOUR_INTEGRATION_KEY&redirect_uri=http://localhost:4200
```

2. Log in with your DocuSign account
3. Click **Allow Access**
4. You only need to do this once per account

## Troubleshooting

### Error: "USER_AUTHENTICATION_FAILED"
- Check that User ID is correct
- Ensure you've granted consent (Step 11)
- Verify private key matches the public key uploaded to DocuSign

### Error: "INVALID_REQUEST_BODY" or "ENVELOPE_DOES_NOT_EXIST"
- Verify Template ID is correct
- Check that all required fields in template match the code
- Ensure Applicant role name matches exactly

### Error: "Invalid webhook signature"
- Verify DOCUSIGN_WEBHOOK_SECRET matches the HMAC secret in Connect configuration
- Check that webhook is sending to the correct URL

### Webhook not received:
- Check DocuSign Connect logs: Settings → Connect → Your Configuration → Logs
- Verify your webhook URL is publicly accessible (use ngrok for local development)
- Check that trigger events are configured correctly

### Document not downloaded:
- Check file permissions on `uploads/apa-signed/` directory
- Verify envelope status is actually "completed"
- Check logs for download errors

## Development vs Production

### Development (Demo Environment):
- Use https://demo.docusign.net
- Base Path: `https://demo.docusign.net/restapi`
- Admin: https://admindemo.docusign.com
- Envelopes don't count against your quota

### Production:
- Use https://www.docusign.net
- Base Path: `https://www.docusign.net/restapi`
- Admin: https://admin.docusign.com
- Requires paid DocuSign account
- All envelopes count against your plan

## Security Best Practices

1. **Never commit credentials** - Add to `.gitignore`:
   ```
   docusign_private.key
   .env
   ```

2. **Use environment variables** for all secrets

3. **Validate webhook signatures** - Already implemented in code

4. **Rotate keys periodically** - Generate new RSA keys every 90-180 days

5. **Use HTTPS** in production - Webhooks require HTTPS

6. **Monitor API usage** - Check DocuSign admin for API call limits

## Files Modified

- ✅ `backend/utils/docusign.js` - DocuSign integration utility functions
- ✅ `backend/routes/apa.routes.js` - Updated to use real DocuSign
- ✅ `backend/.env.example` - Added DocuSign environment variables

## Next Steps

1. Install package: `npm install docusign-esign`
2. Create `backend/config/` directory: `mkdir backend/config`
3. Download and save your RSA private key to `backend/config/docusign_private.key`
4. Update `backend/.env` with all DocuSign credentials
5. Create and configure your APA template in DocuSign
6. Set up DocuSign Connect webhook
7. Test with a sample application
8. Monitor logs and DocuSign Connect for any issues

## Additional Resources

- [DocuSign Developer Center](https://developers.docusign.com/)
- [DocuSign Node.js SDK](https://github.com/docusign/docusign-esign-node-client)
- [JWT Authentication Guide](https://developers.docusign.com/platform/auth/jwt/)
- [DocuSign Connect (Webhooks)](https://developers.docusign.com/platform/webhooks/connect/)
- [API Reference](https://developers.docusign.com/docs/esign-rest-api/)

## Support

For DocuSign API issues:
- Developer Support: https://developers.docusign.com/support
- Community Forum: https://community.docusign.com/

For application-specific issues:
- Check backend logs for detailed error messages
- Review DocuSign Connect logs for webhook delivery status
- Verify all environment variables are set correctly
