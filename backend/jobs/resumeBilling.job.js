/**
 * Resumes billing for agents whose Free Access was removed after their
 * original Stripe subscription had already fully ended. Rather than
 * charging them the instant an admin removes Free Access, admin.routes.js
 * schedules a resume for RESUME_GRACE_PERIOD_DAYS in the future
 * (user.pendingBillingResumeAt) and notifies the agent immediately. This
 * job runs periodically, finds resumes whose scheduled time has elapsed,
 * and actually creates the new subscription (charging their saved card).
 *
 * Retry behavior (confirmed with client): up to RESUME_MAX_ATTEMPTS charge
 * attempts total (1 initial + retries), spaced RESUME_RETRY_INTERVAL_DAYS
 * apart. Platform access is revoked as soon as the first attempt fails, and
 * restored immediately if a later retry succeeds. After the final attempt
 * fails, retries stop and admins are notified for manual follow-up.
 */
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const Notification = require('../models/Notification');
const logger = require('../utils/logger');
const { resumeSubscriptionForCustomer, getSubscriptionPeriod } = require('../utils/stripe');
const { RESUME_RETRY_INTERVAL_DAYS, RESUME_MAX_ATTEMPTS } = require('../config/billingResume.constants');

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly

async function processDueBillingResumes() {
  const dueUsers = await User.find({
    billingExempt: false,
    pendingBillingResumeAt: { $ne: null, $lte: new Date() }
  });

  for (const user of dueUsers) {
    try {
      const priceId = process.env.STRIPE_MONTHLY_PRICE_ID;
      if (!user.stripeCustomerId || !priceId) {
        logger.error('Resume billing job: missing Stripe customer/price, skipping', { userId: user._id.toString() });
        user.pendingBillingResumeAt = null;
        await user.save();
        continue;
      }

      const newSubscription = await resumeSubscriptionForCustomer(user.stripeCustomerId, priceId, {
        userId: user._id.toString(),
        email: user.email
      });

      // The Subscription schema enforces one document per user (unique
      // index on `user`) — this user already has one from their original
      // subscription, so upsert-by-user rather than create().
      const period = getSubscriptionPeriod(newSubscription);
      await Subscription.findOneAndUpdate(
        { user: user._id },
        {
          $set: {
            user: user._id,
            stripeSubscriptionId: newSubscription.id,
            stripeCustomerId: user.stripeCustomerId,
            stripePriceId: priceId,
            status: newSubscription.status,
            currentPeriodStart: period.start ? new Date(period.start * 1000) : undefined,
            currentPeriodEnd: period.end ? new Date(period.end * 1000) : undefined,
            amount: parseInt(process.env.STRIPE_MONTHLY_SUBSCRIPTION_PRICE) || 2000,
            currency: 'usd',
            interval: 'month',
            cancelAtPeriodEnd: false,
            canceledAt: null,
            endedAt: null
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      user.stripeSubscriptionId = newSubscription.id;
      user.subscriptionStatus = newSubscription.status;
      if (period.start) user.subscriptionStartDate = new Date(period.start * 1000);
      if (period.end) user.nextBillingDate = new Date(period.end * 1000);
      user.paymentAccessEnabled = true;
      user.pendingBillingResumeAt = null;
      user.billingResumeAttempts = 0;
      await user.save();

      Notification.createNotification({
        userId: user._id,
        type: 'subscription_resumed',
        title: 'Billing Resumed',
        message: 'Your subscription has resumed and your card on file has been charged. Thanks for your continued partnership!',
        link: '/transactions'
      }, true).catch(() => {});
    } catch (error) {
      await handleFailedResumeAttempt(user, error);
    }
  }
}

async function handleFailedResumeAttempt(user, error) {
  logger.error('Resume billing job: charge attempt failed', {
    userId: user._id.toString(),
    attempt: user.billingResumeAttempts + 1,
    message: error.message
  });

  user.billingResumeAttempts += 1;
  // Access drops as soon as a charge attempt fails, and stays down until a
  // later retry succeeds (or an admin/agent resolves it manually).
  user.paymentAccessEnabled = false;

  const attemptsRemaining = RESUME_MAX_ATTEMPTS - user.billingResumeAttempts;

  if (attemptsRemaining > 0) {
    user.pendingBillingResumeAt = new Date(Date.now() + RESUME_RETRY_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
    await user.save();

    Notification.createNotification({
      userId: user._id,
      type: 'payment_failed',
      title: 'Payment Failed — Retrying',
      message: `We couldn't process your payment. Your access has been paused, and we'll try again in ${RESUME_RETRY_INTERVAL_DAYS} days. Update your payment method in Transactions to avoid further delay.`,
      link: '/transactions'
    }, true).catch(() => {});
    return;
  }

  // Final attempt exhausted — stop retrying automatically.
  user.pendingBillingResumeAt = null;
  await user.save();

  Notification.createNotification({
    userId: user._id,
    type: 'payment_failed',
    title: 'Could Not Resume Billing',
    message: 'We tried multiple times to resume your subscription using your card on file, but the charges kept failing. Please update your payment method or contact support to restore access.',
    link: '/transactions'
  }, true).catch(() => {});

  try {
    const admins = await User.find({ role: 'admin', isActive: true }).select('_id').lean();
    for (const admin of admins) {
      Notification.createNotification({
        userId: admin._id,
        type: 'agent_billing_resume_failed',
        title: 'Failed to Resume Agent Billing',
        message: `${user.name} (${user.email})'s billing could not be resumed after ${RESUME_MAX_ATTEMPTS} attempts: ${error.message}`,
        link: '/admin/users',
        data: { agentId: user._id }
      }, true).catch(() => {});
    }
  } catch (notifyErr) {
    logger.error('Resume billing job: failed to notify admins', { message: notifyErr.message });
  }
}

let intervalHandle = null;

function startResumeBillingJob() {
  if (intervalHandle) return intervalHandle;
  intervalHandle = setInterval(() => {
    processDueBillingResumes().catch(err => {
      logger.error('Resume billing job: unhandled error', { message: err.message, stack: err.stack });
    });
  }, CHECK_INTERVAL_MS);
  intervalHandle.unref?.();
  return intervalHandle;
}

function stopResumeBillingJob() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = { startResumeBillingJob, stopResumeBillingJob, processDueBillingResumes };
