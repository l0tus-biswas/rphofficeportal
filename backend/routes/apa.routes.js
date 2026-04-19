const express = require('express');
const router = express.Router();
const APAApplication = require('../models/APAApplication');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Onboarding = require('../models/Onboarding');
const SystemConfig = require('../models/SystemConfig');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { sendResponse, errorResponse, generatePassword } = require('../utils/helpers');
const { sendApplicationConfirmationEmail, sendPaymentLinkEmail, sendAccountActivatedEmail, sendWelcomeSetPasswordEmail } = require('../utils/neuzmail');
const { applyLimiter } = require('../middleware/rateLimiter.middleware');
const { 
  createAPAEnvelope, 
  getEnvelopeStatus, 
  downloadSignedDocument,
  processWebhook,
  validateWebhookSignature,
  getTemplateFields
} = require('../utils/docusign');
const Coupon = require('../models/Coupon');
const Payment = require('../models/Payment');
const Subscription = require('../models/Subscription');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const OnboardingDocument = require('../models/OnboardingDocument');
const OnboardingDocType = require('../models/OnboardingDocType');

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
    const normalizedReferralCode = ((ref || '') + '').trim().toUpperCase();

    const normalizedEmail = ((email || '') + '').trim().toLowerCase();

    if (!normalizedEmail || !normalizedReferralCode) {
      return res.json({ application: null });
    }

    const application = await APAApplication.findOne({ 
      'personalInfo.email': normalizedEmail,
      'recruitingInfo.referralCode': normalizedReferralCode,
      status: 'pending_signature'
    });

    if (application) {
      return res.json({ 
        application: {
          _id: application._id,
          status: application.status,
          envelopeId: application.docusign?.envelopeId,
          docusignStatus: application.docusign?.status || 'draft'
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
      licenseStatus: licensingStatus?.licenseStatus === '' ? null : licensingStatus?.licenseStatus,
      licenseOtherDescription: licensingStatus?.licenseOtherDescription?.trim() || undefined
    };

    const safeRecruitingInfo = recruitingInfo || {};
    const normalizedReferralCode = ((safeRecruitingInfo.referralCode || safeRecruitingInfo.recruiterAgentId || '') + '').trim().toUpperCase();
    const sanitizedRecruitingInfo = {
      ...safeRecruitingInfo,
      recruiterFullName: safeRecruitingInfo.recruiterFullName?.trim(),
      recruiterAgentId: safeRecruitingInfo.recruiterAgentId?.trim()?.toUpperCase(),
      recruiterContact: safeRecruitingInfo.recruiterContact?.trim(),
      referralCode: normalizedReferralCode || undefined
    };

    // Prepare application data (but don't save yet)
    const applicationData = {
      personalInfo: {
        ...personalInfo,
        email: personalInfo.email.toLowerCase()
      },
      recruitingInfo: sanitizedRecruitingInfo,
      complianceQuestions,
      financialBackground: cleanedFinancialBackground,
      licensingStatus: cleanedLicensingStatus,
      status: 'pending_signature',
      submittedAt: new Date(),
      docusign: {
        status: 'draft'
      }
    };

    const application = new APAApplication(applicationData);
    await application.save();

    console.log('Application saved. DocuSign launch is pending user confirmation.');
    console.log('Applicant email on file:', application.personalInfo.email);

    await sendApplicationConfirmationEmail(application);
    console.log('Confirmation email sent to:', application.personalInfo.email);

    sendResponse(res, 201, {
      message: 'Application submitted successfully. Review the next screen to confirm the email and send your DocuSign packet.',
      applicationId: application._id,
      nextStep: 'signature',
      docusignStatus: application.docusign?.status || 'draft'
    });

  } catch (error) {
    console.error('APA Application Error:', error);
    errorResponse(res, error);
  }
});

