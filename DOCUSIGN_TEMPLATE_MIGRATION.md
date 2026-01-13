# DocuSign Template Migration - Complete

## Summary
Successfully migrated from old DocuSign template to NEW RHP APA AGREEMENT template with field population.

## Changes Made

### 1. Environment Configuration
**File:** `backend/.env`
- **Updated:** `DOCUSIGN_TEMPLATE_ID` to `045a639b-8473-4547-a1c6-26e730680b08`
- **Template Name:** NEW RHP APA AGREEMENT
- **Document:** ORIGINAL RHP Docusign DOC.docx (24 pages)

### 2. DocuSign Integration Code
**File:** `backend/utils/docusign.js`

#### Updated `createAPAEnvelope` function:
- **Changed role name** from `'Applicant'` to `'agent'` (matches template requirement)
- Line 180: `signer.roleName = 'agent';`

#### Simplified `createSignerTabs` function:
The new template has only 3 text fields that need to be populated:

| Tab Label | Location | Purpose | Populated With |
|-----------|----------|---------|----------------|
| `Text e1147488-a4b6-4c68-8f59-8ef3ec9f6997` | Page 1, position (44, 527) | Agent full name | `${legalFirstName} ${legalMiddleName} ${legalLastName}` |
| `Text 712e194d-ccb6-425b-9a0d-85d0bce2684e` | Page 1, position (174, 553) | Agent contact info | `${mobilePhone} \| ${email}` |
| `Text ab047008-8724-43f1-a3b4-c5daf1bb35c7` | Page 24, position (126, 166) | Printed name (signature page) | `${legalFirstName} ${legalMiddleName} ${legalLastName}` |

**Previous implementation:**
- Used 50+ field mappings for personal info, recruiting, compliance, financial, licensing
- Fields like `applicant_first_name`, `applicant_ssn`, `home_address_full`, etc.

**New implementation:**
- Only 3 fields with exact tab labels from template
- Pre-fills agent name and contact information
- Fields are unlocked (`locked: 'false'`) so they can be edited during signing if needed

#### Updated `createTextTab` helper:
- Changed `locked` property from `'true'` to `'false'`
- Allows signer to edit pre-filled values if needed

## Template Structure (NEW RHP APA AGREEMENT)

### Template Details
- **Template ID:** 045a639b-8473-4547-a1c6-26e730680b08
- **Role Name:** agent (recipientId: 27802949)
- **Document Pages:** 24
- **Document ID:** 71378187

### Tab Structure
**Text Tabs (Data Entry - 3 fields):**
1. Page 1: Full name (209x22 px, required)
2. Page 1: Contact info (84x22 px, required)
3. Page 24: Printed name (210x19 px, required)

**Signature Tabs:**
1. Page 24: Signature field (tabLabel: "Signature 30eadae3...")

**Initial Tabs:**
1. Page 5: Initial field (tabLabel: "Initial b3031254...")
2. Page 12: Initial field (tabLabel: "Initial eae2369f...")

**Date Signed Tab:**
1. Page 24: Date signed field (tabLabel: "Date Signed 400ee4fe...")

## Data Flow

### 1. APA Application Submitted
User completes APA application form with personal information:
- Legal first name, middle name, last name
- Mobile phone
- Email

### 2. DocuSign Envelope Created
Backend calls `createAPAEnvelope(application)`:
- Extracts personal info from application
- Creates envelope with template ID
- Sets role name to 'agent'
- Pre-fills 3 text fields with applicant data

### 3. Email Sent to Applicant
DocuSign automatically sends email to applicant with:
- Subject: "Please sign your Agent Partnership Agreement"
- Document pre-populated with their name and contact info
- Fields for signature, initials (2), and date

### 4. Applicant Signs
- Reviews 24-page agreement
- Verifies/edits pre-filled name and contact info
- Initials pages 5 and 12
- Signs page 24
- Date is automatically added

### 5. Completion
- DocuSign webhook notifies backend of completion
- Application status updated to `pending_payment`
- Signed document stored in DocuSign

## Testing Checklist

- [ ] Test APA application submission
- [ ] Verify DocuSign envelope is created with new template
- [ ] Check that text fields are pre-populated with correct data
- [ ] Confirm email is sent to applicant
- [ ] Verify signature/initial tabs work correctly
- [ ] Test webhook processing on envelope completion
- [ ] Verify application status updates to `pending_payment`

## Notes

- Template uses exact UUIDs as tab labels (e.g., `Text e1147488-a4b6-4c68-8f59-8ef3ec9f6997`)
- If template is updated in DocuSign, these labels must be updated in code
- Old helper functions (formatDate, formatYesNo, formatAddressObject) are kept for backward compatibility
- Fields are unlocked to allow editing during signing
- No clientUserId is set, so signing is done via email (remote signing)

## Legacy Functions Preserved

The following functions remain in the code but are no longer used by `createSignerTabs`:
- `formatAddressObject()` - Formats address objects
- `formatAddress()` - Legacy address formatting
- `formatDate()` - Formats dates for DocuSign
- `formatYesNo()` - Converts boolean to Yes/No

These are kept in case other parts of the codebase reference them.

## Environment Variables Required

```env
DOCUSIGN_INTEGRATION_KEY=ef0ef0b4-e7fb-4e35-8c41-14483f5deb13
DOCUSIGN_ACCOUNT_ID=732f99f9-4a0a-4d59-9643-b5faed2026b8
DOCUSIGN_USER_ID=fdb7fd81-065c-44f0-8376-daa56da18c13
DOCUSIGN_PRIVATE_KEY_PATH=./config/docusign_private.key
DOCUSIGN_BASE_PATH=https://demo.docusign.net/restapi
DOCUSIGN_TEMPLATE_ID=045a639b-8473-4547-a1c6-26e730680b08
DOCUSIGN_WEBHOOK_SECRET=your-webhook-hmac-secret
```

## Migration Complete ✅

The DocuSign integration now uses the NEW RHP APA AGREEMENT template with proper field population. All changes have been implemented and are ready for testing.
