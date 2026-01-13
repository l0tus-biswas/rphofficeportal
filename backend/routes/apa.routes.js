const express = require('express');
const router = express.Router();
const APAApplication = require('../models/APAApplication');
const User = require('../models/User');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { sendResponse, errorResponse, generatePassword } = require('../utils/helpers');
const { sendEmail } = require('../utils/email');
const { applyLimiter } = require('../middleware/rateLimiter.middleware');
const { 
  createAPAEnvelope, 
  getEnvelopeStatus, 
  downloadSignedDocument,
  processWebhook,
  validateWebhookSignature,
  getTemplateFields
} = require('../utils/docusign');

// TEST ROUTE - Get DocuSign template fields
router.get('/test-template-fields', async (req, res) => {
  try {
    const template = await getTemplateFields();
    res.json({ success: true, template });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// @route   GET /api/public/check-pending-application
// @desc    Check if user has a pending signature application
// @access  Public
router.get('/check-pending-application', async (req, res) => {
  try {
    const { email, ref } = req.query;

    if (!email || !ref) {
      return res.json({ application: null });
    }

    const application = await APAApplication.findOne({ 
      'personalInfo.email': email.toLowerCase(),
      'recruitingInfo.referralCode': ref,
      status: 'pending_signature'
    });

    if (application) {
      return res.json({ 
        application: {
          _id: application._id,
          status: application.status,
          envelopeId: application.docusign?.envelopeId
        }
      });
    }

    return res.json({ application: null });
  } catch (error) {
    console.error('Error checking pending application:', error);
    return res.json({ application: null });
  }
});

// Configure multer for compliance document uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads/apa-compliance');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'compliance-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|pdf|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only documents and images are allowed'));
    }
  }
});

// @route   POST /api/public/apa-application
// @desc    Submit APA application (Step 1 - Form submission)
// @access  Public
router.post('/apa-application', applyLimiter, async (req, res) => {
  try {
    const { personalInfo, recruitingInfo, complianceQuestions, financialBackground, licensingStatus } = req.body;

    // Validate required fields
    if (!personalInfo?.legalFirstName || !personalInfo?.legalLastName || !personalInfo?.email) {
      return errorResponse(res, new Error('Missing required personal information'), 400);
    }

    // Check if application already exists for this email
    const existingApplication = await APAApplication.findOne({ 
      'personalInfo.email': personalInfo.email.toLowerCase(),
      status: { $in: ['pending_signature', 'pending_payment'] }
    });

    if (existingApplication) {
      return errorResponse(res, new Error('An application already exists for this email'), 400);
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: personalInfo.email.toLowerCase() });
    if (existingUser) {
      return errorResponse(res, new Error('An account already exists with this email'), 400);
    }

    // Clean empty strings for enum fields (convert to null)
    const cleanedFinancialBackground = {
      ...financialBackground,
      bankruptcy: {
        ...financialBackground.bankruptcy,
        chapter: financialBackground.bankruptcy?.chapter === '' ? null : financialBackground.bankruptcy?.chapter,
        status: financialBackground.bankruptcy?.status === '' ? null : financialBackground.bankruptcy?.status
      }
    };

    const cleanedLicensingStatus = {
      ...licensingStatus,
      licenseStatus: licensingStatus?.licenseStatus === '' ? null : licensingStatus?.licenseStatus
    };

    // Prepare application data (but don't save yet)
    const applicationData = {
      personalInfo: {
        ...personalInfo,
        email: personalInfo.email.toLowerCase()
      },
      recruitingInfo,
      complianceQuestions,
      financialBackground: cleanedFinancialBackground,
      licensingStatus: cleanedLicensingStatus,
      status: 'pending_signature',
      submittedAt: new Date()
    };

    // Create temporary application object for DocuSign envelope creation
    const tempApplication = new APAApplication(applicationData);
    
    // Create real DocuSign envelope
    const docusignResult = await initiateDocuSign(tempApplication);

    // Now save the application with DocuSign info
    tempApplication.docusign.envelopeId = docusignResult.envelopeId;
    tempApplication.docusign.status = docusignResult.status;
    tempApplication.docusign.sentAt = new Date();
    await tempApplication.save();

    // Send confirmation email
    console.log('=== DocuSign Envelope Created ===');
    console.log('Envelope ID:', docusignResult.envelopeId);
    console.log('Status:', docusignResult.status);
    console.log('DocuSign will send signing email to:', tempApplication.personalInfo.email);
    
    await sendApplicationConfirmationEmail(tempApplication);
    
    console.log('Confirmation email sent to:', tempApplication.personalInfo.email);

    sendResponse(res, 201, {
      message: 'Application submitted successfully. Please check your email from DocuSign to sign the APA agreement.',
      applicationId: tempApplication._id,
      envelopeId: docusignResult.envelopeId,
      nextStep: 'signature'
    });

  } catch (error) {
    console.error('APA Application Error:', error);
    errorResponse(res, error);
  }
});

