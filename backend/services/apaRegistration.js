/**
 * Turns a paid Stripe Checkout session for an APA application into an agent
 * account (user, payment, subscription, onboarding records, emails).
 *
 * Two entry points trigger this for the same payment: the applicant's browser
 * returning to /payment-success (verify-payment endpoint) and Stripe's
 * checkout.session.completed webhook (covers applicants who pay and close the
 * tab). Everything here is therefore idempotent and guarded by an atomic claim
 * on the application, so concurrent or repeated calls never create duplicate
 * users/payments/subscriptions.
 *
 * Nothing marks the application "completed" until the account and records
 * exist; if anything fails earlier the claim is released so a retry can finish
 * the job.
 */
const APAApplication = require('../models/APAApplication');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Onboarding = require('../models/Onboarding');
const SystemConfig = require('../models/SystemConfig');
const Coupon = require('../models/Coupon');
const Payment = require('../models/Payment');
const Subscription = require('../models/Subscription');
const OnboardingDocument = require('../models/OnboardingDocument');
const OnboardingDocType = require('../models/OnboardingDocType');
const { generatePassword } = require('../utils/helpers');
const { sendAccountActivatedEmail, sendWelcomeSetPasswordEmail } = require('../utils/neuzmail');
const { stripe, resolveStripeReceiptUrl, getSubscriptionPeriod } = require('../utils/stripe');

const CLAIM_STALE_MS = 5 * 60 * 1000;
const WAIT_POLL_MS = 1000;
const WAIT_MAX_POLLS = 15;
const PAID_STATUSES = ['paid', 'no_payment_required'];

class RegistrationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'RegistrationError';
    this.statusCode = statusCode;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const idOf = (value) => (value && typeof value === 'object' ? value.id : value) || undefined;
const isProcessed = (application) => ['completed', 'active'].includes(application.status);

async function alreadyProcessedResult(application) {
  const existingUser = await User.findOne({ email: application.personalInfo.email });
  return { alreadyProcessed: true, email: existingUser?.email };
}

async function releaseClaim(applicationId) {
  await APAApplication.updateOne(
    { _id: applicationId, status: 'pending_payment' },
    { $unset: { 'payment.registrationClaimedAt': '' } }
  );
}

async function completeApaRegistration(session, { wait = false } = {}) {
  if (!PAID_STATUSES.includes(session.payment_status)) {
    throw new RegistrationError('Payment not completed', 400);
  }

  const applicationId = session.client_reference_id;
  if (!applicationId) {
    throw new RegistrationError('Application ID not found in session', 400);
  }

  const application = await APAApplication.findById(applicationId);
  if (!application) {
    throw new RegistrationError('Application not found', 404);
  }

  if (isProcessed(application)) {
    return alreadyProcessedResult(application);
  }
  if (application.status !== 'pending_payment') {
    throw new RegistrationError(`Application is not ready for registration. Current status: ${application.status}`, 400);
  }

  // Atomic claim: only one caller proceeds. A claim older than CLAIM_STALE_MS
  // is treated as abandoned (crashed process) and can be taken over.
  const claimed = await APAApplication.findOneAndUpdate(
    {
      _id: applicationId,
      status: 'pending_payment',
      $or: [
        { 'payment.registrationClaimedAt': null },
        { 'payment.registrationClaimedAt': { $lt: new Date(Date.now() - CLAIM_STALE_MS) } }
      ]
    },
    { $set: { 'payment.registrationClaimedAt': new Date() } },
    { new: true }
  );

  if (!claimed) {
    // Someone else is mid-flight (or just finished).
    for (let i = 0; wait && i < WAIT_MAX_POLLS; i++) {
      await sleep(WAIT_POLL_MS);
      const latest = await APAApplication.findById(applicationId);
      if (latest && isProcessed(latest)) return alreadyProcessedResult(latest);
    }
    const latest = await APAApplication.findById(applicationId);
    if (latest && isProcessed(latest)) return alreadyProcessedResult(latest);
    if (!wait) return { inProgress: true };
    throw new RegistrationError('Your registration is still being processed. Please refresh in a moment.', 409);
  }

  try {
    return await finalizeRegistration(claimed, session);
  } catch (error) {
    await releaseClaim(applicationId).catch(() => {});
    throw error;
  }
}

