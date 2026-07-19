const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Payment = require('../models/Payment');
const Subscription = require('../models/Subscription');
const Notification = require('../models/Notification');
const { protect, authorize } = require('../middleware/auth.middleware');
const { sendResponse, errorResponse } = require('../utils/helpers');
const {
  createCustomer,
  createPaymentIntent,
  createSubscription,
  cancelSubscription,
  cancelSubscriptionAtPeriodEnd,
  reactivateSubscription,
  retrieveSubscription,
  retrieveCharge,
  resolveStripeReceiptUrl,
  createBillingPortalSession,
  constructWebhookEvent
} = require('../utils/stripe');

// @route   POST /api/payments/create-customer
// @desc    Create Stripe customer for user
// @access  Private
router.post('/create-customer', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (user.stripeCustomerId) {
      return sendResponse(res, 400, { message: 'Customer already exists' });
    }

    const customer = await createCustomer(
      user.email,
      user.name,
      { userId: user._id.toString() }
    );

    user.stripeCustomerId = customer.id;
    await user.save();

    sendResponse(res, 200, {
      customerId: customer.id,
      message: 'Customer created successfully'
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/payments/one-time-intent
// @desc    Create payment intent for setup fee (no longer used - kept for legacy)
// @access  Private
router.post('/one-time-intent', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user.billingExempt) {
      return sendResponse(res, 400, { message: 'User is billing exempt - no payment required' });
    }

    if (user.oneTimePaymentCompleted) {
      return sendResponse(res, 400, { message: 'Setup fee already completed' });
    }

    // Create customer if doesn't exist
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await createCustomer(
        user.email,
        user.name,
        { userId: user._id.toString() }
      );
      customerId = customer.id;
      user.stripeCustomerId = customerId;
      await user.save();
    }

    const amount = parseInt(process.env.STRIPE_ONE_TIME_PRICE) || 2000; // $20 (subscription only)

    const paymentIntent = await createPaymentIntent(
      amount,
      'usd',
      customerId,
      {
        userId: user._id.toString(),
        type: 'setup_fee',
        email: user.email
      }
    );

    // Create payment record
    await Payment.create({
      user: user._id,
      type: 'setup_fee',
      amount: amount,
      currency: 'usd',
      stripePaymentIntentId: paymentIntent.id,
      status: 'pending',
      description: 'Setup fee payment'
    });

    sendResponse(res, 200, {
      clientSecret: paymentIntent.client_secret,
      amount: amount
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/payments/subscription-intent
// @desc    Create subscription for $20/month
// @access  Private
router.post('/subscription-intent', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user.oneTimePaymentCompleted) {
      return sendResponse(res, 400, { message: 'Please complete the setup fee payment first' });
    }

    if (user.stripeSubscriptionId) {
      return sendResponse(res, 400, { message: 'Subscription already exists' });
    }

    const customerId = user.stripeCustomerId;
    if (!customerId) {
      return sendResponse(res, 400, { message: 'Customer not found' });
    }

    const priceId = process.env.STRIPE_MONTHLY_PRICE_ID;
    if (!priceId) {
      return sendResponse(res, 500, { message: 'Stripe price ID not configured' });
    }

    const subscription = await createSubscription(
      customerId,
      priceId,
      {
        userId: user._id.toString(),
        email: user.email
      }
    );

    // Create subscription record
    await Subscription.create({
      user: user._id,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: customerId,
      stripePriceId: priceId,
      status: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      amount: parseInt(process.env.STRIPE_MONTHLY_SUBSCRIPTION_PRICE) || 2000,
      currency: 'usd',
      interval: 'month'
    });

    user.stripeSubscriptionId = subscription.id;
    user.subscriptionStatus = subscription.status;
    user.subscriptionStartDate = new Date(subscription.current_period_start * 1000);
    user.nextBillingDate = new Date(subscription.current_period_end * 1000);
    await user.save();

    const clientSecret = subscription.latest_invoice.payment_intent.client_secret;

    sendResponse(res, 200, {
      subscriptionId: subscription.id,
      clientSecret: clientSecret,
      status: subscription.status
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/payments/status
// @desc    Get payment and subscription status
// @access  Private
router.get('/status', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    // Billing-exempt users always have full access
    if (user.billingExempt) {
      return sendResponse(res, 200, {
        billingExempt: true,
        billingExemptReason: user.billingExemptReason,
        oneTimePaymentCompleted: true,
        subscriptionStatus: 'exempt',
        paymentAccessEnabled: true
      });
    }

    // Fetch subscription from Subscription model (source of truth)
    let subscriptionDetails = null;
    let subscriptionStatus = user.subscriptionStatus || 'none';
    let nextBillingDate = user.nextBillingDate;
    let subscriptionStartDate = user.subscriptionStartDate;

    const subscriptionQuery = user.stripeSubscriptionId
      ? { stripeSubscriptionId: user.stripeSubscriptionId }
      : { user: user._id };

    const subscription = await Subscription.findOne(subscriptionQuery).sort({ createdAt: -1 });

    if (subscription) {
      subscriptionDetails = subscription;
      subscriptionStatus = subscription.status || subscriptionStatus;
      nextBillingDate = subscription.currentPeriodEnd || nextBillingDate;
      subscriptionStartDate = subscription.currentPeriodStart || subscriptionStartDate;
    }

    const subscriptionActive = ['active', 'trialing'].includes(subscriptionStatus);
    const derivedOneTimeCompleted = user.oneTimePaymentCompleted || subscriptionActive;
    const derivedOneTimeAmount = typeof user.oneTimePaymentAmount === 'number'
      ? user.oneTimePaymentAmount
      : 0;

    sendResponse(res, 200, {
      oneTimePaymentCompleted: derivedOneTimeCompleted,
      oneTimePaymentAmount: derivedOneTimeAmount,
      oneTimePaymentDate: user.oneTimePaymentDate,
      subscriptionStatus: subscriptionStatus,
      subscriptionStartDate: subscriptionStartDate,
      nextBillingDate: nextBillingDate,
      lastPaymentDate: user.lastPaymentDate,
      paymentAccessEnabled: user.paymentAccessEnabled || subscriptionActive,
      subscription: subscriptionDetails
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/payments/cancel-subscription
// @desc    Agent self-service: cancel own subscription at the end of the current
//          billing period (keeps access for the period already paid; not billed
//          the following cycle). Syncs Stripe + local subscription record.
// @access  Private
router.post('/cancel-subscription', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user.billingExempt) {
      return sendResponse(res, 400, { message: 'Your account is billing exempt — there is no subscription to cancel.' });
    }

    if (!user.stripeSubscriptionId) {
      return sendResponse(res, 404, { message: 'No active subscription found to cancel.' });
    }

    const subscription = await Subscription.findOne({
      stripeSubscriptionId: user.stripeSubscriptionId
    });

    if (subscription && (subscription.status === 'canceled' || subscription.endedAt)) {
      return sendResponse(res, 400, { message: 'Your subscription is already canceled.' });
    }

    if (subscription && subscription.cancelAtPeriodEnd) {
      return sendResponse(res, 400, {
        message: 'Your subscription is already scheduled to cancel at the end of the current billing period.'
      });
    }

    // Schedule cancellation at period end in Stripe (source of truth)
    const stripeSubscription = await cancelSubscriptionAtPeriodEnd(user.stripeSubscriptionId);

    const periodEnd = stripeSubscription.current_period_end
      ? new Date(stripeSubscription.current_period_end * 1000)
      : (subscription ? subscription.currentPeriodEnd : user.nextBillingDate);

    // Sync local subscription record (webhook customer.subscription.updated will
    // also confirm this, but we update immediately for a responsive UI/admin view)
    if (subscription) {
      subscription.cancelAtPeriodEnd = true;
      subscription.canceledAt = new Date();
      if (stripeSubscription.current_period_end) {
        subscription.currentPeriodEnd = periodEnd;
      }
      await subscription.save();
    }

    // Keep status/access unchanged — agent retains access until period end.
    Notification.createNotification({
      userId: user._id,
      type: 'subscription_canceled',
      title: 'Subscription Cancellation Scheduled',
      message: `Your subscription will not renew. You'll keep access until ${periodEnd ? periodEnd.toLocaleDateString('en-US') : 'the end of the current billing period'}, and you won't be billed for the next cycle.`,
      link: '/transactions'
    }, false).catch(() => {});

    // Notify admins immediately so they can remove/deactivate the agent in
    // QuickBooks (or elsewhere) before the next billing cycle to avoid
    // unnecessary ongoing charges tied to this agent.
    try {
      const admins = await User.find({ role: 'admin', isActive: true }).select('_id').lean();
      for (const admin of admins) {
        Notification.createNotification({
          userId: admin._id,
          type: 'agent_subscription_canceled',
          title: 'Agent Canceled Subscription',
          message: `${user.name} (${user.email}) has canceled their subscription. They'll keep access until ${periodEnd ? periodEnd.toLocaleDateString('en-US') : 'the end of the current billing period'}. Remember to remove/deactivate them in QuickBooks to avoid unnecessary charges.`,
          link: '/admin/users',
          data: { agentId: user._id }
        }, true).catch(() => {});
      }
    } catch (notifErr) {
      console.error('Failed to notify admins of agent subscription cancellation:', notifErr);
    }

    sendResponse(res, 200, {
      message: 'Your subscription has been canceled. You will not be billed for the next cycle and will keep access until the end of the current billing period.',
      cancelAtPeriodEnd: true,
      currentPeriodEnd: periodEnd
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/payments/reactivate-subscription
// @desc    Agent self-service: undo a scheduled cancellation (re-enable renewal)
//          before the current period ends.
// @access  Private
router.post('/reactivate-subscription', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user.stripeSubscriptionId) {
      return sendResponse(res, 404, { message: 'No subscription found.' });
    }

    const subscription = await Subscription.findOne({
      stripeSubscriptionId: user.stripeSubscriptionId
    });

    if (subscription && subscription.endedAt) {
      return sendResponse(res, 400, {
        message: 'Your subscription has already ended and cannot be reactivated. Please start a new subscription.'
      });
    }

    const stripeSubscription = await reactivateSubscription(user.stripeSubscriptionId);

    if (subscription) {
      subscription.cancelAtPeriodEnd = false;
      subscription.canceledAt = null;
      subscription.status = stripeSubscription.status || subscription.status;
      await subscription.save();
    }

    Notification.createNotification({
      userId: user._id,
      type: 'subscription_updated',
      title: 'Subscription Reactivated',
      message: 'Your subscription will continue to renew as normal.',
      link: '/transactions'
    }, false).catch(() => {});

    sendResponse(res, 200, {
      message: 'Your subscription has been reactivated and will continue to renew.',
      cancelAtPeriodEnd: false
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/payments/billing-portal
// @desc    Create a Stripe Billing Portal session so the user can update their
//          saved card, view invoices/receipts, and manage their subscription.
// @access  Private
router.post('/billing-portal', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user.billingExempt) {
      return sendResponse(res, 400, { message: 'Your account is billing exempt — there is nothing to manage.' });
    }
    if (!user.stripeCustomerId) {
      return sendResponse(res, 404, { message: 'No billing profile found for your account yet.' });
    }

    const returnUrl = `${process.env.APP_URL || 'http://localhost:4200'}/transactions`;

    let session;
    try {
      session = await createBillingPortalSession(user.stripeCustomerId, returnUrl);
    } catch (stripeErr) {
      // Most common cause: the Billing Portal hasn't been activated in the
      // Stripe dashboard. Surface a clear, actionable message.
      console.error('Billing portal session error:', stripeErr.message);
      return sendResponse(res, 502, {
        message: 'Unable to open the billing portal right now. Please contact support if this continues.'
      });
    }

    sendResponse(res, 200, { url: session.url });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/payments/webhook
// @desc    Handle Stripe webhooks
// @access  Public (Stripe only — verified via signature)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  if (!sig) {
    return res.status(400).send('Missing stripe-signature header');
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('STRIPE_WEBHOOK_SECRET is not configured');
    return res.status(500).send('Webhook secret not configured');
  }

  try {
    const event = constructWebhookEvent(req.body, sig);

    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;

      case 'invoice.paid':
        await handleInvoicePaid(event.data.object);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }
});

// Webhook handlers
async function handlePaymentIntentSucceeded(paymentIntent) {
  const payment = await Payment.findOne({ stripePaymentIntentId: paymentIntent.id });
  
  if (payment) {
    payment.status = 'succeeded';
    payment.paidAt = new Date();
    // Capture the Stripe receipt so it can be shown on the transactions page.
    if (paymentIntent.latest_charge) {
      payment.stripeChargeId = paymentIntent.latest_charge;
      try {
        const charge = await retrieveCharge(paymentIntent.latest_charge);
        if (charge?.receipt_url) payment.receiptUrl = charge.receipt_url;
      } catch (e) { /* receipt is best-effort; lazy resolver covers it later */ }
    }
    await payment.save();

    const isSetupFeePayment = payment.type === 'setup_fee' || payment.type === 'one-time';

    const user = await User.findById(payment.user);
    if (user) {
      if (isSetupFeePayment) {
        user.oneTimePaymentCompleted = true;
        user.oneTimePaymentDate = new Date();
        user.lastPaymentDate = new Date();
        await user.save();
      }
      Notification.createNotification({
        userId: payment.user,
        type: 'payment_completed',
        title: 'Payment Successful',
        message: `Your payment of $${(payment.amount / 100).toFixed(2)} was processed successfully.`,
        link: '/transactions'
      }, false).catch(() => {});
    }
  }
}

async function handlePaymentIntentFailed(paymentIntent) {
  const payment = await Payment.findOne({ stripePaymentIntentId: paymentIntent.id });
  
  if (payment) {
    payment.status = 'failed';
    await payment.save();

    Notification.createNotification({
      userId: payment.user,
      type: 'payment_failed',
      title: 'Payment Failed',
      message: `A payment of $${(payment.amount / 100).toFixed(2)} could not be processed. Please update your payment method.`,
      link: '/transactions'
    }, false).catch(() => {});
  }
}

async function handleSubscriptionUpdate(subscription) {
  const sub = await Subscription.findOne({ stripeSubscriptionId: subscription.id });
  
  if (sub) {
    sub.status = subscription.status;
    sub.currentPeriodStart = new Date(subscription.current_period_start * 1000);
    sub.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
    sub.cancelAtPeriodEnd = subscription.cancel_at_period_end;
    await sub.save();

    // Update user
    const user = await User.findById(sub.user);
    if (user) {
      user.subscriptionStatus = subscription.status;
      user.nextBillingDate = new Date(subscription.current_period_end * 1000);
      
      // Enable access if subscription is active
      if (subscription.status === 'active' && user.oneTimePaymentCompleted) {
        user.paymentAccessEnabled = true;
      } else if (['past_due', 'canceled', 'unpaid'].includes(subscription.status)) {
        user.paymentAccessEnabled = false;
      }
      
      await user.save();
    }
  }
}

async function handleSubscriptionDeleted(subscription) {
  const sub = await Subscription.findOne({ stripeSubscriptionId: subscription.id });
  
  if (sub) {
    sub.status = 'canceled';
    sub.endedAt = new Date();
    await sub.save();

    const user = await User.findById(sub.user);
    if (user) {
      user.subscriptionStatus = 'canceled';
      user.paymentAccessEnabled = false;
      await user.save();

      Notification.createNotification({
        userId: sub.user,
        type: 'subscription_canceled',
        title: 'Subscription Canceled',
        message: 'Your subscription has been canceled. Your access will end at the current billing period.',
        link: '/transactions'
      }, false).catch(() => {});
    }
  }
}

async function handleInvoicePaid(invoice) {
  if (invoice.subscription) {
    const sub = await Subscription.findOne({ stripeSubscriptionId: invoice.subscription });

    // Stripe may deliver invoice.paid before our own checkout.session.completed
    // handler has finished creating the local Subscription record. Rather than
    // silently dropping the event (leaving lastPaymentDate/notification unset
    // until the user happens to load their transactions page and the lazy
    // reconciler in user.routes.js backfills the Payment row), fall back to
    // resolving the user directly by Stripe customer id.
    let userId = sub?.user;
    if (!userId && invoice.customer) {
      const customerUser = await User.findOne({ stripeCustomerId: invoice.customer }).select('_id');
      userId = customerUser?._id;
    }

    if (userId) {
      // Stripe may deliver invoice.paid more than once — upsert by invoice id so
      // we never create duplicate transaction rows for the same payment.
      const receiptUrl = invoice.hosted_invoice_url || '';
      await Payment.findOneAndUpdate(
        { stripeInvoiceId: invoice.id },
        {
          $set: {
            user: userId,
            type: 'subscription',
            amount: invoice.amount_paid,
            currency: invoice.currency,
            stripeInvoiceId: invoice.id,
            stripeChargeId: invoice.charge || undefined,
            stripeCustomerId: invoice.customer || undefined,
            receiptUrl,
            status: 'succeeded',
            description: 'Monthly subscription payment',
            paidAt: new Date()
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      // Update user last payment date
      const user = await User.findById(userId);
      if (user) {
        user.lastPaymentDate = new Date();
        user.paymentAccessEnabled = true;
        await user.save();

        Notification.createNotification({
          userId,
          type: 'payment_completed',
          title: 'Subscription Payment Received',
          message: `Your monthly subscription payment of $${(invoice.amount_paid / 100).toFixed(2)} was processed successfully.`,
          link: '/transactions'
        }, false).catch(() => {});
      }
    }
  }
}

async function handleInvoicePaymentFailed(invoice) {
  if (invoice.subscription) {
    const sub = await Subscription.findOne({ stripeSubscriptionId: invoice.subscription });
    
    if (sub) {
      // Update user access
      const user = await User.findById(sub.user);
      if (user) {
        user.paymentAccessEnabled = false;
        await user.save();

        Notification.createNotification({
          userId: sub.user,
          type: 'payment_failed',
          title: 'Subscription Payment Failed',
          message: 'Your subscription payment failed. Please update your payment method to maintain access.',
          link: '/transactions'
        }, false).catch(() => {});
      }
    }
  }
}

// ============================================================================
// Cleanup: Expire stale pending payments (older than 7 days)
// Called on server startup and can be triggered via admin endpoint
// ============================================================================
async function expireStalePendingPayments() {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const result = await Payment.updateMany(
      { status: 'pending', createdAt: { $lt: sevenDaysAgo }, deletedAt: null },
      { $set: { status: 'expired' } }
    );
    if (result.modifiedCount > 0) {
      console.log(`[Billing Cleanup] Expired ${result.modifiedCount} stale pending payment(s)`);
    }
    return result.modifiedCount;
  } catch (err) {
    console.error('[Billing Cleanup] Error expiring stale payments:', err.message);
    return 0;
  }
}

// Run cleanup on module load (server start)
setTimeout(() => expireStalePendingPayments(), 5000);

module.exports = router;
module.exports.expireStalePendingPayments = expireStalePendingPayments;
