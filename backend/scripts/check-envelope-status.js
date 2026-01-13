require('dotenv').config();
const mongoose = require('mongoose');
const APAApplication = require('../models/APAApplication');

/**
 * Check status of a specific envelope and manually update if needed
 */

async function checkEnvelope() {
  try {
    const envelopeId = process.argv[2];
    
    if (!envelopeId) {
      console.error('❌ Please provide envelope ID as argument');
      console.log('Usage: node check-envelope-status.js <ENVELOPE_ID>');
      console.log('Example: node check-envelope-status.js c4de2248-9943-83ce-8070-e2933a140c97');
      process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    console.log(`=== Checking Envelope: ${envelopeId} ===\n`);

    // Find application by envelope ID
    const application = await APAApplication.findOne({ 'docusign.envelopeId': envelopeId });

    if (!application) {
      console.log('❌ No application found with this envelope ID');
      console.log('\nSearching for recent applications...\n');
      
      const recentApps = await APAApplication.find()
        .sort({ submittedAt: -1 })
        .limit(5);
      
      console.log('Recent applications:');
      recentApps.forEach(app => {
        console.log(`\n- Application ID: ${app._id}`);
        console.log(`  Email: ${app.personalInfo.email}`);
        console.log(`  Name: ${app.personalInfo.legalFirstName} ${app.personalInfo.legalLastName}`);
        console.log(`  Status: ${app.status}`);
        console.log(`  DocuSign Status: ${app.docusign?.status || 'N/A'}`);
        console.log(`  Envelope ID: ${app.docusign?.envelopeId || 'N/A'}`);
      });
      
      process.exit(1);
    }

    console.log('📄 Application Found:');
    console.log('Application ID:', application._id);
    console.log('Name:', `${application.personalInfo.legalFirstName} ${application.personalInfo.legalLastName}`);
    console.log('Email:', application.personalInfo.email);
    console.log('Current Status:', application.status);
    console.log('DocuSign Status:', application.docusign.status);
    console.log('Envelope ID:', application.docusign.envelopeId);
    console.log('Signed Date:', application.docusign.signedDate || 'Not signed yet');
    console.log('Submitted At:', application.submittedAt);
    console.log('');

    // Check if needs update
    if (application.docusign.status === 'completed' && application.status !== 'pending_payment') {
      console.log('⚠️ WARNING: DocuSign shows completed but application status is not pending_payment');
      console.log('This means the webhook processed but status update failed.\n');
      console.log('Fixing now...\n');
      
      application.status = 'pending_payment';
      application.docusign.signedDate = application.docusign.signedDate || new Date();
      await application.save();
      
      console.log('✅ Status updated to pending_payment');
      
      // Send payment email
      const { sendEmail } = require('../utils/email');
      const { legalFirstName, email } = application.personalInfo;
      const paymentUrl = `${process.env.APP_URL || 'http://localhost:4200'}/apa-payment?applicationId=${application._id}`;
      
      await sendEmail({
        email: email,
        subject: 'APA Agreement Signed - Complete Payment Setup',
        html: `
          <h2>Welcome aboard, ${legalFirstName}!</h2>
          <p>Thank you for signing the Agent Partnership Agreement.</p>
          <p>To complete your onboarding, please set up your payment information:</p>
          <p><a href="${paymentUrl}" style="display: inline-block; padding: 12px 24px; background: #4CAF50; color: white; text-decoration: none; border-radius: 4px;">Complete Payment Setup</a></p>
          <p>This link will take you to a secure payment page where you can:</p>
          <ul>
            <li>Pay the one-time onboarding fee (or use code LICENSED if already licensed)</li>
            <li>Set up recurring monthly CRM access fee ($25/month)</li>
          </ul>
          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
          <p style="text-align: center; color: #999; font-size: 12px;">
            &copy; 2025 ${process.env.SMTP_FROM_NAME || 'RHP Office'}. All rights reserved.<br>
            <a href="${process.env.APP_URL}" style="color: #4CAF50; text-decoration: none;">${process.env.APP_URL || 'rhpoffice.com'}</a>
          </p>
        `
      });
      
      console.log('✅ Payment email sent to:', email);
      console.log('Payment URL:', paymentUrl);
    } else if (application.status === 'pending_payment') {
      console.log('✅ Status is correct: pending_payment');
      console.log('Payment email should have been sent already.');
      console.log('\nIf email was not received, resending now...\n');
      
      const { sendEmail } = require('../utils/email');
      const { legalFirstName, email } = application.personalInfo;
      const paymentUrl = `${process.env.APP_URL || 'http://localhost:4200'}/apa-payment?applicationId=${application._id}`;
      
      await sendEmail({
        email: email,
        subject: 'APA Agreement Signed - Complete Payment Setup',
        html: `
          <h2>Welcome aboard, ${legalFirstName}!</h2>
          <p>Thank you for signing the Agent Partnership Agreement.</p>
          <p>To complete your onboarding, please set up your payment information:</p>
          <p><a href="${paymentUrl}" style="display: inline-block; padding: 12px 24px; background: #4CAF50; color: white; text-decoration: none; border-radius: 4px;">Complete Payment Setup</a></p>
          <p>This link will take you to a secure payment page where you can:</p>
          <ul>
            <li>Pay the one-time onboarding fee (or use code LICENSED if already licensed)</li>
            <li>Set up recurring monthly CRM access fee ($25/month)</li>
          </ul>
          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
          <p style="text-align: center; color: #999; font-size: 12px;">
            &copy; 2025 ${process.env.SMTP_FROM_NAME || 'RHP Office'}. All rights reserved.<br>
            <a href="${process.env.APP_URL}" style="color: #4CAF50; text-decoration: none;">${process.env.APP_URL || 'rhpoffice.com'}</a>
          </p>
        `
      });
      
      console.log('✅ Payment email resent to:', email);
      console.log('Payment URL:', paymentUrl);
    } else {
      console.log('ℹ️ Current status:', application.status);
      console.log('DocuSign status:', application.docusign.status);
      console.log('No action needed at this time.');
    }

    console.log('\n✅ Done!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkEnvelope();
