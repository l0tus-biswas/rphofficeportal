const express = require('express');
const router = express.Router();
const APAApplication = require('../models/APAApplication');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Onboarding = require('../models/Onboarding');
const SystemConfig = require('../models/SystemConfig');
const multer = require('../utils/multer');
const path = require('path');
const fs = require('fs');
const { sendResponse, errorResponse, generatePassword } = require('../utils/helpers');
const { sendApplicationConfirmationEmail, sendPaymentLinkEmail, sendAccountActivatedEmail, sendWelcomeSetPasswordEmail } = require('../utils/neuzmail');
const { applyLimiter } = require('../middleware/rateLimiter.middleware');
// Migrated from DocuSign to Zoho Sign (see backend/utils/zohosign.js for the
// integration code; backend/utils/docusign.js is kept temporarily for
// reference/rollback but is no longer called anywhere). The `docusign` field
// name on APAApplication documents is kept as-is deliberately — it is a
// generic envelope/status/document shape, not DocuSign-specific, and
// renaming it would require touching every admin and frontend read site for
// no functional benefit.
const {
  createAPAEnvelope,
  getEnvelopeStatus,
  downloadSignedDocument,
  processWebhook,
  validateWebhookSignature
} = require('../utils/zohosign');
const { initiateDocuSign } = require('../utils/apaSigning');
const { completeApaRegistration, RegistrationError } = require('../services/apaRegistration');
const Coupon = require('../models/Coupon');
const Payment = require('../models/Payment');
const Subscription = require('../models/Subscription');
const { stripe, resolveStripeReceiptUrl, getSubscriptionPeriod } = require('../utils/stripe');
const OnboardingDocument = require('../models/OnboardingDocument');
const OnboardingDocType = require('../models/OnboardingDocType');

// TEST ROUTE - Get Zoho Sign template fields
// TEST ROUTE REMOVED — was exposing Zoho Sign template internals publicly (Audit Fix #7)

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

    console.log('Application saved. Zoho Sign launch is pending user confirmation.');
    console.log('Applicant email on file:', application.personalInfo.email);

    // Non-blocking: the application is already saved, so a transactional email
    // failure (e.g. provider misconfiguration) must not surface as a submission
    // error to an applicant whose application was actually created successfully.
    try {
      await sendApplicationConfirmationEmail(application);
      console.log('Confirmation email sent to:', application.personalInfo.email);
    } catch (emailError) {
      console.error('Failed to send application confirmation email:', emailError.message);
    }

    sendResponse(res, 201, {
      message: 'Application submitted successfully. Review the next screen to confirm the email and send your signature packet.',
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
// NOTE: path kept as "docusign-webhook" even though this now handles Zoho
// Sign — nothing external has this URL registered yet, so renaming it costs
// nothing, but keeping one name avoids a second config value to track during
// the migration. Rename once Zoho Sign is registered and settled.
router.get('/apa-application/docusign-webhook', async (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Zoho Sign webhook endpoint is active',
    info: 'This is a POST endpoint for Zoho Sign webhooks. It should not be accessed directly via browser.',
    status: 'Webhook endpoint is ready to receive events from Zoho Sign'
  });
});

