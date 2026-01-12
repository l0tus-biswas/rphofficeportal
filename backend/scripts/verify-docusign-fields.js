/**
 * DocuSign Field Mapping Verification Script
 * 
 * This script helps verify that all application form fields
 * are properly mapped to DocuSign template fields.
 * 
 * Usage: node scripts/verify-docusign-fields.js
 */

// Sample application data with all fields populated
const sampleApplication = {
  personalInfo: {
    legalFirstName: 'John',
    legalMiddleName: 'Michael',
    legalLastName: 'Smith',
    gender: 'Male',
    dateOfBirth: '1985-06-15',
    ssn: '123-45-6789',
    mobilePhone: '555-123-4567',
    email: 'john.smith@example.com',
    homeAddress: {
      street: '123 Main Street',
      city: 'Springfield',
      state: 'IL',
      zipCode: '62701'
    },
    mailingAddress: {
      street: 'PO Box 456',
      city: 'Chicago',
      state: 'IL',
      zipCode: '60601'
    }
  },
  recruitingInfo: {
    recruiterFullName: 'Jane Doe',
    recruiterAgentId: 'AG12345',
    recruiterContact: 'jane.doe@rhp.com',
    uplineLeaderName: 'Bob Johnson',
    teamName: 'Elite Team',
    referralCode: 'REF2024XYZ'
  },
  complianceQuestions: {
    previouslyContractedOther: {
      answer: false,
      explanation: ''
    },
    felonyConviction: {
      answer: false,
      explanation: ''
    },
    misdemeanorFraud: {
      answer: false,
      explanation: ''
    },
    civilAction: {
      answer: false,
      explanation: ''
    },
    licenseDenied: {
      answer: false,
      explanation: ''
    },
    bondIssues: {
      answer: true,
      explanation: 'Previous bond was cancelled due to non-payment, resolved in 2023'
    }
  },
  financialBackground: {
    unsatisfiedJudgments: false,
    unsatisfiedLiens: false,
    bankruptcy: {
      filed: false,
      chapter: '',
      status: ''
    }
  },
  licensingStatus: {
    currentlyLicensed: true,
    licenseTypes: 'Life, Health, Accident',
    statesLicensed: ['IL', 'IN', 'WI'],
    licenseNumber: 'IL-12345678',
    licenseStatus: 'Active'
  },
  _id: '507f1f77bcf86cd799439011'
};

// Expected DocuSign tab labels
const expectedFields = {
  personalInfo: [
    'applicant_first_name',
    'applicant_middle_name',
    'applicant_last_name',
    'applicant_full_name',
    'applicant_gender',
    'applicant_dob',
    'applicant_ssn',
    'applicant_phone',
    'applicant_email',
    'home_street',
    'home_city',
    'home_state',
    'home_zip',
    'home_address_full',
    'mailing_street',
    'mailing_city',
    'mailing_state',
    'mailing_zip',
    'mailing_address_full'
  ],
  recruitingInfo: [
    'recruiter_name',
    'recruiter_agent_id',
    'recruiter_contact',
    'upline_leader',
    'team_name',
    'referral_code'
  ],
  complianceQuestions: [
    'prev_contracted_other',
    'prev_contracted_other_explain',
    'felony_conviction',
    'felony_conviction_explain',
    'misdemeanor_fraud',
    'misdemeanor_fraud_explain',
    'civil_action',
    'civil_action_explain',
    'license_denied',
    'license_denied_explain',
    'bond_issues',
    'bond_issues_explain'
  ],
  financialBackground: [
    'unsatisfied_judgments',
    'unsatisfied_liens',
    'bankruptcy_filed',
    'bankruptcy_chapter',
    'bankruptcy_status'
  ],
  licensingStatus: [
    'currently_licensed',
    'license_types',
    'states_licensed',
    'license_number',
    'license_status'
  ],
  metadata: [
    'application_date',
    'application_id'
  ]
};

// Helper functions (matching backend/utils/docusign.js)
function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