// @route   GET /api/public/apa-application/docusign-webhook
// @desc    Info page for webhook endpoint (for browser access)
// @access  Public
router.get('/apa-application/docusign-webhook', async (req, res) => {
  res.status(200).json({
    success: true,
    message: 'DocuSign webhook endpoint is active',
    info: 'This is a POST endpoint for DocuSign webhooks. It should not be accessed directly via browser.',
    status: 'Webhook endpoint is ready to receive events from DocuSign',
    events: ['envelope-sent', 'envelope-delivered', 'envelope-completed', 'envelope-declined', 'envelope-voided']
  });
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

    // Lenient signature validation - allow webhooks through even if signature validation fails
    const isValidSignature = validateWebhookSignature(req);
    if (!isValidSignature) {
      console.warn('⚠️ Webhook signature validation failed or not provided - allowing anyway');
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
        application.docusign.documentUrl = `/uploads/apa-signed/${application._id}_signed_apa.pdf`;
        console.log('✅ Signed document downloaded:', signedDocPath);
      } catch (downloadError) {
        console.error('❌ Failed to download signed document:', downloadError);
        // Continue anyway - document can be retrieved later
      }

      // ---------------------------------------------------------------
      // Create / update OnboardingDocument so the link appears in the
      // Onboarding Hub.  Prefer application.userId; fall back to .user.
      // NOTE: userId is only set after payment, so this covers agents
      // who are already active.  For brand-new agents who haven't paid
      // yet the record will be created when payment completes.
      // ---------------------------------------------------------------
      const agentUserId = application.userId || application.user || null;
      if (agentUserId) {
        try {
          const apaDocType = await OnboardingDocType.findOne({ name: 'APA Agreement', isActive: true });
          if (apaDocType) {
            const docRelPath = application.docusign.documentUrl
              ? application.docusign.documentUrl.replace(/^\//, '')
              : null;
            const baseUrl = process.env.API_URL || `${req.protocol}://${req.get('host')}`;
            await OnboardingDocument.findOneAndUpdate(
              { agent: agentUserId, docType: apaDocType._id },
              {
                $set: {
                  agent: agentUserId,
                  docType: apaDocType._id,
                  filePath: docRelPath,
                  externalLink: docRelPath ? `${baseUrl}/${docRelPath}` : null,
                  originalFileName: `APA_Agreement_${application.personalInfo?.legalFirstName || ''}_${application.personalInfo?.legalLastName || ''}.pdf`.replace(/\s+/g, '_'),
                  uploadedBy: agentUserId,
                  uploadedAt: application.docusign.signedDate || new Date(),
                  deletedAt: null
                }
              },
              { upsert: true, new: true }
            );
            console.log('✅ OnboardingDocument created/updated for APA Agreement, agent:', agentUserId);
          } else {
            console.warn('⚠️ OnboardingDocType "APA Agreement" not found — run seedOnboardingDocTypes.js');
          }
        } catch (onboardingErr) {
          console.error('❌ Failed to create OnboardingDocument for APA Agreement:', onboardingErr);
          // Non-blocking — don't fail the webhook
        }
      } else {
        console.warn('⚠️ No userId/user on APAApplication at signing time — will create OnboardingDocument after payment for', application._id);
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

// @route   POST /api/public/apa-application/create-checkout-session
// @desc    Create Stripe checkout session for APA payment
// @access  Public
router.post('/apa-application/create-checkout-session', async (req, res) => {
  try {
    const { applicationId, couponCode } = req.body;

    if (!applicationId) {
      return sendResponse(res, 400, { message: 'Application ID is required' });
    }

    // Find application
    const application = await APAApplication.findById(applicationId);
    if (!application) {
      return sendResponse(res, 404, { message: 'Application not found' });
    }

    // Check if application is ready for payment
    if (application.status !== 'pending_payment') {
      return sendResponse(res, 400, { 
        message: `Application is not ready for payment. Current status: ${application.status}` 
      });
    }

    // Check if payment already completed
    if (application.payment && application.payment.paymentStatus === 'completed') {
      return sendResponse(res, 400, { message: 'Payment already completed for this application' });
    }

    const monthlyPriceId = process.env.STRIPE_MONTHLY_PRICE_ID;
    const monthlyAmountCents = parseInt(process.env.STRIPE_MONTHLY_SUBSCRIPTION_PRICE, 10) || 2000;
    const subscriptionProductName = process.env.STRIPE_MONTHLY_PRODUCT_NAME || 'RHP Office CRM Subscription';

    let validatedPriceId = null;
    if (monthlyPriceId) {
      try {
        const stripePrice = await stripe.prices.retrieve(monthlyPriceId);
        const priceMatchesAmount = typeof stripePrice.unit_amount === 'number'
          ? stripePrice.unit_amount === monthlyAmountCents
          : false;
        const priceIsMonthly = stripePrice.recurring?.interval === 'month';

        if (priceMatchesAmount && priceIsMonthly) {
          validatedPriceId = stripePrice.id;
        } else {
          console.warn('[APA CHECKOUT] Stripe price mismatch detected. Expected amount', monthlyAmountCents, 'but received', stripePrice.unit_amount);
        }
      } catch (priceError) {
        console.warn('[APA CHECKOUT] Unable to retrieve configured Stripe price. Falling back to inline price_data.', priceError.message);
      }
    }

    // Build line items - only monthly subscription (no setup fee)
    const lineItems = validatedPriceId
      ? [{ price: validatedPriceId, quantity: 1 }]
      : [{
          price_data: {
            currency: 'usd',
            unit_amount: monthlyAmountCents,
            recurring: { interval: 'month' },
            product_data: {
              name: subscriptionProductName,
              description: 'Monthly access to RHP Office CRM'
            }
          },
          quantity: 1
        }];

    // Create checkout session
    const sessionParams = {
      mode: 'subscription',
      line_items: lineItems,
      success_url: `${process.env.APP_URL || 'http://localhost:4200'}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL || 'http://localhost:4200'}/apa-payment?applicationId=${applicationId}&canceled=true`,
      client_reference_id: applicationId,
      customer_email: application.personalInfo.email,
      metadata: {
        applicationId: applicationId,
        applicantName: `${application.personalInfo.firstName} ${application.personalInfo.lastName}`,
        applicantEmail: application.personalInfo.email,
        referralCode: application.recruitingInfo.referralCode
      },
      subscription_data: {
        metadata: {
          applicationId: applicationId,
          applicantEmail: application.personalInfo.email
        }
      },
      billing_address_collection: 'required',
      phone_number_collection: {
        enabled: true
      }
    };

    // Apply coupon if provided
    if (couponCode) {
      try {
        // Validate coupon exists in Stripe
        const stripeCoupon = await stripe.coupons.retrieve(couponCode.toUpperCase());
        
        if (stripeCoupon && stripeCoupon.valid) {
          // Apply coupon to session
          sessionParams.discounts = [{
            coupon: couponCode.toUpperCase()
          }];
          
          console.log(`✅ Coupon ${couponCode.toUpperCase()} applied to checkout session`);
          
          // Update database coupon record if exists
          const coupon = await Coupon.findOne({ 
            code: couponCode.toUpperCase(),
            isActive: true
          });
          
          if (coupon) {
            coupon.usedCount += 1;
            await coupon.save();
          }
          
          // Store in application
          if (!application.payment) {
            application.payment = {};
          }
          application.payment.couponCode = couponCode.toUpperCase();
          await application.save();
        }
      } catch (couponError) {
        console.error('Coupon validation error:', couponError.message);
        // Continue without coupon if invalid
      }
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    sendResponse(res, 200, {
      sessionId: session.id,
      url: session.url
    });

  } catch (error) {
    console.error('Create checkout session error:', error);
    errorResponse(res, error);
  }
});

// Shared handler for payment verification (supports GET + POST)
const verifyPaymentHandler = async (req, res) => {
  try {
    const sessionId = req.body?.sessionId 
      || req.body?.session_id 
      || req.query?.session_id;

    if (!sessionId) {
      return sendResponse(res, 400, { message: 'Session ID is required' });
    }

    // Retrieve session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session) {
      return sendResponse(res, 404, { message: 'Payment session not found' });
    }

    if (session.payment_status !== 'paid') {
      return sendResponse(res, 400, { message: 'Payment not completed' });
    }

    const applicationId = session.client_reference_id;
    if (!applicationId) {
      return sendResponse(res, 400, { message: 'Application ID not found in session' });
    }

    // Find application
    const application = await APAApplication.findById(applicationId);
    if (!application) {
      return sendResponse(res, 404, { message: 'Application not found' });
    }

    // Check if already processed
    if (application.status === 'completed') {
      const existingUser = await User.findOne({ email: application.personalInfo.email });
      return sendResponse(res, 200, {
        success: true,
        message: 'Payment already verified',
        accountCreated: true,
        email: existingUser?.email
      });
    }

    // Update application status
    application.status = 'completed';
    application.completedAt = new Date();
    
    // Update payment info
    application.payment.paymentStatus = 'completed';
    application.payment.paymentIntentId = session.payment_intent;
    application.payment.paidAt = new Date();
    application.payment.amount = session.amount_total / 100;
    
    await application.save();

    // Create payment record
    const payment = new Payment({
      user: null, // Will be updated after user creation
      type: 'setup_fee',
      amount: session.amount_total, // store in cents to match other payment records
      status: 'completed',
      stripePaymentIntentId: session.payment_intent,
      stripeCustomerId: session.customer,
      metadata: {
        applicationId: applicationId,
        sessionId: session.id
      }
    });
    await payment.save();

    // Prepare user details
    const legalFirstName = application.personalInfo?.legalFirstName || application.personalInfo?.firstName || '';
    const legalLastName = application.personalInfo?.legalLastName || application.personalInfo?.lastName || '';
    const primaryPhone = application.personalInfo?.mobilePhone || application.personalInfo?.phone;
    const homeAddress = application.personalInfo?.homeAddress || {};

    if (!primaryPhone) {
      return sendResponse(res, 400, { message: 'Application is missing a contact phone number' });
    }

    let referredById = null;
    if (application.recruitingInfo?.referralCode) {
      const referringUser = await User.findOne({
        referralCode: application.recruitingInfo.referralCode,
        isActive: true
      }).select('_id');
      if (referringUser) {
        referredById = referringUser._id;
      }
    }

    // Create user account
    const password = generatePassword();
    const user = new User({
      email: application.personalInfo.email,
      password: password,
      name: `${legalFirstName} ${legalLastName}`.trim(),
      phone: primaryPhone,
      role: 'agent',
      isActive: true,
      referredBy: referredById,
      address: homeAddress.street || application.personalInfo?.address,
      city: homeAddress.city || application.personalInfo?.city,
      state: homeAddress.state || application.personalInfo?.state,
      zipCode: homeAddress.zipCode || application.personalInfo?.zip,
      metadata: {
        applicationId: application._id.toString(),
        referralCode: application.recruitingInfo?.referralCode || ''
      }
    });

    await user.save();

    // Update payment record with user ID
    payment.user = user._id;
    await payment.save();

    let subscriptionPriceId = process.env.STRIPE_MONTHLY_PRICE_ID || null;
    let subscriptionAmount = parseInt(process.env.STRIPE_MONTHLY_SUBSCRIPTION_PRICE, 10) || 2000;
    let subscriptionStart = new Date();
    let subscriptionEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    let subscriptionStatus = 'active';

    if (session.subscription) {
      try {
        const stripeSubscription = await stripe.subscriptions.retrieve(session.subscription);
        subscriptionStatus = stripeSubscription.status || subscriptionStatus;
        if (stripeSubscription.current_period_start) {
          subscriptionStart = new Date(stripeSubscription.current_period_start * 1000);
        }
        if (stripeSubscription.current_period_end) {
          subscriptionEnd = new Date(stripeSubscription.current_period_end * 1000);
        }

        const firstItem = stripeSubscription.items?.data?.[0];
        if (firstItem?.price) {
          subscriptionPriceId = firstItem.price.id || subscriptionPriceId;
          if (typeof firstItem.price.unit_amount === 'number') {
            subscriptionAmount = firstItem.price.unit_amount;
          }
        }
      } catch (stripeError) {
        console.error('Failed to retrieve Stripe subscription:', stripeError);
      }
    }

    if (!subscriptionPriceId) {
      subscriptionPriceId = `inline_price_${subscriptionAmount}`;
    }

    const subscription = new Subscription({
      user: user._id,
      stripeSubscriptionId: session.subscription,
      stripeCustomerId: session.customer,
      stripePriceId: subscriptionPriceId,
      status: subscriptionStatus,
      currentPeriodStart: subscriptionStart,
      currentPeriodEnd: subscriptionEnd,
      amount: subscriptionAmount,
      currency: 'usd',
      interval: 'month'
    });
    await subscription.save();

    // Create onboarding record for the new agent (so they appear in onboarding tab)
    const onboarding = new Onboarding({
      user: user._id,
      status: 'not-started'
    });
    await onboarding.save();

    // Update user with onboarding reference
    user.onboarding = onboarding._id;
    user.onboardingStatus = 'not-started';

    // Update user payment/subscription tracking fields
    user.stripeCustomerId = session.customer || user.stripeCustomerId;
    user.stripeSubscriptionId = session.subscription || user.stripeSubscriptionId;
    user.subscriptionStatus = subscriptionStatus || 'active';
    user.subscriptionStartDate = subscriptionStart;
    user.nextBillingDate = subscriptionEnd;
    user.lastPaymentDate = new Date();
    user.paymentAccessEnabled = true;
    user.oneTimePaymentCompleted = true;
    user.oneTimePaymentAmount = 0;
    user.oneTimePaymentDate = user.oneTimePaymentDate || new Date();

    // Generate set-password token for immediate password setup
    const setPasswordToken = user.getResetPasswordToken();
    await user.save();

    // Link application back to the created user for onboarding visibility
    application.userId = user._id;
    application.user = user._id;
    await application.save();

    // Create OnboardingDocument for APA Agreement so it shows in /onboarding-hub
    try {
      const apaDocType = await OnboardingDocType.findOne({ name: 'APA Agreement', isActive: true });
      if (apaDocType && application.docusign?.documentUrl) {
        const docRelPath = application.docusign.documentUrl.replace(/^\//, '');
        const baseUrl = process.env.API_URL || `${req.protocol}://${req.get('host')}`;
        await OnboardingDocument.findOneAndUpdate(
          { agent: user._id, docType: apaDocType._id },
          {
            $set: {
              agent: user._id,
              docType: apaDocType._id,
              filePath: docRelPath,
              externalLink: `${baseUrl}/${docRelPath}`,
              originalFileName: `APA_Agreement_${application.personalInfo?.legalFirstName || ''}_${application.personalInfo?.legalLastName || ''}.pdf`.replace(/\s+/g, '_'),
              uploadedBy: user._id,
              uploadedAt: application.docusign.signedDate || application.docusign.signedAt || new Date(),
              deletedAt: null
            }
          },
          { upsert: true, new: true }
        );
        console.log('✅ OnboardingDocument created for APA Agreement on payment completion, agent:', user._id);
      }
    } catch (onboardingErr) {
      console.error('❌ Failed to create OnboardingDocument for APA Agreement during payment:', onboardingErr);
      // Non-blocking — don't fail account creation
    }

    // Send welcome email with set-password link
    if (setPasswordToken) {
      await sendWelcomeSetPasswordEmail(user, setPasswordToken);
    } else {
      await sendAccountActivatedEmail(user, password);
    }

    // Notify all admins about the new agent registration (16.1)
    try {
      const admins = await User.find({ role: 'admin', isActive: true }).select('_id').lean();
      for (const admin of admins) {
        Notification.createNotification({
          userId: admin._id,
          type: 'new_agent_registered',
          title: 'New Agent Registered',
          message: `${user.name} (${user.email}) has completed registration and payment.`,
          link: '/admin/users',
          data: { newUserId: user._id }
        }, false).catch(() => {});
      }
    } catch (notifErr) {
      console.error('Failed to notify admins of new registration:', notifErr);
    }

    // Notify upline about new recruit
    if (user.referredBy) {
      Notification.createNotification({
        userId: user.referredBy,
        type: 'recruit_added',
        title: 'New Recruit Joined',
        message: `${user.name} has joined your team through your referral link!`,
        link: '/my-team',
        data: { recruitId: user._id }
      }).catch(() => {});
    }

    // Auto-approve APA if setting is enabled (§23.3)
    try {
      const autoApproveConfig = await SystemConfig.findOne({ key: 'apa_auto_approve' }).lean();
      if (autoApproveConfig && autoApproveConfig.value === 'true' && application.status === 'completed') {
        application.status = 'active';
        application.reviewedAt = new Date();
        application.adminNotes = 'Auto-approved by system';
        await application.save();
        console.log(`[APA] Auto-approved application ${application._id} for ${user.email}`);
      }
    } catch (autoErr) {
      console.error('[APA] Auto-approve check failed:', autoErr.message);
    }

    sendResponse(res, 200, {
      success: true,
      message: 'Payment verified and account created successfully',
      accountCreated: true,
      email: user.email,
      setPasswordToken: setPasswordToken // Token for immediate password setup
    });

  } catch (error) {
    console.error('Verify payment error:', error);
    errorResponse(res, error);
  }
};

// @route   GET/POST /api/public/apa-application/verify-payment
// @desc    Verify Stripe payment and complete application
// @access  Public
router.get('/apa-application/verify-payment', verifyPaymentHandler);
router.post('/apa-application/verify-payment', verifyPaymentHandler);

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
        docusignStatus: application.docusign?.status || 'draft',
        docusign: {
          status: application.docusign?.status || 'draft',
          envelopeId: application.docusign?.envelopeId || null,
          sentAt: application.docusign?.sentAt || null
        },
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

// @route   POST /api/public/apa-application/:id/send-docusign
// @desc    Confirm email and send DocuSign envelope
// @access  Public
router.post('/apa-application/:id/send-docusign', async (req, res) => {
  try {
    const { email } = req.body;
    const normalizedEmail = (email || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!normalizedEmail) {
      return errorResponse(res, new Error('Email is required to send DocuSign'), 400);
    }

    if (!emailRegex.test(normalizedEmail)) {
      return errorResponse(res, new Error('Please provide a valid email address'), 400);
    }

    const application = await APAApplication.findById(req.params.id);

    if (!application) {
      return errorResponse(res, new Error('Application not found'), 404);
    }

    if (application.status !== 'pending_signature') {
      return errorResponse(res, new Error('Application is not ready for DocuSign'), 400);
    }

    if (application.docusign?.envelopeId && application.docusign?.status && application.docusign.status !== 'draft') {
      return errorResponse(res, new Error('DocuSign envelope already sent. Use the resend option if needed.'), 400);
    }

    const conflictingApplication = await APAApplication.findOne({
      _id: { $ne: application._id },
      'personalInfo.email': normalizedEmail,
      status: { $in: ['pending_signature', 'pending_payment', 'active'] }
    });

    if (conflictingApplication) {
      return errorResponse(res, new Error('Another application already exists with this email'), 400);
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return errorResponse(res, new Error('An account already exists with this email'), 400);
    }

    application.personalInfo.email = normalizedEmail;

    const docusignResult = await initiateDocuSign(application);

    application.docusign.envelopeId = docusignResult.envelopeId;
    application.docusign.status = docusignResult.status;
    application.docusign.sentAt = new Date();
    await application.save();

    console.log('✅ DocuSign envelope sent:', {
      applicationId: application._id,
      envelopeId: application.docusign.envelopeId,
      email: application.personalInfo.email
    });

    sendResponse(res, 200, {
      message: 'DocuSign envelope sent successfully. Please check your email from DocuSign to sign the agreement.',
      docusign: {
        envelopeId: application.docusign.envelopeId,
        status: application.docusign.status,
        sentAt: application.docusign.sentAt
      },
      email: application.personalInfo.email
    });

  } catch (error) {
    console.error('❌ Send DocuSign error:', error);
    errorResponse(res, error);
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

    // No setup fee - subscription only at $20/mo
    sendResponse(res, 200, {
      ready: true,
      fees: {
        onboardingFee: 0,
        onboardingFeeWaived: true,
        monthlyFee: 20
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

    // No setup fee - subscription only at $20/mo
    const onboardingFee = 0;
    const monthlyFee = 20;
    const onboardingFeeWaived = true;

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
      type: 'setup_fee',
      amount: onboardingFee * 100, // Convert to cents
      currency: 'usd',
      stripePaymentIntentId: application.payment.stripePaymentIntentId,
      status: 'succeeded',
      description: 'APA Application - No Setup Fee',
      paidAt: new Date(),
      metadata: {
        applicationId: application._id,
        source: 'apa_application',
        feeWaived: true,
        originalAmount: 0 // No setup fee
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
    await sendAccountActivatedEmail(newUser, password);

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

module.exports = router;
