# DocuSign New Template Integration - Implementation Summary

## Overview
This document describes the integration of the new DocuSign template (ID: `59914a8d-766e-469e-a29b-e955bf2df4da`) for the APA Agreement process.

## New Template Details
- **Template ID**: `59914a8d-766e-469e-a29b-e955bf2df4da`
- **Template Name**: NEW RHP APA AGREEMENT FINAL
- **Pages**: 30 pages
- **Role Name**: `agent`
- **Document ID**: `1`

## Template Fields Summary
The new template contains:
- **33 Text Fields** (pre-filled from application data)
- **42 Checkbox Fields** (Yes/No questions, options, etc.)
- **3 Signature/Date Fields** (for agent signing)

## Changes Made

### 1. Backend Changes

#### `backend/utils/docusign.js`
- **Updated `getTemplateFields()` function**: Now accepts optional `templateIdOverride` parameter for testing different templates
- **Completely rewrote `createSignerTabs()` function**: 
  - Maps all 33 text fields from APAApplication model to DocuSign template
  - Maps all 42 checkbox fields including:
    - Gender selection (M/F/Other)
    - Compliance questions (Yes/No with explanations)
    - Financial background questions
    - Bankruptcy details (chapter & status)
    - Licensing information (types, status)
  - Uses helper functions `addTextTab()` and `addCheckboxTab()` for cleaner code
  - All fields are pre-filled and locked to maintain data integrity

#### `backend/.env.example`
- Updated `DOCUSIGN_TEMPLATE_ID` with new template ID: `59914a8d-766e-469e-a29b-e955bf2df4da`
- Added comment explaining this is the "NEW RHP APA AGREEMENT FINAL" template

### 2. Field Mapping

#### Text Fields Mapped:
1. **Personal Information**:
   - `resident_state` → personalInfo.homeAddress.state
   - `firstName` → personalInfo.legalFirstName
   - `middleName` → personalInfo.legalMiddleName
   - `lastName` → personalInfo.legalLastName
   - `dateOfBirth` → personalInfo.dateOfBirth (formatted)
   - `socialSecurityNumber` → personalInfo.ssn
   - `mobileNumber` → personalInfo.mobilePhone
   - `emailAddress` → personalInfo.email
   - `streetAddress` → personalInfo.homeAddress.street
   - `city` → personalInfo.homeAddress.city
   - `state` → personalInfo.homeAddress.state
   - `zipcode` → personalInfo.homeAddress.zipCode

2. **Recruiting Information**:
   - `recruiterFullName` → recruitingInfo.recruiterFullName
   - `recruiterAgentId` → recruitingInfo.recruiterAgentId
   - `recruiterEmail` → recruitingInfo.recruiterContact
   - `recruiterPhone` → recruitingInfo.recruiterContact
   - `uplineLeaderName` → recruitingInfo.uplineLeaderName
   - `teamName` → recruitingInfo.teamName

3. **Compliance Descriptions** (only filled if answer is Yes):
   - `previouslyContractedYesDescribe`
   - `convictedOfFelonyYesDescribe`
   - `convictedOfFraudYesDescribe`
   - `subjectToCivilActionYesDescribe`
   - `insuranceLicenseYesDescribe`
   - `difficultyObtainingYesDescribe`
   - `unsatisfiedJudgmentDescribe`
   - `unsatisfiedTaxLiensYesDescribe`
   - `oweInsuranceCompanyYesDescribe`

4. **Licensing Information**:
   - `licenseTypeOtherDescribe` → licensingStatus.licenseOtherDescription
   - `stateLicensedIn` → licensingStatus.statesLicensed (joined)
   - `primaryLicenseNumber` → licensingStatus.licenseNumber

5. **Agreement Date**:
   - `dateOfAgreement` → Current date (auto-generated)

#### Checkbox Fields Mapped:
- **Gender**: `genderMale`, `genderFemale`, `genderOther`
- **Mailing Address**: `mailingAddressDifferentFromHomeAddress`
- **Compliance Questions** (Yes/No pairs):
  - `previouslyContractedYes`, `previouslyContractedNo`
  - `convictedOfFelonyYes`, `convictedOfFelonyNo`
  - `convictedOfFraudYes`, `convictedOfFraudNo`
  - `subjectToCivilActionYes`, `subjectToCivilActionNo`
  - `insuranceLicenseYes`, `insuranceLicenseNo`
  - `difficultyObtainingYes`, `difficultyObtainingNo`
- **Financial Background**:
  - `unsatisfiedJudgmentYes`, `unsatisfiedJudgmentNo`
  - `unsatisfiedTaxLiensYes`, `unsatisfiedTaxLiensNo`
  - `oweInsuranceCompanyYes`, `oweInsuranceCompanyNo`
- **Bankruptcy**:
  - `filedForBankruptcyYes`, `filedForBankruptcyNo`
  - Chapter: `filedForBankruptcyYesLeftChapter7`, `filedForBankruptcyYesLeftChapter11`, `filedForBankruptcyYesLeftChapter13`
  - Status: `filedForBankruptcyYesRightDischarged`, `filedForBankruptcyYesRightOpenPending`, `filedForBankruptcyYesDismissed`
