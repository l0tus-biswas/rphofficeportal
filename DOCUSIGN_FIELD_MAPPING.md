# DocuSign Template Field Mapping Guide

## Overview
This document provides the comprehensive mapping between your APA application form fields and the DocuSign template fields. Use this as a reference when setting up your DocuSign template or adjusting field mappings.

## Template Field Names vs Application Data

### Section 1: Personal Information

| Application Field | Recommended DocuSign Tab Label | Value Source |
|-------------------|-------------------------------|--------------|
| Legal First Name | `applicant_first_name` or `First Name` | `personalInfo.legalFirstName` |
| Legal Middle Name | `applicant_middle_name` or `Middle Name` | `personalInfo.legalMiddleName` |
| Legal Last Name | `applicant_last_name` or `Last Name` | `personalInfo.legalLastName` |
| Full Name | `applicant_full_name` or `Full Name` | `${firstName} ${middleName} ${lastName}` |
| Gender | `applicant_gender` or `Gender` | `personalInfo.gender` |
| Date of Birth | `applicant_dob` or `Date of Birth` | `personalInfo.dateOfBirth` |
| SSN | `applicant_ssn` or `SSN` | `personalInfo.ssn` |
| Mobile Phone | `applicant_phone` or `Phone` | `personalInfo.mobilePhone` |
| Email | `applicant_email` or `Email` | `personalInfo.email` |
| Home Street | `home_street` or `Home Address` | `personalInfo.homeAddress.street` |
| Home City | `home_city` or `City` | `personalInfo.homeAddress.city` |
| Home State | `home_state` or `State` | `personalInfo.homeAddress.state` |
| Home Zip | `home_zip` or `Zip Code` | `personalInfo.homeAddress.zipCode` |
| Full Home Address | `home_address_full` | Combined address string |
| Mailing Street | `mailing_street` | `personalInfo.mailingAddress.street` |
| Mailing City | `mailing_city` | `personalInfo.mailingAddress.city` |
| Mailing State | `mailing_state` | `personalInfo.mailingAddress.state` |
| Mailing Zip | `mailing_zip` | `personalInfo.mailingAddress.zipCode` |

### Section 2: Recruiting Information

| Application Field | Recommended DocuSign Tab Label | Value Source |
|-------------------|-------------------------------|--------------|
| Recruiter Full Name | `recruiter_name` or `Recruiter Name` | `recruitingInfo.recruiterFullName` |
| Recruiter Agent ID | `recruiter_agent_id` or `Agent ID` | `recruitingInfo.recruiterAgentId` |
| Recruiter Contact | `recruiter_contact` or `Contact` | `recruitingInfo.recruiterContact` |
| Upline Leader Name | `upline_leader` or `Upline Leader` | `recruitingInfo.uplineLeaderName` |
| Team Name | `team_name` or `Team` | `recruitingInfo.teamName` |
| Referral Code | `referral_code` or `Referral Code` | `recruitingInfo.referralCode` |

### Section 3: Compliance Questions (Yes/No fields with explanations)

| Application Field | Recommended DocuSign Tab Label | Value Source |
|-------------------|-------------------------------|--------------|
| Previously Contracted (Other) | `prev_contracted_other` | `complianceQuestions.previouslyContractedOther.answer` |
| Previously Contracted Explanation | `prev_contracted_other_explain` | `complianceQuestions.previouslyContractedOther.explanation` |
| Felony Conviction | `felony_conviction` | `complianceQuestions.felonyConviction.answer` |
| Felony Conviction Explanation | `felony_conviction_explain` | `complianceQuestions.felonyConviction.explanation` |
| Misdemeanor Fraud | `misdemeanor_fraud` | `complianceQuestions.misdemeanorFraud.answer` |
| Misdemeanor Fraud Explanation | `misdemeanor_fraud_explain` | `complianceQuestions.misdemeanorFraud.explanation` |
| Civil Action | `civil_action` | `complianceQuestions.civilAction.answer` |
| Civil Action Explanation | `civil_action_explain` | `complianceQuestions.civilAction.explanation` |
| License Denied | `license_denied` | `complianceQuestions.licenseDenied.answer` |
| License Denied Explanation | `license_denied_explain` | `complianceQuestions.licenseDenied.explanation` |
| Bond Issues | `bond_issues` | `complianceQuestions.bondIssues.answer` |
| Bond Issues Explanation | `bond_issues_explain` | `complianceQuestions.bondIssues.explanation` |