// @route   POST /api/public/apa-application/docusign-webhook
// @desc    Zoho Sign webhook - handle signature completion (global endpoint)
// @access  Public (validates Zoho Sign HMAC signature)
// Raw body is required for HMAC verification — see the ZOHO_SIGN_WEBHOOK_PATH
// exemption in server.js that skips the global JSON parser for this route.
router.post('/apa-application/docusign-webhook', express.raw({ type: '*/*' }), async (req, res) => {
  try {
    console.log('\n=== Zoho Sign Webhook Received ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Headers:', JSON.stringify(req.headers, null, 2));

    req.rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body || {});
    let parsedBody;
    try {
      parsedBody = JSON.parse(req.rawBody);
    } catch (parseErr) {
      console.error('❌ Zoho Sign webhook body was not valid JSON:', parseErr.message);
      return res.status(200).json({ message: 'Webhook received but body was not valid JSON' });
    }
    console.log('Body:', JSON.stringify(parsedBody, null, 2));

    // Lenient signature validation - allow webhooks through even if signature validation fails
    const isValidSignature = validateWebhookSignature(req);
    if (!isValidSignature) {
      // An unsigned call could mark any application as signed, so production rejects it.
      if (process.env.NODE_ENV === 'production') {
        console.warn('⚠️ Webhook signature validation failed - rejected');
        return res.status(401).json({ message: 'Invalid webhook signature' });
      }
      console.warn('⚠️ Webhook signature validation failed or not provided - allowing outside production');
    } else {
      console.log('✅ Webhook signature validated');
    }

    // Process webhook data
    const webhookData = await processWebhook(parsedBody);
    const { envelopeId, status, appStatus, signedAt } = webhookData;

    console.log('📋 Processing Zoho Sign webhook:', {
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

    // Duplicate "completed" deliveries must not push an already-reviewed
    // application back to pending_payment (or re-run a re-sign completion).
    if (status === 'completed' && application.docusign.status === 'completed' &&
        ['pending_review', 'active', 'completed', 'rejected'].includes(application.status)) {
      return sendResponse(res, 200, { message: 'Webhook already processed' });
    }

    let resignCompleted = false;

    // Update Zoho Sign status
    application.docusign.status = status;
    
    // An agent who edited an existing application (edit request or rejection)
    // signs again; that must not re-enter the payment step.
    const isResign = !!application.resign?.required;

    if (status === 'completed') {
      console.log(isResign
        ? '✅ Re-signed document completed! Updating to pending_review...'
        : '✅ Document completed! Updating to pending_payment...');
      application.docusign.signedDate = signedAt || new Date();
      application.docusign.signedAt = signedAt || new Date();
      application.status = isResign ? 'pending_review' : 'pending_payment';

      // Download signed document. A re-signed document gets a versioned file
      // name so the superseded version's PDF stays available in the history.
      const signedFileName = isResign
        ? `${application._id}_signed_apa_v${application.currentVersion || 1}.pdf`
        : `${application._id}_signed_apa.pdf`;
      const signedDocPath = path.join(
        __dirname,
        '../uploads/apa-signed',
        signedFileName
      );

      try {
        await downloadSignedDocument(envelopeId, signedDocPath);
        application.docusign.signedDocumentPath = signedDocPath;
        application.docusign.documentUrl = `/uploads/apa-signed/${signedFileName}`;
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
            await OnboardingDocument.findOneAndUpdate(
              { agent: agentUserId, docType: apaDocType._id },
              {
                $set: {
                  agent: agentUserId,
                  docType: apaDocType._id,
                  filePath: docRelPath,
                  // Do NOT set externalLink here — this file lives in our own
                  // protected /uploads storage (authenticated via filePath +
                  // the onboarding-hub download route), not a genuine external
                  // resource. Setting externalLink to the same internal path
                  // previously caused the UI to link straight to the
                  // protected URL with no auth, producing 401s.
                  externalLink: null,
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

      // Send payment link email — non-blocking. This must not throw here:
      // doing so would skip application.save() below and leave the application
      // stuck on 'pending_signature' even though Zoho Sign fully completed,
      // blocking the applicant from ever reaching the payment step.
      if (isResign) {
        application.resign.required = false;
        resignCompleted = true;
      } else {
        console.log('📧 Sending payment email to:', application.personalInfo.email);
        try {
          await sendPaymentLinkEmail(application);
          console.log('✅ Payment email sent successfully');
        } catch (emailError) {
          console.error('❌ Failed to send payment link email:', emailError.message);
        }
      }
    } else if (status === 'declined' || status === 'voided') {
      // Handle declined/voided envelopes
      console.log(`⚠️ Document ${status}`);
      // A declined re-sign keeps the application in pending_resignature so the
      // agent can ask for a fresh signature request.
      if (!isResign) application.status = 'signature_' + status;
    }

    await application.save();
    console.log('✅ Application saved with new status:', application.status);

    if (resignCompleted) {
      await notifyResignCompleted(application);
    }
    console.log('=== Webhook Processing Complete ===\n');

    sendResponse(res, 200, { message: 'Webhook processed successfully' });

  } catch (error) {
    console.error('❌ Zoho Sign Webhook Error:', error);
    console.error('Error stack:', error.stack);
    // Always return 200 to Zoho Sign to prevent retries
    res.status(200).json({ message: 'Webhook received with errors', error: error.message });
  }
});

// @route   GET /api/public/apa-application/verify-coupon/:code
// @desc    Verify a coupon code and return the discount it would apply
// @access  Public
router.get('/apa-application/verify-coupon/:code', applyLimiter, async (req, res) => {
  try {
    const normalizedCode = req.params.code.toUpperCase();
    const coupon = await Coupon.findOne({ code: normalizedCode });

    if (!coupon || !coupon.isValid || (coupon.applicableRoles?.length > 0 && !coupon.applicableRoles.includes('agent'))) {
      return sendResponse(res, 200, { valid: false, message: `Coupon "${normalizedCode}" is not valid.` });
    }

    const monthlyAmountCents = parseInt(process.env.STRIPE_MONTHLY_SUBSCRIPTION_PRICE, 10) || 2000;
    const { discount, finalAmount } = coupon.calculateDiscount(monthlyAmountCents / 100);

    sendResponse(res, 200, {
      valid: true,
      code: normalizedCode,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      discount,
      finalAmount
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/public/apa-application/create-checkout-session
// @desc    Create Stripe checkout session for APA payment
// @access  Public
router.post('/apa-application/create-checkout-session', applyLimiter, async (req, res) => {
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
        applicantName: `${application.personalInfo.legalFirstName || application.personalInfo.firstName} ${application.personalInfo.legalLastName || application.personalInfo.lastName}`,
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
    let stripeCouponId = null;
    if (!couponCode && application.payment?.couponCode) {
      // A coupon from an earlier, abandoned attempt must not be counted for
      // this one.
      application.payment.couponCode = undefined;
      await application.save();
    }
    if (couponCode) {
      const normalizedCode = couponCode.toUpperCase();
      const coupon = await Coupon.findOne({ code: normalizedCode });

      if (!coupon) {
        return sendResponse(res, 400, { message: `Coupon "${normalizedCode}" was not found.` });
      }

      if (!coupon.isValid) {
        return sendResponse(res, 400, { message: `Coupon "${normalizedCode}" is expired, inactive, or has reached its usage limit.` });
      }

      if (coupon.applicableRoles?.length > 0 && !coupon.applicableRoles.includes('agent')) {
        return sendResponse(res, 400, { message: `Coupon "${normalizedCode}" is not applicable to this purchase.` });
      }

      const { discount } = coupon.calculateDiscount(monthlyAmountCents / 100);

      // Create a one-time-use Stripe coupon mirroring the DB coupon definition,
      // since admin-created coupons are never registered as Stripe Coupon objects.
      const stripeCoupon = coupon.discountType === 'percentage'
        ? await stripe.coupons.create({ percent_off: coupon.discountValue, duration: 'once', name: normalizedCode, max_redemptions: 1 })
        : await stripe.coupons.create({ amount_off: Math.round(discount * 100), currency: 'usd', duration: 'once', name: normalizedCode, max_redemptions: 1 });
      stripeCouponId = stripeCoupon.id;

      sessionParams.discounts = [{ coupon: stripeCoupon.id }];

      console.log(`✅ Coupon ${normalizedCode} applied to checkout session ($${discount.toFixed(2)} off)`);

      // NOTE: usageCount is NOT incremented here. Starting checkout isn't a
      // redemption — it is counted once the payment completes
      // (services/apaRegistration.js), so abandoned or repeated attempts
      // don't burn the coupon's usage limit.
      if (!application.payment) {
        application.payment = {};
      }
      application.payment.couponCode = normalizedCode;
      await application.save();
    }

    let session;
    try {
      session = await stripe.checkout.sessions.create(sessionParams);
    } catch (sessionError) {
      // Don't leave an orphaned one-off coupon behind in Stripe.
      if (stripeCouponId) {
        await stripe.coupons.del(stripeCouponId).catch(() => {});
      }
      throw sessionError;
    }

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

    // Account creation is shared with the Stripe checkout.session.completed
    // webhook and is idempotent/atomic (see services/apaRegistration.js).
    const result = await completeApaRegistration(session, { wait: true });

    if (result.alreadyProcessed) {
      return sendResponse(res, 200, {
        success: true,
        message: 'Payment already verified',
        accountCreated: true,
        email: result.email
      });
    }

    sendResponse(res, 200, {
      success: true,
      message: 'Payment verified and account created successfully',
      accountCreated: true,
      email: result.email,
      setPasswordToken: result.setPasswordToken // Token for immediate password setup
    });

  } catch (error) {
    if (error instanceof RegistrationError) {
      return sendResponse(res, error.statusCode, { message: error.message });
    }
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
    console.log('=== Zoho Sign Return Handler Called (Legacy) ===');
    console.log('Note: This endpoint is no longer used with email-based Zoho Sign signing');
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
          <p>Please check your email from Zoho Sign to sign your agreement.</p>
          <p>After signing, you'll receive instructions for payment setup.</p>
          <p>Redirecting to home page in 3 seconds...</p>
        </div>
      </body>
      </html>
    `);

  } catch (error) {
    console.error('Zoho Sign Return Error:', error);
    const homeUrl = `${process.env.APP_URL || 'http://localhost:4200'}`;
    res.redirect(homeUrl);
  }
});

// @route   POST /api/public/apa-application/:id/send-docusign
// @desc    Confirm email and send Zoho Sign envelope
// @access  Public
router.post('/apa-application/:id/send-docusign', async (req, res) => {
  try {
    const { email } = req.body;
    const normalizedEmail = (email || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!normalizedEmail) {
      return errorResponse(res, new Error('Email is required to send the signature request'), 400);
    }

    if (!emailRegex.test(normalizedEmail)) {
      return errorResponse(res, new Error('Please provide a valid email address'), 400);
    }

    const application = await APAApplication.findById(req.params.id);

    if (!application) {
      return errorResponse(res, new Error('Application not found'), 404);
    }

    if (application.status !== 'pending_signature') {
      return errorResponse(res, new Error('Application is not ready for signature'), 400);
    }

    if (application.docusign?.envelopeId && application.docusign?.status && application.docusign.status !== 'draft') {
      return errorResponse(res, new Error('Signature request already sent. Use the resend option if needed.'), 400);
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

    console.log('✅ Zoho Sign envelope sent:', {
      applicationId: application._id,
      envelopeId: application.docusign.envelopeId,
      email: application.personalInfo.email
    });

    sendResponse(res, 200, {
      message: 'Signature request sent successfully. Please check your email from Zoho Sign to sign the agreement.',
      docusign: {
        envelopeId: application.docusign.envelopeId,
        status: application.docusign.status,
        sentAt: application.docusign.sentAt
      },
      email: application.personalInfo.email
    });

  } catch (error) {
    console.error('❌ Send Zoho Sign error:', error);
    errorResponse(res, error);
  }
});

// @route   POST /api/public/apa-application/:id/resend-docusign
// @desc    Resend Zoho Sign envelope for an application
// @access  Public (can also be called from admin)
router.post('/apa-application/:id/resend-docusign', async (req, res) => {
  try {
    console.log('=== Resending Zoho Sign for Application ===');
    console.log('Application ID:', req.params.id);
    
    const application = await APAApplication.findById(req.params.id);
    
    if (!application) {
      return errorResponse(res, new Error('Application not found'), 404);
    }

    // Check if already signed
    if (application.docusign.status === 'completed') {
      return errorResponse(res, new Error('Agreement already signed'), 400);
    }

    // Create new Zoho Sign envelope
    const docusignResult = await initiateDocuSign(application);

    // Update application with new envelope info
    application.docusign.envelopeId = docusignResult.envelopeId;
    application.docusign.status = docusignResult.status;
    application.docusign.sentAt = new Date();
    await application.save();

    // Send confirmation email - Zoho Sign will send signing email.
    // Non-blocking: the envelope was already sent and saved above, so an email
    // failure here must not surface as a "resend failed" error.
    try {
      await sendApplicationConfirmationEmail(application);
    } catch (emailError) {
      console.error('Failed to send resend-Zoho Sign confirmation email:', emailError.message);
    }

    console.log('✅ Zoho Sign resent successfully');

    sendResponse(res, 200, {
      message: 'Signature request resent successfully. Check your email from Zoho Sign to sign.',
      envelopeId: docusignResult.envelopeId
    });

  } catch (error) {
    console.error('❌ Resend Zoho Sign error:', error);
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
      return errorResponse(res, new Error('Application not ready for payment. Please complete the signature step first.'), 403);
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
// @desc    Complete mock Zoho Sign signature
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

    // This endpoint is unauthenticated and only exists for the development mock signing page.
    // A real e-sign request must be completed by the provider (via its webhook), never by the
    // applicant calling this route, and mock mode never exists in production.
    const envelopeId = String(application.docusign?.envelopeId || '');
    if (process.env.NODE_ENV === 'production' || !envelopeId.startsWith('MOCK_')) {
      return errorResponse(res, new Error('Signature can only be completed through the e-signature provider'), 403);
    }

    // Update signature status
    application.docusign.status = 'completed';
    application.docusign.signedDate = new Date();
    application.status = 'pending_payment';
    await application.save();

    // Send payment link email — non-blocking, status is already saved above.
    try {
      await sendPaymentLinkEmail(application);
    } catch (emailError) {
      console.error('Failed to send payment link email:', emailError.message);
    }

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
    // Development-only mock: it creates an active, paid account with fabricated Stripe ids and
    // verifies no payment. Real registrations are completed by the Stripe payment verification.
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ success: false, message: 'Not found' });
    }

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

    // Update payment info
    application.payment.onboardingFeeAmount = onboardingFee;
    application.payment.monthlyFeeAmount = monthlyFee;
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

    // Send welcome email with credentials — non-blocking, account is already
    // fully created and saved above.
    try {
      await sendAccountActivatedEmail(newUser, password);
    } catch (emailError) {
      console.error('Failed to send account activation email:', emailError.message);
    }

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

function generateReferralCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'AG';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// After an agent re-signs an edited/rejected application: tell the admins it is
// waiting for re-approval and confirm to the agent. Best-effort, never throws.
async function notifyResignCompleted(application) {
  try {
    const name = [application.personalInfo?.legalFirstName, application.personalInfo?.legalLastName].filter(Boolean).join(' ') || 'An agent';
    const agentId = application.userId || application.user;
    const admins = await User.find({ role: 'admin', isActive: true, deletedAt: null }).select('_id').lean();
    for (const admin of admins) {
      await Notification.createNotification({
        userId: admin._id,
        type: 'apa_resigned',
        title: 'APA Application Re-signed',
        message: `${name} re-signed their updated APA application (version ${application.currentVersion}). It is waiting for your review.`,
        data: { applicationId: String(application._id), agentId: agentId ? String(agentId) : undefined },
        link: `/admin/apa-applications/${application._id}`
      }, false);
    }
    if (agentId) {
      await Notification.createNotification({
        userId: agentId,
        type: 'apa_resigned',
        title: 'APA Application Re-signed',
        message: 'Thanks for signing your updated APA application. It is now pending admin review.',
        link: '/onboarding'
      }, false);
    }
  } catch (err) {
    console.error('[APA Resign] Notification error:', err.message);
  }
}

module.exports = router;
