/**
 * Test Script for New DocuSign Template Integration
 * 
 * This script simulates the APA application submission and DocuSign envelope creation
 * to verify that all fields are correctly mapped from the application data to the template.
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { createAPAEnvelope } = require('../utils/docusign');

// Sample application data - matches the structure from APAApplication model
const testApplicationData = {
  personalInfo: {
    legalFirstName: 'John',
    legalMiddleName: 'Michael',
    legalLastName: 'Doe',
    gender: 'M',
    dateOfBirth: new Date('1985-06-15'),
    ssn: '123-45-6789',
    mobilePhone: '(555) 123-4567',
    email: 'john.doe.test@example.com',
    homeAddress: {
      street: '123 Main Street',
      city: 'Los Angeles',
      state: 'CA',
      zipCode: '90001'
    },
    mailingAddress: {
      street: '456 Oak Avenue',
      city: 'Santa Monica',
      state: 'CA',
      zipCode: '90401'
    },
    previouslyContracted: false
  },
  
  recruitingInfo: {
    recruiterFullName: 'Jane Smith',
    recruiterAgentId: 'AGT12345',
    recruiterContact: 'jane.smith@rhp.com',
    uplineLeaderName: 'Bob Johnson',
    teamName: 'Elite Team Alpha',
    referralCode: 'TESTREF123'
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
      answer: false,
      explanation: ''
    }
  },
  
  financialBackground: {
    unsatisfiedJudgments: false,
    unsatisfiedLiens: false,
    bankruptcy: {
      filed: false,
      chapter: null,
      status: null
    }
  },
  
  licensingStatus: {
    currentlyLicensed: true,
    licenseTypes: ['Life & Health'],
    statesLicensed: ['CA', 'NV', 'AZ'],
    licenseNumber: 'CA-LH-12345678',
    licenseStatus: 'Active',
    licenseOtherDescription: ''
  },
  
  status: 'pending_signature',
  submittedAt: new Date()
};

// Test application with bankruptcy history
const testApplicationWithBankruptcy = {
  ...testApplicationData,
  personalInfo: {
    ...testApplicationData.personalInfo,
    legalFirstName: 'Sarah',
    legalLastName: 'Williams',
    email: 'sarah.williams.test@example.com'
  },
  financialBackground: {
    unsatisfiedJudgments: true,
    unsatisfiedLiens: false,
    bankruptcy: {
      filed: true,
      chapter: '7',
      status: 'Discharged'
    }
  }
};

// Test application with compliance issues
const testApplicationWithComplianceIssues = {
  ...testApplicationData,
  personalInfo: {
    ...testApplicationData.personalInfo,
    legalFirstName: 'Michael',
    legalLastName: 'Brown',
    email: 'michael.brown.test@example.com'
  },
  complianceQuestions: {
    previouslyContractedOther: {
      answer: true,
      explanation: 'I was previously contracted with ABC Insurance from 2015-2018.'
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
      answer: true,
      explanation: 'Civil lawsuit related to contract dispute, resolved in 2019.'
    },
    licenseDenied: {
      answer: false,
      explanation: ''
    },
    bondIssues: {
      answer: false,
      explanation: ''
    }
  }
};

async function runTest(testName, applicationData) {
  console.log('\n' + '='.repeat(80));
  console.log(`TEST: ${testName}`);
  console.log('='.repeat(80) + '\n');
  
  try {
    console.log('Application Data:');
    console.log('- Name:', `${applicationData.personalInfo.legalFirstName} ${applicationData.personalInfo.legalMiddleName || ''} ${applicationData.personalInfo.legalLastName}`.trim());
    console.log('- Email:', applicationData.personalInfo.email);
    console.log('- Gender:', applicationData.personalInfo.gender);
    console.log('- DOB:', applicationData.personalInfo.dateOfBirth.toLocaleDateString());
    console.log('- Address:', `${applicationData.personalInfo.homeAddress.street}, ${applicationData.personalInfo.homeAddress.city}, ${applicationData.personalInfo.homeAddress.state} ${applicationData.personalInfo.homeAddress.zipCode}`);
    console.log('- Recruiter:', applicationData.recruitingInfo.recruiterFullName);
    console.log('- Team:', applicationData.recruitingInfo.teamName);
    console.log('- Licensed:', applicationData.licensingStatus.currentlyLicensed ? 'Yes' : 'No');
    console.log('- License Types:', applicationData.licensingStatus.licenseTypes.join(', '));
    console.log('- States Licensed:', applicationData.licensingStatus.statesLicensed.join(', '));
    console.log('- Bankruptcy Filed:', applicationData.financialBackground.bankruptcy.filed ? 'Yes' : 'No');
    
    if (applicationData.financialBackground.bankruptcy.filed) {
      console.log('  - Chapter:', applicationData.financialBackground.bankruptcy.chapter);
      console.log('  - Status:', applicationData.financialBackground.bankruptcy.status);
    }
    
    console.log('\n--- Creating DocuSign Envelope ---\n');
    
    const result = await createAPAEnvelope(applicationData);
    
    console.log('✅ SUCCESS!');
    console.log('Envelope ID:', result.envelopeId);
    console.log('Status:', result.status);
    console.log('\nDocuSign email should be sent to:', applicationData.personalInfo.email);
    console.log('\n✅ TEST PASSED: Envelope created successfully\n');
    
    return { success: true, envelopeId: result.envelopeId };
    
  } catch (error) {
    console.error('❌ TEST FAILED!');
    console.error('Error:', error.message);
    if (error.response?.body) {
      console.error('Response:', JSON.stringify(error.response.body, null, 2));
    }
    console.error('\n❌ TEST FAILED: Unable to create envelope\n');
    
    return { success: false, error: error.message };
  }
}

async function runAllTests() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    DOCUSIGN NEW TEMPLATE INTEGRATION TEST                      ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════╝');
  console.log('\nTemplate ID:', process.env.DOCUSIGN_TEMPLATE_ID);
  console.log('Account ID:', process.env.DOCUSIGN_ACCOUNT_ID);
  console.log('Base Path:', process.env.DOCUSIGN_BASE_PATH);
  
  const results = [];
  
  // Test 1: Standard application
  const test1 = await runTest('Standard Application (Clean Record)', testApplicationData);
  results.push({ name: 'Standard Application', ...test1 });
  
  // Wait a bit between tests to avoid rate limiting
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test 2: Application with bankruptcy
  const test2 = await runTest('Application with Bankruptcy History', testApplicationWithBankruptcy);
  results.push({ name: 'Bankruptcy History', ...test2 });
  
  // Wait a bit between tests
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test 3: Application with compliance issues
  const test3 = await runTest('Application with Compliance Issues', testApplicationWithComplianceIssues);
  results.push({ name: 'Compliance Issues', ...test3 });
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('TEST SUMMARY');
  console.log('='.repeat(80) + '\n');
  
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  results.forEach((result, index) => {
    const status = result.success ? '✅ PASSED' : '❌ FAILED';
    console.log(`${index + 1}. ${result.name}: ${status}`);
    if (result.success) {
      console.log(`   Envelope ID: ${result.envelopeId}`);
    } else {
      console.log(`   Error: ${result.error}`);
    }
  });
  
  console.log('\n' + '-'.repeat(80));
  console.log(`Total Tests: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log('-'.repeat(80) + '\n');
  
  if (failed === 0) {
    console.log('🎉 ALL TESTS PASSED! 🎉');
    console.log('\nNext Steps:');
    console.log('1. Check your email for the DocuSign signing requests');
    console.log('2. Open each envelope and verify all fields are pre-filled correctly');
    console.log('3. Verify that text fields are locked (read-only)');
    console.log('4. Complete the signing process');
    console.log('5. Verify webhook updates the application status\n');
  } else {
    console.log('⚠️  SOME TESTS FAILED');
    console.log('\nPlease review the errors above and check:');
    console.log('- DocuSign credentials are correct');
    console.log('- Template ID matches your DocuSign account');
    console.log('- Template role name is "agent" (case-sensitive)');
    console.log('- All required fields exist in the template\n');
  }
  
  process.exit(failed === 0 ? 0 : 1);
}

// Check required environment variables
function checkEnvironment() {
  const required = [
    'DOCUSIGN_INTEGRATION_KEY',
    'DOCUSIGN_ACCOUNT_ID',
    'DOCUSIGN_USER_ID',
    'DOCUSIGN_TEMPLATE_ID'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(key => console.error(`   - ${key}`));
    console.error('\nPlease update your .env file and try again.\n');
    process.exit(1);
  }
  
  if (!process.env.DOCUSIGN_PRIVATE_KEY && !process.env.DOCUSIGN_PRIVATE_KEY_PATH) {
    console.error('❌ Missing DocuSign private key configuration');
    console.error('   Set either DOCUSIGN_PRIVATE_KEY or DOCUSIGN_PRIVATE_KEY_PATH\n');
    process.exit(1);
  }
  
  console.log('✅ Environment variables check passed\n');
}

// Run tests
checkEnvironment();
runAllTests().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