### Section 4: Financial Background

| Application Field | Recommended DocuSign Tab Label | Value Source |
|-------------------|-------------------------------|--------------|
| Unsatisfied Judgments | `unsatisfied_judgments` | `financialBackground.unsatisfiedJudgments` |
| Unsatisfied Liens | `unsatisfied_liens` | `financialBackground.unsatisfiedLiens` |
| Bankruptcy Filed | `bankruptcy_filed` | `financialBackground.bankruptcy.filed` |
| Bankruptcy Chapter | `bankruptcy_chapter` | `financialBackground.bankruptcy.chapter` |
| Bankruptcy Status | `bankruptcy_status` | `financialBackground.bankruptcy.status` |

### Section 5: Licensing Status

| Application Field | Recommended DocuSign Tab Label | Value Source |
|-------------------|-------------------------------|--------------|
| Currently Licensed | `currently_licensed` | `licensingStatus.currentlyLicensed` |
| License Types | `license_types` | `licensingStatus.licenseTypes` (comma-separated) |
| States Licensed | `states_licensed` | `licensingStatus.statesLicensed` (array joined) |
| License Number | `license_number` | `licensingStatus.licenseNumber` |
| License Status | `license_status` | `licensingStatus.licenseStatus` |

### Additional Contract Fields

| Application Field | Recommended DocuSign Tab Label | Value Source |
|-------------------|-------------------------------|--------------|
| Application Date | `application_date` or `Date` | Current date when envelope created |
| Application ID | `application_id` | MongoDB document ID |
| Status | `application_status` | Current status |
| Signature | `applicant_signature` | DocuSign signature field (not text) |
| Date Signed | `date_signed` | DocuSign date signed field (auto-filled) |

## How to Use This Mapping

### Option 1: Update Your DocuSign Template
1. Log into DocuSign
2. Open your template (Template ID: `05c124b3-bf20-4ace-a552-2adecc5ec7cc`)
3. Edit the template
4. For each Text Tab field, ensure the "Tab Label" matches the "Recommended DocuSign Tab Label" from tables above
5. Save the template

### Option 2: Update the Code
If you prefer to keep your existing template field names, update the `createSignerTabs()` function in `backend/utils/docusign.js` to use your actual template field names.

## Example Template Field Configuration

In DocuSign Template Builder:
- **Field Type**: Text
- **Tab Label**: `applicant_first_name` (MUST match exactly - case sensitive)
- **Required**: Yes/No (as needed)
- **Pre-filled**: Will be filled by API
- **Read Only**: Set to "Yes" after pre-filling

## Verification Steps

1. **Test with Sample Data**: Create a test envelope with sample application data
2. **Check Pre-filled Values**: Verify all fields are populated correctly
3. **Test Signing Flow**: Complete the signing process
4. **Download Signed PDF**: Verify all data appears correctly in final document

## Common Issues

### Fields Not Pre-filling
- **Cause**: Tab Label in template doesn't match the label in code
- **Solution**: Ensure exact match (case-sensitive) between template and code

### Missing Data
- **Cause**: Application field is null/undefined
- **Solution**: Add conditional checks in `createSignerTabs()` function

### Wrong Data Format
- **Cause**: Date or boolean values not formatted correctly
- **Solution**: Use helper functions like `formatDate()` and convert booleans to "Yes"/"No"

## Code Location
The field mapping logic is in: `backend/utils/docusign.js` in the `createSignerTabs()` function (lines 120-165)

## Next Steps
1. Review your actual DocuSign template field names
2. Update either the template or the code to match
3. Test with a real application submission
4. Verify all fields are correctly populated
