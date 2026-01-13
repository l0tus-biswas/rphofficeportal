require('dotenv').config();
const mongoose = require('mongoose');
const APAApplication = require('../models/APAApplication');

const envelopeId = '4d3420b8-ce24-8a0a-8135-63c9bb1d0c7e';

async function checkEnvelope() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const application = await APAApplication.findOne({
      'docusign.envelopeId': envelopeId
    });

    if (!application) {
      console.log(`\n❌ No application found with envelope ID: ${envelopeId}`);
      
      // Show recent applications
      const recentApps = await APAApplication.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select('personalInfo.firstName personalInfo.lastName personalInfo.email status docusign.envelopeId createdAt');
      
      console.log('\n📋 Recent 5 applications:');
      recentApps.forEach((app, index) => {
        console.log(`\n${index + 1}. ${app.personalInfo.firstName} ${app.personalInfo.lastName}`);
        console.log(`   Email: ${app.personalInfo.email}`);
        console.log(`   Status: ${app.status}`);
        console.log(`   Envelope ID: ${app.docusign?.envelopeId || 'N/A'}`);
        console.log(`   Created: ${app.createdAt}`);
      });
    } else {
      console.log(`\n✅ Application found!`);
      console.log(`   Name: ${application.personalInfo.firstName} ${application.personalInfo.lastName}`);
      console.log(`   Email: ${application.personalInfo.email}`);
      console.log(`   Status: ${application.status}`);
      console.log(`   DocuSign Status: ${application.docusign?.status || 'N/A'}`);
      console.log(`   Envelope ID: ${application.docusign?.envelopeId}`);
      console.log(`   Created: ${application.createdAt}`);
      console.log(`   Updated: ${application.updatedAt}`);
      
      if (application.status === 'pending_payment') {
        console.log('\n✅ Status is already pending_payment - webhook worked!');
      } else if (application.status === 'pending_signature') {
        console.log('\n⚠️ Status is still pending_signature - webhook did not update it');
        console.log('\nThis means the webhook received the event but did not update the application.');
      }
    }

    await mongoose.disconnect();
    console.log('\n✅ Done');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkEnvelope();
