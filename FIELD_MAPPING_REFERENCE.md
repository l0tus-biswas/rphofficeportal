# DocuSign Template Field Mapping Reference

## Quick Field Mapping Guide

This document provides a quick reference for how APAApplication model fields map to DocuSign template fields.

### Template Information
- **Template ID**: `59914a8d-766e-469e-a29b-e955bf2df4da`
- **Template Name**: NEW RHP APA AGREEMENT FINAL
- **Role Name**: `agent`
- **Total Fields**: 75 (33 text fields + 42 checkboxes)

---

## Text Fields (33 Total)

### Personal Information (12 fields)

| DocuSign Field Label | APAApplication Model Path | Example Value |
|---------------------|---------------------------|---------------|
| `resident_state` | `personalInfo.homeAddress.state` | "CA" |
| `firstName` | `personalInfo.legalFirstName` | "John" |
| `middleName` | `personalInfo.legalMiddleName` | "Michael" |
| `lastName` | `personalInfo.legalLastName` | "Doe" |
| `dateOfBirth` | `personalInfo.dateOfBirth` | "06/15/1985" |
| `socialSecurityNumber` | `personalInfo.ssn` | "123-45-6789" |
| `mobileNumber` | `personalInfo.mobilePhone` | "(555) 123-4567" |
| `emailAddress` | `personalInfo.email` | "john@example.com" |
| `streetAddress` | `personalInfo.homeAddress.street` | "123 Main St" |
| `city` | `personalInfo.homeAddress.city` | "Los Angeles" |
| `state` | `personalInfo.homeAddress.state` | "CA" |
| `zipcode` | `personalInfo.homeAddress.zipCode` | "90001" |

### Recruiting Information (6 fields)

| DocuSign Field Label | APAApplication Model Path | Example Value |
|---------------------|---------------------------|---------------|
| `recruiterFullName` | `recruitingInfo.recruiterFullName` | "Jane Smith" |
| `recruiterAgentId` | `recruitingInfo.recruiterAgentId` | "AGT12345" |
| `recruiterEmail` | `recruitingInfo.recruiterContact` | "jane@rhp.com" |
| `recruiterPhone` | `recruitingInfo.recruiterContact` | "(555) 987-6543" |
| `uplineLeaderName` | `recruitingInfo.uplineLeaderName` | "Bob Johnson" |
| `teamName` | `recruitingInfo.teamName` | "Elite Team" |

### Compliance Explanations (9 fields)

**Note**: These fields are only populated if the corresponding answer is `true`

| DocuSign Field Label | APAApplication Model Path | When Filled |
|---------------------|---------------------------|-------------|
| `previouslyContractedYesDescribe` | `complianceQuestions.previouslyContractedOther.explanation` | If answer = true |
| `convictedOfFelonyYesDescribe` | `complianceQuestions.felonyConviction.explanation` | If answer = true |
| `convictedOfFraudYesDescribe` | `complianceQuestions.misdemeanorFraud.explanation` | If answer = true |
| `subjectToCivilActionYesDescribe` | `complianceQuestions.civilAction.explanation` | If answer = true |
| `insuranceLicenseYesDescribe` | `complianceQuestions.licenseDenied.explanation` | If answer = true |
| `difficultyObtainingYesDescribe` | `complianceQuestions.bondIssues.explanation` | If answer = true |
| `unsatisfiedJudgmentDescribe` | Hardcoded: "Yes, see explanation" | If judgments = true |
| `unsatisfiedTaxLiensYesDescribe` | Hardcoded: "Yes, see explanation" | If liens = true |
| `oweInsuranceCompanyYesDescribe` | Not currently used | Always empty |

### Licensing Information (4 fields)

| DocuSign Field Label | APAApplication Model Path | Example Value |
|---------------------|---------------------------|---------------|
| `licenseTypeOtherDescribe` | `licensingStatus.licenseOtherDescription` | "Real Estate" |
| `stateLicensedIn` | `licensingStatus.statesLicensed` (joined) | "CA, NV, AZ" |
| `primaryLicenseNumber` | `licensingStatus.licenseNumber` | "CA-LH-12345678" |
| `dateOfAgreement` | Current date (auto-generated) | "02/01/2026" |

---

## Checkbox Fields (42 Total)

### Gender Selection (3 checkboxes)