async function finalizeRegistration(application, session) {
  const applicationId = application._id.toString();
  const personal = application.personalInfo || {};

  // Validate everything we need BEFORE touching any records, so a bad
  // application never ends up half-registered.
  const legalFirstName = personal.legalFirstName || personal.firstName || '';
  const legalLastName = personal.legalLastName || personal.lastName || '';
  const primaryPhone = personal.mobilePhone || personal.phone;
  const homeAddress = personal.homeAddress || {};

  if (!primaryPhone) {
    throw new RegistrationError('Application is missing a contact phone number', 400);
  }

  let referredById = null;
  let referringAgent = null;
  if (application.recruitingInfo?.referralCode) {
    referringAgent = await User.findOne({
      referralCode: application.recruitingInfo.referralCode,
      isActive: true
    }).select('_id name');
    if (referringAgent) referredById = referringAgent._id;
  }

  // User: reuse one left behind by an earlier, interrupted run of THIS
  // application; refuse if the email belongs to somebody else.
  let user = await User.findOne({ email: personal.email });
  let password = null;
  if (user) {
    if (user.metadata?.applicationId !== applicationId) {
      throw new RegistrationError('An account with this email already exists.', 409);
    }
  } else {
    password = generatePassword();
    user = new User({
      email: personal.email,
      password,
      name: `${legalFirstName} ${legalLastName}`.trim(),
      phone: primaryPhone,
      role: 'agent',
      isActive: true,
      referredBy: referredById,
      address: homeAddress.street || personal.address,
      city: homeAddress.city || personal.city,
      state: homeAddress.state || personal.state,
      zipCode: homeAddress.zipCode || personal.zip,
      metadata: {
        applicationId,
        referralCode: application.recruitingInfo?.referralCode || ''
      }
    });
    await user.save();
  }

  // Payment record. In subscription mode session.payment_intent is null — the
  // charge lives on the first invoice — so the invoice id is the natural key.
  // The invoice.paid webhook upserts on the same key, so look it up first to
  // avoid a duplicate row regardless of which event arrives first.
  const invoiceId = idOf(session.invoice);
  const paymentQuery = invoiceId ? { stripeInvoiceId: invoiceId } : { 'metadata.sessionId': session.id };
  let payment = await Payment.findOne(paymentQuery);
  if (!payment) {
    payment = new Payment({
      type: 'setup_fee',
      description: 'RHP Office registration payment'
    });
  }

  let receiptUrl = payment.receiptUrl || '';
  if (!receiptUrl) {
    try {
      receiptUrl = (await resolveStripeReceiptUrl({
        paymentIntentId: session.payment_intent,
        invoiceId
      })) || '';
    } catch (e) { /* best-effort; lazy resolver will retry on demand */ }
  }

  payment.user = user._id;
  payment.amount = session.amount_total;
  payment.currency = session.currency || payment.currency || 'usd';
  payment.status = 'succeeded';
  payment.stripePaymentIntentId = idOf(session.payment_intent) || payment.stripePaymentIntentId;
  payment.stripeInvoiceId = invoiceId || payment.stripeInvoiceId;
  payment.stripeCustomerId = idOf(session.customer) || payment.stripeCustomerId;
  payment.receiptUrl = receiptUrl;
  payment.paidAt = payment.paidAt || new Date();
  payment.metadata = { ...(payment.metadata || {}), applicationId, sessionId: session.id };
  await payment.save();

  // Subscription record (upsert by user: the schema allows one per user).
  let subscriptionPriceId = process.env.STRIPE_MONTHLY_PRICE_ID || null;
  let subscriptionAmount = parseInt(process.env.STRIPE_MONTHLY_SUBSCRIPTION_PRICE, 10) || 2000;
  let subscriptionStart = new Date();
  let subscriptionEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  let subscriptionStatus = 'active';

  const stripeSubscriptionId = idOf(session.subscription);
  if (stripeSubscriptionId) {
    try {
      const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
      subscriptionStatus = stripeSubscription.status || subscriptionStatus;
      const period = getSubscriptionPeriod(stripeSubscription);
      if (period.start) subscriptionStart = new Date(period.start * 1000);
      if (period.end) subscriptionEnd = new Date(period.end * 1000);

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

  await Subscription.findOneAndUpdate(
    { user: user._id },
    {
      $set: {
        user: user._id,
        stripeSubscriptionId,
        stripeCustomerId: idOf(session.customer),
        stripePriceId: subscriptionPriceId,
        status: subscriptionStatus,
        currentPeriodStart: subscriptionStart,
        currentPeriodEnd: subscriptionEnd,
        amount: subscriptionAmount,
        currency: 'usd',
        interval: 'month'
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // Onboarding record so the new agent shows up in the onboarding tab.
  let onboarding = await Onboarding.findOne({ user: user._id });
  if (!onboarding) {
    onboarding = new Onboarding({ user: user._id, status: 'not-started' });
    await onboarding.save();
  }
  user.onboarding = onboarding._id;
  user.onboardingStatus = user.onboardingStatus || 'not-started';

  user.stripeCustomerId = idOf(session.customer) || user.stripeCustomerId;
  user.stripeSubscriptionId = stripeSubscriptionId || user.stripeSubscriptionId;
  user.subscriptionStatus = subscriptionStatus || 'active';
  user.subscriptionStartDate = subscriptionStart;
  user.nextBillingDate = subscriptionEnd;
  user.lastPaymentDate = new Date();
  user.paymentAccessEnabled = true;
  user.oneTimePaymentCompleted = true;
  user.oneTimePaymentAmount = 0;
  user.oneTimePaymentDate = user.oneTimePaymentDate || new Date();

  // Token so the agent can set their password straight away.
  const setPasswordToken = user.getResetPasswordToken();
  await user.save();

  // Last: flip the application to completed. Until this point a failure
  // releases the claim and a retry resumes with the records created above.
  application.status = 'completed';
  application.completedAt = new Date();
  application.userId = user._id;
  application.user = user._id;
  application.payment.paymentStatus = 'completed';
  application.payment.paymentIntentId = idOf(session.payment_intent);
  application.payment.paidAt = new Date();
  application.payment.amount = session.amount_total / 100;
  application.payment.registrationClaimedAt = undefined;
  await application.save();

  // Count the coupon only now that the payment actually went through (and
  // only once), instead of when checkout was merely started.
  if (application.payment.couponCode) {
    try {
      const firstCount = await APAApplication.findOneAndUpdate(
        { _id: applicationId, 'payment.couponUsageCounted': { $ne: true } },
        { $set: { 'payment.couponUsageCounted': true } }
      );
      if (firstCount) {
        await Coupon.updateOne({ code: application.payment.couponCode }, { $inc: { usageCount: 1 } });
      }
    } catch (couponErr) {
      console.error('Failed to record coupon usage:', couponErr.message);
    }
  }

  // Everything below is non-blocking: the account and payment already exist,
  // so none of it may surface as a failure to an applicant who did pay.
  try {
    const apaDocType = await OnboardingDocType.findOne({ name: 'APA Agreement', isActive: true });
    if (apaDocType && application.docusign?.documentUrl) {
      const docRelPath = application.docusign.documentUrl.replace(/^\//, '');
      await OnboardingDocument.findOneAndUpdate(
        { agent: user._id, docType: apaDocType._id },
        {
          $set: {
            agent: user._id,
            docType: apaDocType._id,
            filePath: docRelPath,
            // Do NOT set externalLink — see the other APA Agreement
            // OnboardingDocument upsert in apa.routes.js.
            externalLink: null,
            originalFileName: `APA_Agreement_${personal.legalFirstName || ''}_${personal.legalLastName || ''}.pdf`.replace(/\s+/g, '_'),
            uploadedBy: user._id,
            uploadedAt: application.docusign.signedDate || application.docusign.signedAt || new Date(),
            deletedAt: null
          }
        },
        { upsert: true, new: true }
      );
    }
  } catch (onboardingErr) {
    console.error('Failed to create OnboardingDocument for APA Agreement during payment:', onboardingErr);
  }

  try {
    if (setPasswordToken) {
      await sendWelcomeSetPasswordEmail(user, setPasswordToken, referringAgent);
    } else if (password) {
      await sendAccountActivatedEmail(user, password);
    }
  } catch (emailError) {
    console.error('Failed to send welcome/activation email:', emailError.message);
  }

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

  return { created: true, email: user.email, setPasswordToken };
}

module.exports = { completeApaRegistration, RegistrationError };