function formatYesNo(value) {
  if (value === true || value === 'true' || value === 'yes' || value === 'Yes') {
    return 'Yes';
  } else if (value === false || value === 'false' || value === 'no' || value === 'No') {
    return 'No';
  }
  return '';
}

function formatAddressObject(address) {
  if (!address) return '';
  const parts = [];
  if (address.street) parts.push(address.street);
  if (address.city) parts.push(address.city);
  if (address.state) parts.push(address.state);
  if (address.zipCode) parts.push(address.zipCode);
  return parts.join(', ');
}

// Simulate createSignerTabs function
function generateFieldMapping(application) {
  const mapping = {};
  const personalInfo = application.personalInfo || {};
  const recruitingInfo = application.recruitingInfo || {};
  const compliance = application.complianceQuestions || {};
  const financial = application.financialBackground || {};
  const licensing = application.licensingStatus || {};

  // Personal Information
  mapping['applicant_first_name'] = personalInfo.legalFirstName || '';
  mapping['applicant_middle_name'] = personalInfo.legalMiddleName || '';
  mapping['applicant_last_name'] = personalInfo.legalLastName || '';
  mapping['applicant_full_name'] = `${personalInfo.legalFirstName || ''} ${personalInfo.legalMiddleName || ''} ${personalInfo.legalLastName || ''}`.replace(/\s+/g, ' ').trim();
  mapping['applicant_gender'] = personalInfo.gender || '';
  mapping['applicant_dob'] = formatDate(personalInfo.dateOfBirth);
  mapping['applicant_ssn'] = personalInfo.ssn || '***-**-****';
  mapping['applicant_phone'] = personalInfo.mobilePhone || '';
  mapping['applicant_email'] = personalInfo.email || '';

  if (personalInfo.homeAddress) {
    mapping['home_street'] = personalInfo.homeAddress.street || '';
    mapping['home_city'] = personalInfo.homeAddress.city || '';
    mapping['home_state'] = personalInfo.homeAddress.state || '';
    mapping['home_zip'] = personalInfo.homeAddress.zipCode || '';
    mapping['home_address_full'] = formatAddressObject(personalInfo.homeAddress);
  }

  if (personalInfo.mailingAddress) {
    mapping['mailing_street'] = personalInfo.mailingAddress.street || '';
    mapping['mailing_city'] = personalInfo.mailingAddress.city || '';
    mapping['mailing_state'] = personalInfo.mailingAddress.state || '';
    mapping['mailing_zip'] = personalInfo.mailingAddress.zipCode || '';
    mapping['mailing_address_full'] = formatAddressObject(personalInfo.mailingAddress);
  }

  // Recruiting Information
  mapping['recruiter_name'] = recruitingInfo.recruiterFullName || '';
  mapping['recruiter_agent_id'] = recruitingInfo.recruiterAgentId || '';
  mapping['recruiter_contact'] = recruitingInfo.recruiterContact || '';
  mapping['upline_leader'] = recruitingInfo.uplineLeaderName || '';
  mapping['team_name'] = recruitingInfo.teamName || '';
  mapping['referral_code'] = recruitingInfo.referralCode || '';

  // Compliance Questions
  if (compliance.previouslyContractedOther) {
    mapping['prev_contracted_other'] = formatYesNo(compliance.previouslyContractedOther.answer);
    mapping['prev_contracted_other_explain'] = compliance.previouslyContractedOther.explanation || '';
  }

  if (compliance.felonyConviction) {
    mapping['felony_conviction'] = formatYesNo(compliance.felonyConviction.answer);
    mapping['felony_conviction_explain'] = compliance.felonyConviction.explanation || '';
  }

  if (compliance.misdemeanorFraud) {
    mapping['misdemeanor_fraud'] = formatYesNo(compliance.misdemeanorFraud.answer);
    mapping['misdemeanor_fraud_explain'] = compliance.misdemeanorFraud.explanation || '';
  }

  if (compliance.civilAction) {
    mapping['civil_action'] = formatYesNo(compliance.civilAction.answer);
    mapping['civil_action_explain'] = compliance.civilAction.explanation || '';
  }

  if (compliance.licenseDenied) {
    mapping['license_denied'] = formatYesNo(compliance.licenseDenied.answer);
    mapping['license_denied_explain'] = compliance.licenseDenied.explanation || '';
  }

  if (compliance.bondIssues) {
    mapping['bond_issues'] = formatYesNo(compliance.bondIssues.answer);
    mapping['bond_issues_explain'] = compliance.bondIssues.explanation || '';
  }

  // Financial Background
  mapping['unsatisfied_judgments'] = formatYesNo(financial.unsatisfiedJudgments);
  mapping['unsatisfied_liens'] = formatYesNo(financial.unsatisfiedLiens);

  if (financial.bankruptcy) {
    mapping['bankruptcy_filed'] = formatYesNo(financial.bankruptcy.filed);
    mapping['bankruptcy_chapter'] = financial.bankruptcy.chapter || '';
    mapping['bankruptcy_status'] = financial.bankruptcy.status || '';
  }

  // Licensing Status
  mapping['currently_licensed'] = formatYesNo(licensing.currentlyLicensed);
  mapping['license_types'] = licensing.licenseTypes || '';
  mapping['license_number'] = licensing.licenseNumber || '';
  mapping['license_status'] = licensing.licenseStatus || '';

  if (licensing.statesLicensed && Array.isArray(licensing.statesLicensed)) {
    mapping['states_licensed'] = licensing.statesLicensed.join(', ');
  }

  // Metadata
  mapping['application_date'] = formatDate(new Date());
  mapping['application_id'] = application._id ? application._id.toString() : '';

  return mapping;
}