| DocuSign Field Label | Checked When | APAApplication Model Path |
|---------------------|--------------|---------------------------|
| `genderMale` | gender = 'M' | `personalInfo.gender` |
| `genderFemale` | gender = 'F' | `personalInfo.gender` |
| `genderOther` | gender = 'Other' | `personalInfo.gender` |

### Mailing Address (1 checkbox)

| DocuSign Field Label | Checked When | Logic |
|---------------------|--------------|-------|
| `mailingAddressDifferentFromHomeAddress` | Has mailing address | If any mailing address field has value |

### Previously Contracted (2 checkboxes)

| DocuSign Field Label | Checked When | APAApplication Model Path |
|---------------------|--------------|---------------------------|
| `previouslyContractedYes` | answer = true | `complianceQuestions.previouslyContractedOther.answer` |
| `previouslyContractedNo` | answer = false | `complianceQuestions.previouslyContractedOther.answer` |

### Felony Conviction (2 checkboxes)

| DocuSign Field Label | Checked When | APAApplication Model Path |
|---------------------|--------------|---------------------------|
| `convictedOfFelonyYes` | answer = true | `complianceQuestions.felonyConviction.answer` |
| `convictedOfFelonyNo` | answer = false | `complianceQuestions.felonyConviction.answer` |

### Fraud Conviction (2 checkboxes)

| DocuSign Field Label | Checked When | APAApplication Model Path |
|---------------------|--------------|---------------------------|
| `convictedOfFraudYes` | answer = true | `complianceQuestions.misdemeanorFraud.answer` |
| `convictedOfFraudNo` | answer = false | `complianceQuestions.misdemeanorFraud.answer` |

### Civil Action (2 checkboxes)

| DocuSign Field Label | Checked When | APAApplication Model Path |
|---------------------|--------------|---------------------------|
| `subjectToCivilActionYes` | answer = true | `complianceQuestions.civilAction.answer` |
| `subjectToCivilActionNo` | answer = false | `complianceQuestions.civilAction.answer` |

### Insurance License Denied (2 checkboxes)

| DocuSign Field Label | Checked When | APAApplication Model Path |
|---------------------|--------------|---------------------------|
| `insuranceLicenseYes` | answer = true | `complianceQuestions.licenseDenied.answer` |
| `insuranceLicenseNo` | answer = false | `complianceQuestions.licenseDenied.answer` |

### Difficulty Obtaining Bond (2 checkboxes)

| DocuSign Field Label | Checked When | APAApplication Model Path |
|---------------------|--------------|---------------------------|
| `difficultyObtainingYes` | answer = true | `complianceQuestions.bondIssues.answer` |
| `difficultyObtainingNo` | answer = false | `complianceQuestions.bondIssues.answer` |

### Unsatisfied Judgments (2 checkboxes)

| DocuSign Field Label | Checked When | APAApplication Model Path |
|---------------------|--------------|---------------------------|
| `unsatisfiedJudgmentYes` | value = true | `financialBackground.unsatisfiedJudgments` |
| `unsatisfiedJudgmentNo` | value = false | `financialBackground.unsatisfiedJudgments` |

### Unsatisfied Tax Liens (2 checkboxes)

| DocuSign Field Label | Checked When | APAApplication Model Path |
|---------------------|--------------|---------------------------|
| `unsatisfiedTaxLiensYes` | value = true | `financialBackground.unsatisfiedLiens` |
| `unsatisfiedTaxLiensNo` | value = false | `financialBackground.unsatisfiedLiens` |

### Owe Insurance Company (2 checkboxes)

**Note**: Not currently tracked in model - defaults to "No"

| DocuSign Field Label | Checked When | Default |
|---------------------|--------------|---------|
| `oweInsuranceCompanyYes` | N/A | false |
| `oweInsuranceCompanyNo` | N/A | true |

### Bankruptcy Filed (2 checkboxes)

| DocuSign Field Label | Checked When | APAApplication Model Path |
|---------------------|--------------|---------------------------|
| `filedForBankruptcyYes` | filed = true | `financialBackground.bankruptcy.filed` |
| `filedForBankruptcyNo` | filed = false | `financialBackground.bankruptcy.filed` |

### Bankruptcy Chapter (3 checkboxes)

**Note**: Only checked if bankruptcy was filed

