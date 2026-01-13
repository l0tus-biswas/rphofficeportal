require('dotenv').config();
const mongoose = require('mongoose');
const APAApplication = require('../models/APAApplication');

/**
 * Check application status and manually trigger payment email if needed
 */

async function checkAndTriggerPayment() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Get the most recent completed application
    const application = await APAApplication.findOne({ 
      'docusign.status': 'completed' 
    }).sort({ 'docusign.signedDate': -1 });

    if (!application) {
      console.log('❌ No completed DocuSign applications found');
      console.log('\nLooking for any recent applications...');
      
      const recentApps = await APAApplication.find().sort({ submittedAt: -1 }).limit(5);
      console.log(`\nFound ${recentApps.length} recent applications:`);
      
      recentApps.forEach(app => {
        console.log(`\n- ID: ${app._id}`);
        console.log(`  Email: ${app.personalInfo.email}`);
        console.log(`  Status: ${app.status}`);
        console.log(`  DocuSign Status: ${app.docusign?.status || 'N/A'}`);
        console.log(`  DocuSign Envelope ID: ${app.docusign?.envelopeId || 'N/A'}`);
        console.log(`  Signed Date: ${app.docusign?.signedDate || 'N/A'}`);
      });
      
      process.exit(0);
    }

    console.log('\n=== Application Found ===');
    console.log('Application ID:', application._id);
    console.log('Email:', application.personalInfo.email);
    console.log('Name:', `${application.personalInfo.legalFirstName} ${application.personalInfo.legalLastName}`);
    console.log('Application Status:', application.status);
    console.log('DocuSign Status:', application.docusign.status);
    console.log('DocuSign Envelope ID:', application.docusign.envelopeId);
    console.log('Signed Date:', application.docusign.signedDate);
    console.log('Submitted At:', application.submittedAt);

    // Check if payment email should have been sent
    if (application.docusign.status === 'completed') {
      if (application.status === 'pending_payment') {
        console.log('\n✅ Application status is correct (pending_payment)');
        console.log('Payment email should have been sent when status changed.');
        console.log('\nManually triggering payment email now...');
        
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
        
      } else {
        console.log('\n⚠️ WARNING: DocuSign is completed but application status is:', application.status);
        console.log('Expected status: pending_payment');
        console.log('\nUpdating application status and sending payment email...');
        
        application.status = 'pending_payment';
        await application.save();
        
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
        
        console.log('✅ Status updated and payment email sent to:', email);
        console.log('Payment URL:', paymentUrl);
      }
    }

    console.log('\n✅ Done!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkAndTriggerPayment();