// Main verification
console.log('='.repeat(70));
console.log('DocuSign Field Mapping Verification');
console.log('='.repeat(70));
console.log('');

const fieldMapping = generateFieldMapping(sampleApplication);

console.log('📋 GENERATED FIELD MAPPINGS:');
console.log('');

// Count fields
let totalFields = 0;
let populatedFields = 0;

Object.keys(expectedFields).forEach(section => {
  console.log(`\n📁 ${section.toUpperCase()}`);
  console.log('-'.repeat(70));
  
  expectedFields[section].forEach(fieldName => {
    totalFields++;
    const value = fieldMapping[fieldName];
    const hasValue = value && value.trim() !== '';
    
    if (hasValue) {
      populatedFields++;
      console.log(`  ✅ ${fieldName.padEnd(35)} = "${value}"`);
    } else {
      console.log(`  ⚠️  ${fieldName.padEnd(35)} = (empty)`);
    }
  });
});

console.log('');
console.log('='.repeat(70));
console.log('📊 SUMMARY');
console.log('='.repeat(70));
console.log(`Total Fields Defined:      ${totalFields}`);
console.log(`Populated with Data:       ${populatedFields}`);
console.log(`Empty Fields:              ${totalFields - populatedFields}`);
console.log(`Coverage:                  ${((populatedFields / totalFields) * 100).toFixed(1)}%`);
console.log('');

// Check for missing mappings
const definedFields = Object.keys(fieldMapping);
const allExpectedFields = Object.values(expectedFields).flat();
const missingInCode = allExpectedFields.filter(f => !definedFields.includes(f));

if (missingInCode.length > 0) {
  console.log('❌ MISSING MAPPINGS IN CODE:');
  missingInCode.forEach(field => console.log(`  - ${field}`));
  console.log('');
}

// Generate template checklist
console.log('='.repeat(70));
console.log('📝 DOCUSIGN TEMPLATE CHECKLIST');
console.log('='.repeat(70));
console.log('');
console.log('Ensure your DocuSign template has these Text Tab labels:');
console.log('');

allExpectedFields.sort().forEach((field, index) => {
  console.log(`${(index + 1).toString().padStart(2)}. ${field}`);
});

console.log('');
console.log('='.repeat(70));
console.log('✅ Verification Complete!');
console.log('');
console.log('Next Steps:');
console.log('1. Update your DocuSign template with the field labels above');
console.log('2. Ensure each field is assigned to "Applicant" role');
console.log('3. Set fields as "Read Only" so API can pre-fill them');
console.log('4. Test with real application submission');
console.log('='.repeat(70));
