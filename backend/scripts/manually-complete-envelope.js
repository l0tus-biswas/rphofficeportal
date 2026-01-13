require('dotenv').config();
const mongoose = require('mongoose');
const APAApplication = require('../models/APAApplication');
const { sendEmail } = require('../utils/email');

/**
 * Manually mark envelope as completed and send payment email
 */

async function manuallyCompleteEnvelope() {
  try {
    const envelopeId = process.argv[2];
    
    if (!envelopeId) {
      console.error('❌ Please provide envelope ID as argument');
      console.log('Usage: node manually-complete-envelope.js <ENVELOPE_ID>');
      process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find application by envelope ID
    const application = await APAApplication.findOne({ 'docusign.envelopeId': envelopeId });

    if (!application) {
      console.log('❌ No application found with envelope ID:', envelopeId);
      process.exit(1);
    }

    console.log('📄 Application Found:');
    console.log('Application ID:', application._id);
    console.log('Name:', `${application.personalInfo.legalFirstName} ${application.personalInfo.legalLastName}`);
    console.log('Email:', application.personalInfo.email);
    console.log('Current Status:', application.status);
    console.log('Current DocuSign Status:', application.docusign.status);
    console.log('');

    // Update to completed
    console.log('🔄 Updating status to completed and pending_payment...');
    application.docusign.status = 'completed';
    application.docusign.signedDate = new Date();
    application.status = 'pending_payment';
    await application.save();
    console.log('✅ Status updated!\n');

    // Send payment email
    console.log('📧 Sending payment email...');
    const { legalFirstName, email } = application.personalInfo;
    const paymentUrl = `${process.env.APP_URL || 'http://localhost:4200'}/apa-payment?applicationId=${application._id}`;
    
    await sendEmail({
      email: email,
      subject: 'APA Agreement Signed - Complete Payment Setup',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4CAF50;">Welcome aboard, ${legalFirstName}! 🎉</h2>
          <p>Thank you for signing the Agent Partnership Agreement.</p>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #333;">Next Step: Complete Your Payment Setup</h3>
            <p>To activate your account and begin your journey with us, please complete your payment information.</p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${paymentUrl}" style="display: inline-block; padding: 15px 40px; background: #4CAF50; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">💳 Complete Payment Setup</a>
          </div>

          <div style="background: #e3f2fd; border-left: 4px solid #2196F3; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <h4 style="margin-top: 0; color: #1565C0;">What You'll Need to Complete:</h4>
            <ul style="margin: 10px 0; padding-left: 20px; color: #1565C0;">
              <li><strong>One-time onboarding fee</strong> (or use code <strong>LICENSED</strong> if you're already licensed)</li>
              <li><strong>Monthly CRM access fee</strong> - $25/month for platform access</li>
            </ul>
          </div>

          <p style="color: #666; font-size: 14px; margin-top: 30px;">If the button doesn't work, copy and paste this link into your browser:<br>
          <span style="color: #007bff; word-break: break-all;">${paymentUrl}</span></p>
          
          <p style="color: #666; font-size: 14px;">Once your payment is completed, your account will be activated and you'll receive your login credentials.</p>
          
          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
          <p style="text-align: center; color: #999; font-size: 12px;">
            &copy; 2026 ${process.env.SMTP_FROM_NAME || 'RHP Office'}. All rights reserved.<br>
            <a href="${process.env.APP_URL}" style="color: #4CAF50; text-decoration: none;">${process.env.APP_URL || 'rhpoffice.com'}</a>
          </p>
        </div>
      `
    });
    
    console.log('✅ Payment email sent to:', email);
    console.log('📍 Payment URL:', paymentUrl);
    console.log('');
    console.log('✅ All done! User can now complete payment.');

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

manuallyCompleteEnvelope();
