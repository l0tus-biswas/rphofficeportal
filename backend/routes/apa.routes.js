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
          docusignUrl: application.docusignUrl
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

    // Send confirmation email with DocuSign URL
    console.log('=== DocuSign URL Generated ===');
    console.log('Signing URL:', docusignResult.signingUrl);
    console.log('Envelope ID:', docusignResult.envelopeId);
    console.log('Sending email to:', tempApplication.personalInfo.email);
    
    await sendApplicationConfirmationEmail(tempApplication, docusignResult.signingUrl);
    
    console.log('Email sent with DocuSign URL:', docusignResult.signingUrl);

    sendResponse(res, 201, {
      message: 'Application submitted successfully. Please check your email to sign the APA agreement.',
      applicationId: tempApplication._id,
      docusignUrl: docusignResult.signingUrl,
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
    // Validate webhook signature
    if (!validateWebhookSignature(req)) {
      console.error('Invalid DocuSign webhook signature');
      return errorResponse(res, new Error('Invalid webhook signature'), 401);
    }

    // Process webhook data
    const webhookData = await processWebhook(req.body);
    const { envelopeId, status, appStatus, signedAt } = webhookData;

    console.log('Processing DocuSign webhook:', {
      envelopeId,
      status,
      appStatus
    });

    // Find application by envelope ID
    const application = await APAApplication.findOne({ 'docusign.envelopeId': envelopeId });
    if (!application) {
      console.warn('Application not found for envelope:', envelopeId);
      return sendResponse(res, 200, { message: 'Envelope not found, webhook acknowledged' });
    }

    // Update DocuSign status
    application.docusign.status = status;
    
    if (status === 'completed') {
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
      } catch (downloadError) {
        console.error('Failed to download signed document:', downloadError);
        // Continue anyway - document can be retrieved later
      }
      
      // Send payment link email
      await sendPaymentLinkEmail(application);
    } else if (status === 'declined' || status === 'voided') {
      // Handle declined/voided envelopes
      application.status = 'signature_' + status;
    }

    await application.save();

    sendResponse(res, 200, { message: 'Webhook processed successfully' });

  } catch (error) {
    console.error('DocuSign Webhook Error:', error);
    // Always return 200 to DocuSign to prevent retries
    res.status(200).json({ message: 'Webhook received with errors' });
  }
});