// @route   GET /api/public/apa-application/:id
// @desc    Get APA application status
// @access  Public
router.get('/apa-application/:id', async (req, res) => {
  try {
    const application = await APAApplication.findById(req.params.id)
      .select('-personalInfo.ssn -adminNotes'); // Exclude sensitive data

    if (!application) {
      return errorResponse(res, new Error('Application not found'), 404);
    }

    sendResponse(res, 200, {
      application: {
        id: application._id,
        status: application.status,
        personalInfo: {
          name: `${application.personalInfo.legalFirstName} ${application.personalInfo.legalLastName}`,
          email: application.personalInfo.email
        },
        docusignStatus: application.docusign.status,
        paymentStatus: {
          onboardingFeePaid: application.payment.onboardingFeePaid,
          monthlyFeeAuthorized: application.payment.monthlyFeeAuthorized
        },
        submittedAt: application.submittedAt,
        completedAt: application.completedAt
      }
    });

  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/public/apa-application/docusign-webhook
// @desc    DocuSign webhook - handle signature completion (global endpoint)
// @access  Public (validates DocuSign HMAC signature)
router.post('/apa-application/docusign-webhook', async (req, res) => {
  try {
    console.log('\n=== DocuSign Webhook Received ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(req.body, null, 2));

    // Validate webhook signature (lenient in development)
    const isValidSignature = validateWebhookSignature(req);
    if (!isValidSignature) {
      console.error('⚠️ Invalid DocuSign webhook signature - allowing in development');
      // In production, you might want to reject: return errorResponse(res, new Error('Invalid webhook signature'), 401);
    } else {
      console.log('✅ Webhook signature validated');
    }

    // Process webhook data
    const webhookData = await processWebhook(req.body);
    const { envelopeId, status, appStatus, signedAt } = webhookData;

    console.log('📋 Processing DocuSign webhook:', {
      envelopeId,
      status,
      appStatus,
      signedAt
    });

    // Find application by envelope ID
    const application = await APAApplication.findOne({ 'docusign.envelopeId': envelopeId });
    if (!application) {
      console.warn('⚠️ Application not found for envelope:', envelopeId);
      return sendResponse(res, 200, { message: 'Envelope not found, webhook acknowledged' });
    }

    console.log('📄 Application found:', {
      applicationId: application._id,
      email: application.personalInfo.email,
      currentStatus: application.status,
      currentDocuSignStatus: application.docusign.status
    });

    // Update DocuSign status
    application.docusign.status = status;
    
    if (status === 'completed') {
      console.log('✅ Document completed! Updating to pending_payment...');
      application.docusign.signedDate = signedAt || new Date();
      application.status = 'pending_payment'; // Unlock payment step
      
      // Download signed document
      const signedDocPath = path.join(
        __dirname,
        '../uploads/apa-signed',
        `${application._id}_signed_apa.pdf`
      );
      
      try {
        await downloadSignedDocument(envelopeId, signedDocPath);
        application.docusign.signedDocumentPath = signedDocPath;
        console.log('✅ Signed document downloaded:', signedDocPath);
      } catch (downloadError) {
        console.error('❌ Failed to download signed document:', downloadError);
        // Continue anyway - document can be retrieved later
      }
      
      // Send payment link email
      console.log('📧 Sending payment email to:', application.personalInfo.email);
      await sendPaymentLinkEmail(application);
      console.log('✅ Payment email sent successfully');
    } else if (status === 'declined' || status === 'voided') {
      // Handle declined/voided envelopes
      console.log(`⚠️ Document ${status}`);
      application.status = 'signature_' + status;
    }

    await application.save();
    console.log('✅ Application saved with new status:', application.status);
    console.log('=== Webhook Processing Complete ===\n');

    sendResponse(res, 200, { message: 'Webhook processed successfully' });

  } catch (error) {
    console.error('❌ DocuSign Webhook Error:', error);
    console.error('Error stack:', error.stack);
    // Always return 200 to DocuSign to prevent retries
    res.status(200).json({ message: 'Webhook received with errors', error: error.message });
  }
});

// @route   GET /api/public/apa-application/:id/docusign-return
// @desc    Legacy endpoint - no longer used with email-based signing
//          Kept for backwards compatibility but redirects to home
// @access  Public
router.get('/apa-application/:id/docusign-return', async (req, res) => {
  try {
    console.log('=== DocuSign Return Handler Called (Legacy) ===');
    console.log('Note: This endpoint is no longer used with email-based DocuSign signing');
    console.log('Application ID:', req.params.id);
    
    // Redirect to home page with a message
    const homeUrl = `${process.env.APP_URL || 'http://localhost:4200'}`;
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Redirecting</title>
        <meta http-equiv="refresh" content="3;url=${homeUrl}">
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: #f5f5f5;
          }
          .container {
            text-align: center;
            padding: 40px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          h2 { color: #4CAF50; }
          p { color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>✅ Thank You!</h2>
          <p>Please check your email from DocuSign to sign your agreement.</p>
          <p>After signing, you'll receive instructions for payment setup.</p>
          <p>Redirecting to home page in 3 seconds...</p>
        </div>
      </body>
      </html>
    `);

  } catch (error) {
    console.error('DocuSign Return Error:', error);
    const homeUrl = `${process.env.APP_URL || 'http://localhost:4200'}`;
    res.redirect(homeUrl);
  }
});

// @route   POST /api/public/apa-application/:id/resend-docusign
// @desc    Resend DocuSign envelope for an application
// @access  Public (can also be called from admin)
router.post('/apa-application/:id/resend-docusign', async (req, res) => {
  try {
    console.log('=== Resending DocuSign for Application ===');
    console.log('Application ID:', req.params.id);
    
    const application = await APAApplication.findById(req.params.id);
    
    if (!application) {
      return errorResponse(res, new Error('Application not found'), 404);
    }

    // Check if already signed
    if (application.docusign.status === 'completed') {
      return errorResponse(res, new Error('Agreement already signed'), 400);
    }

    // Create new DocuSign envelope
    const docusignResult = await initiateDocuSign(application);

    // Update application with new envelope info
    application.docusign.envelopeId = docusignResult.envelopeId;
    application.docusign.status = docusignResult.status;
    application.docusign.sentAt = new Date();
    await application.save();

    // Send confirmation email - DocuSign will send signing email
    await sendApplicationConfirmationEmail(application);

    console.log('✅ DocuSign resent successfully');

    sendResponse(res, 200, {
      message: 'DocuSign envelope resent successfully. Check your email from DocuSign to sign.',
      envelopeId: docusignResult.envelopeId
    });

  } catch (error) {
    console.error('❌ Resend DocuSign error:', error);
    errorResponse(res, error);
  }
});

// @route   GET /api/public/apa-application/:id/payment-page
// @desc    Check if application is ready for payment
// @access  Public
router.get('/apa-application/:id/payment-page', async (req, res) => {
  try {
    const application = await APAApplication.findById(req.params.id)
      .select('status docusign.status payment licensingStatus');

    if (!application) {
      return errorResponse(res, new Error('Application not found'), 404);
    }

    if (application.status !== 'pending_payment') {
      return errorResponse(res, new Error('Application not ready for payment. Please complete DocuSign first.'), 403);
    }

    // Check if licensed (waives onboarding fee)
    const isLicensed = application.licensingStatus.currentlyLicensed;
    const onboardingFee = isLicensed ? 0 : 169;

    sendResponse(res, 200, {
      ready: true,
      fees: {
        onboardingFee: onboardingFee,
        onboardingFeeWaived: isLicensed,
        monthlyFee: 25
      },
      application: {
        name: `${application.personalInfo?.legalFirstName} ${application.personalInfo?.legalLastName}`,
        email: application.personalInfo?.email
      }
    });

  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/public/apa-application/:id/complete-signature
// @desc    Complete mock DocuSign signature
// @access  Public
router.post('/apa-application/:id/complete-signature', async (req, res) => {
  try {
    const application = await APAApplication.findById(req.params.id);
    
    if (!application) {
      return errorResponse(res, new Error('Application not found'), 404);
    }

    if (application.status !== 'pending_signature') {
      return errorResponse(res, new Error('Application is not pending signature'), 400);
    }

    // Update signature status
    application.docusign.status = 'completed';
    application.docusign.signedDate = new Date();
    application.status = 'pending_payment';
    await application.save();

    // Send payment link email
    await sendPaymentLinkEmail(application);

    sendResponse(res, 200, {
      success: true,
      message: 'Document signed successfully',
      paymentUrl: `${process.env.APP_URL || 'http://localhost:4200'}/apa-payment?applicationId=${application._id}`
    });

  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/public/apa-application/:id/complete-payment
// @desc    Complete payment and create user account
// @access  Public
router.post('/apa-application/:id/complete-payment', async (req, res) => {
  try {
    const { couponCode, mockPayment } = req.body;
    const application = await APAApplication.findById(req.params.id);
    
    if (!application) {
      return errorResponse(res, new Error('Application not found'), 404);
    }

    if (application.status !== 'pending_payment') {
      return errorResponse(res, new Error('Application is not pending payment'), 400);
    }

    // Calculate fees
    let onboardingFee = 169;
    const monthlyFee = 25;
    let onboardingFeeWaived = false;

    // Check for license waiver or coupon
    if (application.licensingStatus.currentlyLicensed || couponCode === 'LICENSED') {
      onboardingFee = 0;
      onboardingFeeWaived = true;
    }

    // Update payment info (mock)
    application.payment.onboardingFee = onboardingFee;
    application.payment.monthlyFee = monthlyFee;
    application.payment.onboardingFeeWaived = onboardingFeeWaived;
    application.payment.onboardingFeePaid = true;
    application.payment.monthlyFeeAuthorized = true;
    application.payment.paymentDate = new Date();
    application.payment.stripeCustomerId = `cus_mock_${Date.now()}`;
    application.payment.stripePaymentIntentId = mockPayment?.paymentIntentId || `pi_mock_${Date.now()}`;
    application.payment.stripeSubscriptionId = `sub_mock_${Date.now()}`;

    // Create user account
    const existingUser = await User.findOne({ email: application.personalInfo.email });
    if (existingUser) {
      return errorResponse(res, new Error('User account already exists'), 400);
    }

    // Look up the referring user by referral code to get their ObjectId
    let referredById = null;
    if (application.recruitingInfo.referralCode) {
      const referringUser = await User.findOne({ 
        referralCode: application.recruitingInfo.referralCode,
        isActive: true 
      });
      if (referringUser) {
        referredById = referringUser._id;
      }
    }

    const password = generatePassword();
    const newUser = new User({
      name: `${application.personalInfo.legalFirstName} ${application.personalInfo.legalLastName}`,
      email: application.personalInfo.email,
      password: password,
      phone: application.personalInfo.mobilePhone,
      role: 'agent',
      referralCode: generateReferralCode(),
      referredBy: referredById,
      isActive: true,
      subscription: {
        isActive: true,
        startDate: new Date(),
        amount: monthlyFee
      },
      stripeCustomerId: application.payment.stripeCustomerId,
      stripeSubscriptionId: application.payment.stripeSubscriptionId,
      oneTimePaymentCompleted: true,
      oneTimePaymentDate: new Date(),
      lastPaymentDate: new Date(),
      paymentAccessEnabled: true
      // Note: subscriptionStatus, subscriptionStartDate, nextBillingDate will be set after Subscription creation
    });

    await newUser.save();

    // Create Payment record for onboarding fee (always create, even if $0)
    const Payment = require('../models/Payment');
    await Payment.create({
      user: newUser._id,
      type: 'one-time',
      amount: onboardingFee * 100, // Convert to cents
      currency: 'usd',
      stripePaymentIntentId: application.payment.stripePaymentIntentId,
      status: 'succeeded',
      description: onboardingFeeWaived ? 'APA Onboarding Fee (Waived - Licensed Agent)' : 'APA Onboarding Fee',
      paidAt: new Date(),
      metadata: {
        applicationId: application._id,
        source: 'apa_application',
        feeWaived: onboardingFeeWaived,
        originalAmount: 16900 // $169 in cents
      }
    });

    // Create Subscription record for monthly fee (SOURCE OF TRUTH)
    const Subscription = require('../models/Subscription');
    const subscriptionStartDate = new Date();
    const subscriptionEndDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
    
    await Subscription.create({
      user: newUser._id,
      stripeSubscriptionId: application.payment.stripeSubscriptionId,
      stripeCustomerId: application.payment.stripeCustomerId,
      stripePriceId: process.env.STRIPE_MONTHLY_PRICE_ID || 'price_monthly_default',
      status: 'active',
      amount: monthlyFee * 100, // Convert to cents
      currency: 'usd',
      interval: 'month',
      currentPeriodStart: subscriptionStartDate,
      currentPeriodEnd: subscriptionEndDate,
      metadata: {
        applicationId: application._id,
        source: 'apa_application'
      }
    });

    // SYNC: Update User model fields to match Subscription (for caching)
    newUser.subscriptionStatus = 'active';
    newUser.subscriptionStartDate = subscriptionStartDate;
    newUser.nextBillingDate = subscriptionEndDate;
    await newUser.save();

    // Update application status
    application.status = 'active';
    application.userId = newUser._id;
    application.completedAt = new Date();
    await application.save();

    // Create notifications for upline chain
    if (referredById) {
      const Notification = require('../models/Notification');
      await Notification.notifyUplineChain(
        newUser._id,
        'recruit_added',
        'New Recruit Added',
        '{agentName} has joined your team!',
        { 
          recruitId: newUser._id,
          recruitName: newUser.name,
          recruitEmail: newUser.email,
          link: '/recruits'
        }
      );
    }

    // Send welcome email with credentials
    await sendWelcomeEmail(newUser, password);

    sendResponse(res, 200, {
      success: true,
      message: 'Payment completed and account created successfully',
      userId: newUser._id,
      email: newUser.email
    });

  } catch (error) {
    console.error('Payment completion error:', error);
    errorResponse(res, error);
  }
});

// Helper functions
async function initiateDocuSign(application) {
  try {
    // Check if DocuSign is fully configured
    const hasIntegrationKey = !!process.env.DOCUSIGN_INTEGRATION_KEY;
    const hasAccountId = !!process.env.DOCUSIGN_ACCOUNT_ID;
    const hasUserId = !!process.env.DOCUSIGN_USER_ID;
    const hasPrivateKey = !!(process.env.DOCUSIGN_PRIVATE_KEY || process.env.DOCUSIGN_PRIVATE_KEY_PATH);
    const hasTemplateId = !!process.env.DOCUSIGN_TEMPLATE_ID;
    
    console.log('=== DocuSign Configuration Check ===');
    console.log('Integration Key:', hasIntegrationKey ? 'SET' : 'MISSING');
    console.log('Account ID:', hasAccountId ? 'SET' : 'MISSING');
    console.log('User ID:', hasUserId ? 'SET' : 'MISSING');
    console.log('Private Key:', hasPrivateKey ? 'SET' : 'MISSING');
    console.log('Template ID:', hasTemplateId ? 'SET' : 'MISSING');
    
    // Use real DocuSign integration if ALL required variables are configured
    if (hasIntegrationKey && hasAccountId && hasUserId && hasPrivateKey && hasTemplateId) {
      console.log('✓ DocuSign fully configured - Creating real envelope');
      console.log('Creating DocuSign envelope for application:', application._id);
      const result = await createAPAEnvelope(application);
      console.log('DocuSign envelope created successfully:', result.envelopeId);
      console.log('DocuSign will send signing email automatically');
      return result; // Returns { envelopeId, status }
    } else {
      // Fallback to mock for development
      console.warn('⚠ DocuSign NOT fully configured - using mock mode');
      console.warn('Missing configuration(s):');
      if (!hasIntegrationKey) console.warn('  - DOCUSIGN_INTEGRATION_KEY');
      if (!hasAccountId) console.warn('  - DOCUSIGN_ACCOUNT_ID');
      if (!hasUserId) console.warn('  - DOCUSIGN_USER_ID');
      if (!hasPrivateKey) console.warn('  - DOCUSIGN_PRIVATE_KEY or DOCUSIGN_PRIVATE_KEY_PATH');
      if (!hasTemplateId) console.warn('  - DOCUSIGN_TEMPLATE_ID');
      
      return {
        envelopeId: 'MOCK_' + Date.now(),
        status: 'sent'
      };
    }
  } catch (error) {
    console.error('DocuSign initiation error:', error);
    console.error('Error details:', error.response?.body || error.message);
    throw new Error('Failed to initiate document signing: ' + error.message);
  }
}

function generateReferralCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'AG';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Send confirmation email - DocuSign will send the signing email separately
async function sendApplicationConfirmationEmail(application) {
  const { legalFirstName, legalLastName, email } = application.personalInfo;
  
  console.log('=== Sending Confirmation Email ===');
  console.log('To:', email);
  console.log('Application ID:', application._id);
  
  await sendEmail({
    email: email,
    subject: 'Application Submitted - Check Your Email for Signature Request',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4CAF50;">✓ Application Submitted Successfully!</h2>
        <p>Dear ${legalFirstName} ${legalLastName},</p>
        <p>Thank you for submitting your Agent Producer Agreement (APA) application.</p>
        
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #333;">Next Step: Sign Your Agreement</h3>
          <p><strong>You will receive a separate email from DocuSign</strong> with the subject "Please sign your Agent Partnership Agreement" within the next few minutes.</p>
          <p>Please check your email inbox (and spam/junk folder if needed) for the DocuSign signing request.</p>
        </div>

        <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #856404;">⚠️ Important Instructions:</h4>
          <ul style="margin: 10px 0; padding-left: 20px; color: #856404;">
            <li><strong>Look for an email from DocuSign</strong> (typically from <code>dse@docusign.net</code>)</li>
            <li>Click the "Review Document" button in the DocuSign email</li>
            <li>Carefully review the entire document before signing</li>
            <li>Add your signature at all designated signature fields</li>
            <li>Complete all fields marked as required</li>
            <li>Click "Finish" to complete the signing process</li>
          </ul>
          <p style="margin-bottom: 0; color: #856404;"><strong>Note:</strong> After signing, you will automatically receive another email with instructions to complete your payment setup.</p>
        </div>

        <div style="background: #e3f2fd; border-left: 4px solid #2196F3; padding: 15px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #1565C0;">📧 What Happens Next?</h4>
          <ol style="margin: 10px 0; padding-left: 20px; color: #1565C0;">
            <li>You'll receive a signing email from DocuSign (within minutes)</li>
            <li>Sign the agreement through DocuSign's secure platform</li>
            <li>Once signed, you'll receive a payment setup email from us</li>
            <li>Complete your payment to activate your account</li>
          </ol>
        </div>

        <p><strong>Application ID:</strong> ${application._id}</p>
        
        <p style="color: #666; font-size: 14px;">If you don't receive the DocuSign email within 10 minutes, please check your spam folder or contact your recruiter.</p>
        
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
        <p style="text-align: center; color: #999; font-size: 12px;">
          &copy; 2025 ${process.env.SMTP_FROM_NAME || 'RHP Office'}. All rights reserved.<br>
          <a href="${process.env.APP_URL}" style="color: #4CAF50; text-decoration: none;">${process.env.APP_URL || 'rhpoffice.com'}</a>
        </p>
      </div>
    `
  });
  
  console.log('Confirmation email sent successfully to:', email);
}

async function sendPaymentLinkEmail(application) {
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
}

async function sendWelcomeEmail(user, password) {
  const loginUrl = `${process.env.APP_URL || 'http://localhost:4200'}/login`;
  
  await sendEmail({
    email: user.email,
    subject: 'Welcome to RHP Office - Your Account is Ready!',
    html: `
      <h2>Welcome to RHP Office, ${user.name}!</h2>
      <p>Your account has been successfully created and activated.</p>
      <h3>Login Credentials:</h3>
      <p><strong>Email:</strong> ${user.email}</p>
      <p><strong>Temporary Password:</strong> ${password}</p>
      <p><strong>Your Referral Code:</strong> ${user.referralCode}</p>
      <p><a href="${loginUrl}" style="display: inline-block; padding: 12px 24px; background: #4CAF50; color: white; text-decoration: none; border-radius: 4px;">Login to Your Account</a></p>
      <p style="color: #d32f2f;"><strong>Important:</strong> Please change your password after your first login for security.</p>
      <p>You can now access all features including:</p>
      <ul>
        <li>Dashboard and analytics</li>
        <li>Lead management</li>
        <li>Training materials</li>
        <li>Downline tracking</li>
      </ul>
      <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
      <p style="text-align: center; color: #999; font-size: 12px;">
        &copy; 2025 ${process.env.SMTP_FROM_NAME || 'RHP Office'}. All rights reserved.<br>
        <a href="${process.env.APP_URL}" style="color: #4CAF50; text-decoration: none;">${process.env.APP_URL || 'rhpoffice.com'}</a>
      </p>
    `
  });
}

module.exports = router;