| DocuSign Field Label | Checked When | APAApplication Model Path |
|---------------------|--------------|---------------------------|
| `filedForBankruptcyYesLeftChapter7` | chapter = '7' | `financialBackground.bankruptcy.chapter` |
| `filedForBankruptcyYesLeftChapter11` | chapter = '11' | `financialBackground.bankruptcy.chapter` |
| `filedForBankruptcyYesLeftChapter13` | chapter = '13' | `financialBackground.bankruptcy.chapter` |

### Bankruptcy Status (3 checkboxes)

**Note**: Only checked if bankruptcy was filed

| DocuSign Field Label | Checked When | APAApplication Model Path |
|---------------------|--------------|---------------------------|
| `filedForBankruptcyYesRightDischarged` | status = 'Discharged' | `financialBackground.bankruptcy.status` |
| `filedForBankruptcyYesRightOpenPending` | status = 'Open' | `financialBackground.bankruptcy.status` |
| `filedForBankruptcyYesDismissed` | status = 'Dismissed' | `financialBackground.bankruptcy.status` |

### Currently Licensed (2 checkboxes)

| DocuSign Field Label | Checked When | APAApplication Model Path |
|---------------------|--------------|---------------------------|
| `currentlyLicensedToSellInsuranceYes` | value = true | `licensingStatus.currentlyLicensed` |
| `currentlyLicensedToSellInsuranceNo` | value = false | `licensingStatus.currentlyLicensed` |

### License Types (4 checkboxes)

| DocuSign Field Label | Checked When | APAApplication Model Path |
|---------------------|--------------|---------------------------|
| `licenseTypeLifeInsurance` | Array includes 'Life' | `licensingStatus.licenseTypes` |
| `licenseTypeHealthInsurance` | Array includes 'Health' | `licensingStatus.licenseTypes` |
| `licenseTypeLifeHealthInsurance` | Array includes 'Life & Health' | `licensingStatus.licenseTypes` |
| `licenseTypeOther` | Array includes 'Other' | `licensingStatus.licenseTypes` |

### License Status (3 checkboxes)

| DocuSign Field Label | Checked When | APAApplication Model Path |
|---------------------|--------------|---------------------------|
| `licenseStatusActive` | status = 'Active' | `licensingStatus.licenseStatus` |
| `licenseStatusInactive` | status = 'Inactive' | `licensingStatus.licenseStatus` |
| `licenseStatusPending` | status = 'Pending Renewal' or 'Pending' | `licensingStatus.licenseStatus` |

---

## Special Handling

### Locked Fields
All fields are set as `locked: true` which means:
- Fields are **read-only** during signing
- Values cannot be changed by the signer
- Ensures data integrity between application and signed document

### Conditional Fields
Some fields are only populated based on conditions:

1. **Compliance Explanations**: Only filled if answer is "Yes"
2. **Bankruptcy Details**: Only filled if bankruptcy was filed
3. **Mailing Address Checkbox**: Only checked if mailing address differs from home

### Date Formatting
Dates are formatted as `MM/DD/YYYY` using the `formatDate()` helper function.

### Array Fields
License types and states are arrays:
- **States**: Joined with commas (e.g., "CA, NV, AZ")
- **License Types**: Checked individually as separate checkboxes

---

## Code Reference

All field mapping logic is in:
```
backend/utils/docusign.js
Function: createSignerTabs(application)
```

Helper functions:
- `addTextTab(tabLabel, value, locked)` - Adds a text field
- `addCheckboxTab(tabLabel, selected)` - Adds a checkbox
- `formatDate(dateString)` - Formats dates for DocuSign

---

## Troubleshooting Field Issues

### Field Not Showing Value
1. Check field label matches exactly (case-sensitive)
2. Verify data exists in APAApplication document
3. Check console logs for field mapping
4. Ensure field is not conditionally excluded

### Checkbox Not Checked
1. Verify boolean value is exactly `true` or `false`
2. Check array membership for license types
3. Review conditional logic for bankruptcy fields

### Field Shows Wrong Value
1. Check data type conversion (boolean to string)
2. Verify date formatting
3. Review array-to-string conversion logic

---

## Quick Test

To verify field mapping, use:
```javascript
const application = {
  personalInfo: { legalFirstName: 'Test' },
  // ... rest of data
};
const tabs = createSignerTabs(application);
console.log('Text Tabs:', tabs.textTabs.length);
console.log('Checkbox Tabs:', tabs.checkboxTabs.length);
```

Expected output:
- Text Tabs: 33
- Checkbox Tabs: Varies (32-42 depending on conditions)
