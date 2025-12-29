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

    // Create new APA application
    const application = new APAApplication({
      personalInfo: {
        ...personalInfo,
        email: personalInfo.email.toLowerCase()
      },
      recruitingInfo,
      complianceQuestions,
      financialBackground,
      licensingStatus,
      status: 'pending_signature',
      submittedAt: new Date()
    });

    await application.save();

    // TODO: Trigger DocuSign envelope creation
    // For now, we'll simulate this with a placeholder
    const docusignUrl = await initiateDocuSign(application);
    
    // Update application with DocuSign info
    application.docusign.envelopeId = 'ENVELOPE_' + Date.now(); // Placeholder
    application.docusign.status = 'sent';
    application.docusign.sentAt = new Date();
    await application.save();

    // Send confirmation email
    await sendApplicationConfirmationEmail(application);

    sendResponse(res, 201, {
      message: 'Application submitted successfully. Please check your email to sign the APA agreement.',
      applicationId: application._id,
      docusignUrl: docusignUrl,
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

// @route   POST /api/public/apa-application/:id/docusign-webhook
// @desc    DocuSign webhook - handle signature completion
// @access  Public (but should validate DocuSign signature)
router.post('/apa-application/:id/docusign-webhook', async (req, res) => {
  try {
    const { envelopeId, status, signedAt } = req.body;

    const application = await APAApplication.findById(req.params.id);
    if (!application) {
      return errorResponse(res, new Error('Application not found'), 404);
    }

    // Update DocuSign status
    application.docusign.status = status;
    if (status === 'signed' || status === 'completed') {
      application.docusign.signedAt = signedAt || new Date();
      application.status = 'pending_payment'; // Unlock payment step
      
      // Send payment link email
      await sendPaymentLinkEmail(application);
    }

    await application.save();

    sendResponse(res, 200, { message: 'Webhook processed successfully' });

  } catch (error) {
    console.error('DocuSign Webhook Error:', error);
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
      paymentUrl: `${process.env.FRONTEND_URL || 'http://localhost:4200'}/apa-payment?applicationId=${application._id}`
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

    // Create Payment record for onboarding fee (if paid)
    if (onboardingFee > 0) {
      const Payment = require('../models/Payment');
      await Payment.create({
        user: newUser._id,
        type: 'one-time',
        amount: onboardingFee * 100, // Convert to cents
        currency: 'usd',
        stripePaymentIntentId: application.payment.stripePaymentIntentId,
        status: 'succeeded',
        description: 'APA Onboarding Fee',
        paidAt: new Date(),
        metadata: {
          applicationId: application._id,
          source: 'apa_application'
        }
      });
    }

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
  // Mock DocuSign - returns URL to our mock signature page
  const mockUrl = `${process.env.FRONTEND_URL || 'http://localhost:4200'}/sign-apa?applicationId=${application._id}`;
  return mockUrl;
}

function generateReferralCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'AG';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function sendApplicationConfirmationEmail(application) {
  const { legalFirstName, legalLastName, email } = application.personalInfo;
  
  await sendEmail({
    email: email,
    subject: 'APA Application Received - Next Steps',
    html: `
      <h2>Thank you for your application!</h2>
      <p>Dear ${legalFirstName} ${legalLastName},</p>
      <p>We have received your APA application. The next step is to review and sign the Agent Partnership Agreement.</p>
      <p>You will receive a separate email from DocuSign with the agreement to review and sign.</p>
      <p><strong>Application ID:</strong> ${application._id}</p>
      <p>If you have any questions, please contact your recruiter.</p>
    `
  });
}

async function sendPaymentLinkEmail(application) {
  const { legalFirstName, email } = application.personalInfo;
  const paymentUrl = `${process.env.FRONTEND_URL || 'http://localhost:4200'}/apa-payment?applicationId=${application._id}`;
  
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
  const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:4200'}/login`;
  
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