// @route   GET /api/public/apa-application/:id/docusign-return
// @desc    Handle return from DocuSign after signing (verifies status from API)
// @access  Public
router.get('/apa-application/:id/docusign-return', async (req, res) => {
  try {
    console.log('=== DocuSign Return Handler Called ===');
    console.log('Application ID:', req.params.id);
    console.log('Query params:', req.query);
    console.log('Event:', req.query.event);
    
    const application = await APAApplication.findById(req.params.id);
    
    if (!application) {
      console.error('Application not found:', req.params.id);
      return errorResponse(res, new Error('Application not found'), 404);
    }

    if (!application.docusign.envelopeId) {
      console.error('No DocuSign envelope found for application:', req.params.id);
      return errorResponse(res, new Error('No DocuSign envelope found'), 400);
    }

    // Fetch actual status from DocuSign API
    console.log('Checking DocuSign status for envelope:', application.docusign.envelopeId);
    const envelopeStatus = await getEnvelopeStatus(application.docusign.envelopeId);
    
    console.log('DocuSign envelope status:', envelopeStatus.status);

    // Update application based on actual DocuSign status
    application.docusign.status = envelopeStatus.status;
    
    if (envelopeStatus.status === 'completed') {
      application.docusign.signedDate = envelopeStatus.completedDateTime || new Date();
      application.status = 'pending_payment';
      await application.save();
      
      // Send payment link email
      await sendPaymentLinkEmail(application);
      
      console.log('✅ Application status updated to pending_payment');
      console.log('✅ Payment email sent to:', application.personalInfo.email);
      
      // Redirect to payment page only if completed
      const paymentUrl = `${process.env.APP_URL || 'http://localhost:4200'}/apa-payment?applicationId=${application._id}`;
      console.log('🔄 Redirecting to payment page:', paymentUrl);
      res.redirect(paymentUrl);
    } else {
      // Save the updated status but don't change application status
      await application.save();
      console.log('⚠️ Document not yet completed, status:', envelopeStatus.status);
      
      // Redirect to a status page showing signature is still pending
      const statusUrl = `${process.env.APP_URL || 'http://localhost:4200'}/apply?ref=${application.recruitingInfo.referralCode || ''}&status=pending_signature&applicationId=${application._id}`;
      console.log('🔄 Redirecting to status page (not signed yet):', statusUrl);
      
      // Send HTML response instead of redirect
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Signature Pending</title>
          <style>
            body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
            .container { text-align: center; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 500px; }
            .icon { font-size: 64px; margin-bottom: 20px; }
            h1 { color: #333; margin-bottom: 20px; }
            p { color: #666; margin-bottom: 30px; line-height: 1.6; }
            .btn { display: inline-block; padding: 12px 24px; background: #4CAF50; color: white; text-decoration: none; border-radius: 4px; font-weight: bold; }
            .btn:hover { background: #45a049; }
            .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; text-align: left; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="icon">📝</div>
            <h1>Signature Still Pending</h1>
            <p>Your application has been submitted, but the DocuSign agreement has not been completed yet.</p>
            <div class="warning">
              <strong>⚠️ Important:</strong> You must complete all signature fields in the DocuSign document and click "Finish" to proceed with your application.
            </div>
            <p>Please check your email for the DocuSign link, or contact your recruiter for assistance.</p>
            <p style="margin-top: 30px; color: #999; font-size: 14px;">
              Application ID: ${application._id}
            </p>
          </div>
        </body>
        </html>
      `);
    }

  } catch (error) {
    console.error('❌ DocuSign return error:', error);
    // Redirect to error page or payment page anyway
    const paymentUrl = `${process.env.APP_URL || 'http://localhost:4200'}/apa-payment?applicationId=${req.params.id}&error=verification_failed`;
    console.log('🔄 Redirecting to payment page with error:', paymentUrl);
    res.redirect(paymentUrl);
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

    // Send email with new DocuSign URL
    await sendApplicationConfirmationEmail(application, docusignResult.signingUrl);

    console.log('✅ DocuSign resent successfully');

    sendResponse(res, 200, {
      message: 'DocuSign envelope resent successfully',
      docusignUrl: docusignResult.signingUrl,
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
    // Use real DocuSign integration if configured
    if (process.env.DOCUSIGN_INTEGRATION_KEY && process.env.DOCUSIGN_ACCOUNT_ID) {
      console.log('Creating DocuSign envelope for application:', application._id);
      const result = await createAPAEnvelope(application);
      return result; // Returns { envelopeId, signingUrl, status }
    } else {
      // Fallback to mock for development
      console.warn('DocuSign not configured - using mock signing page');
      const mockUrl = `${process.env.APP_URL || 'http://localhost:4200'}/sign-apa?applicationId=${application._id}`;
      return {
        envelopeId: 'MOCK_' + Date.now(),
        signingUrl: mockUrl,
        status: 'sent'
      };
    }
  } catch (error) {
    console.error('DocuSign initiation error:', error);
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

// Send confirmation email with DocuSign signing URL
async function sendApplicationConfirmationEmail(application, docusignUrl) {
  const { legalFirstName, legalLastName, email } = application.personalInfo;
  
  console.log('=== Sending Confirmation Email ===');
  console.log('To:', email);
  console.log('DocuSign URL in email:', docusignUrl);
  console.log('Application ID:', application._id);
  
  await sendEmail({
    email: email,
    subject: 'Application Submitted - DocuSign Signature Required',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4CAF50;">✓ Application Submitted Successfully!</h2>
        <p>Dear ${legalFirstName} ${legalLastName},</p>
        <p>Thank you for submitting your Agent Producer Agreement (APA) application.</p>
        
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #333;">Next Step: Sign Your Agreement</h3>
          <p>Your application requires a digital signature via DocuSign. Please click the button below to review and sign your APA agreement.</p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${docusignUrl}" style="display: inline-block; padding: 15px 30px; background: #4CAF50; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">📝 Click to Sign Agreement</a>
        </div>

        <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #856404;">⚠️ Important Signing Instructions:</h4>
          <ul style="margin: 10px 0; padding-left: 20px; color: #856404;">
            <li>Carefully review the entire document before signing</li>
            <li><strong>You MUST add your signature at all designated signature fields</strong></li>
            <li>Click all required signature/initial boxes in the document</li>
            <li>Complete all fields marked as required</li>
            <li>Click "Finish" or "Complete" when all signatures are placed</li>
          </ul>
          <p style="margin-bottom: 0; color: #856404;"><strong>Note:</strong> After signing, you will be redirected to complete your payment setup.</p>
        </div>

        <p><strong>Application ID:</strong> ${application._id}</p>
        
        <p style="color: #666; font-size: 14px; margin-top: 30px;">If the button doesn't work, copy and paste this link into your browser:<br>
        <span style="color: #007bff; word-break: break-all;">${docusignUrl}</span></p>
        
        <p style="color: #666; font-size: 14px;">If you have any questions, please contact your recruiter.</p>
      </div>
    `
  });
  
  console.log('Email sent successfully to:', email);
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
    `
  });
}

module.exports = router;