- **Licensing**:
  - `currentlyLicensedToSellInsuranceYes`, `currentlyLicensedToSellInsuranceNo`
  - Types: `licenseTypeLifeInsurance`, `licenseTypeHealthInsurance`, `licenseTypeLifeHealthInsurance`, `licenseTypeOther`
  - Status: `licenseStatusActive`, `licenseStatusInactive`, `licenseStatusPending`

### 3. Frontend Changes
**No changes required!** The existing frontend form (`frontend/src/app/components/apply/apa-apply.component.ts`) already collects all necessary data through its 5-section wizard:
- Section 1: Personal Information
- Section 2: Recruiting Information
- Section 3: Compliance Questions
- Section 4: Financial Background
- Section 5: Licensing Status

### 4. Database Model
**No changes required!** The `APAApplication` model (`backend/models/APAApplication.js`) already has all necessary fields to support the new template.

## How It Works

### Application Flow
1. **User Submits APA Application** via frontend form
2. **Backend receives application data** at `/api/public/apa-application` (POST)
3. **Application saved to MongoDB** with status `pending_signature`
4. **DocuSign envelope created**:
   - Uses new template ID from environment variable
   - Calls `createAPAEnvelope()` function
   - `createSignerTabs()` maps all 75 fields from application data
   - Template fields are pre-filled and locked
5. **DocuSign sends email** to applicant with signing link
6. **Applicant signs document** in DocuSign
7. **Webhook updates application** status to `pending_payment`
8. **Payment flow continues** as before

### Key Functions

#### `createAPAEnvelope(application)`
- Authenticates with DocuSign via JWT
- Creates envelope with template ID from `process.env.DOCUSIGN_TEMPLATE_ID`
- Sets role name to `agent` (matches template)
- Sets status to `sent` (triggers email)
- Returns `{ envelopeId, status }`

#### `createSignerTabs(application)`
- Takes APAApplication document
- Creates text tabs for all 33 text fields
- Creates checkbox tabs for all 42 checkboxes
- All tabs are `locked: true` to prevent modification during signing
- Returns DocuSign `Tabs` object

## Configuration

### Environment Variables
Update your `.env` file:
```bash
DOCUSIGN_TEMPLATE_ID=59914a8d-766e-469e-a29b-e955bf2df4da
```

The template ID is already set in `.env.example` for new installations.

## Testing

### Test Script
A test script has been created: `backend/scripts/fetch-new-template-fields.js`

Run it to verify template access and see all fields:
```bash
cd backend
node scripts/fetch-new-template-fields.js
```

This will:
- Authenticate with DocuSign
- Fetch template details
- List all text fields and checkbox fields
- Save full template data to `backend/scripts/new-template-fields.json`

### Manual Testing Steps
1. Update `.env` with new template ID
2. Start the backend server
3. Submit a test APA application through the frontend
4. Verify DocuSign email is sent
5. Check that all fields are pre-filled correctly
6. Sign the document in DocuSign
7. Verify webhook updates application status

### Test Data Checklist
When testing, ensure application includes:
- ✅ Complete personal information (name, DOB, SSN, address)
- ✅ Contact info (email, phone)
- ✅ Recruiter information
- ✅ All compliance questions answered
- ✅ Financial background (judgments, liens, bankruptcy)
- ✅ Licensing information (types, states, status)

## Migration Notes

### Switching from Old Template to New Template
If you're switching from an old template:

1. **Update environment variable**:
   ```bash
   DOCUSIGN_TEMPLATE_ID=59914a8d-766e-469e-a29b-e955bf2df4da
   ```

2. **Restart backend server** to load new environment variable

3. **No database migration needed** - existing applications work as-is

4. **No frontend changes needed** - form remains the same

5. **Existing pending applications**: These will continue using the old template envelope. Only new applications will use the new template.

### Rollback Procedure
If you need to rollback to the old template:
1. Set `DOCUSIGN_TEMPLATE_ID` back to old template ID
2. Restart backend server
3. No other changes needed

## Troubleshooting

### Common Issues

#### "Failed to create DocuSign envelope"
- **Check**: Template ID is correct in `.env`
- **Check**: DocuSign authentication credentials are valid
- **Check**: Template exists in your DocuSign account
- **Check**: Role name is `agent` (case-sensitive)

#### "Field not found in template"
- **Check**: Run `fetch-new-template-fields.js` to verify available fields
- **Check**: Field labels match exactly (case-sensitive)
- **Check**: Template hasn't been modified in DocuSign

#### "Template not found"
- **Check**: You're using the correct DocuSign account (demo vs production)
- **Check**: Template ID matches the environment (demo/production)
- **Check**: User has access to the template

### Debug Mode
Enable debug logging in `docusign.js` by checking console logs:
```javascript
console.log('=== Created Tabs for DocuSign ===');
console.log(`Text Tabs: ${textTabs.length}`);
console.log(`Checkbox Tabs: ${checkboxTabs.length}`);