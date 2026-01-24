const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Payment = require('../models/Payment');
const Subscription = require('../models/Subscription');
const { protect, authorize } = require('../middleware/auth.middleware');
const { sendResponse, errorResponse } = require('../utils/helpers');
const {
  createCustomer,
  createPaymentIntent,
  createSubscription,
  cancelSubscription,
  retrieveSubscription,
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
// @desc    Create subscription for $25/month
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
      amount: parseInt(process.env.STRIPE_MONTHLY_SUBSCRIPTION_PRICE) || 2500,
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

    // Fetch subscription from Subscription model (source of truth)
    let subscriptionDetails = null;
    let subscriptionStatus = user.subscriptionStatus || 'none';
    let nextBillingDate = user.nextBillingDate;
    let subscriptionStartDate = user.subscriptionStartDate;
    
    if (user.stripeSubscriptionId) {
      const subscription = await Subscription.findOne({ 
        stripeSubscriptionId: user.stripeSubscriptionId 
      });
      
      if (subscription) {
        subscriptionDetails = subscription;
        // Use Subscription model as source of truth, fall back to User fields
        subscriptionStatus = subscription.status || subscriptionStatus;
        nextBillingDate = subscription.currentPeriodEnd || nextBillingDate;
        subscriptionStartDate = subscription.currentPeriodStart || subscriptionStartDate;
      }
    }

    sendResponse(res, 200, {
      oneTimePaymentCompleted: user.oneTimePaymentCompleted,
      oneTimePaymentAmount: user.oneTimePaymentAmount,
      oneTimePaymentDate: user.oneTimePaymentDate,
      subscriptionStatus: subscriptionStatus,
      subscriptionStartDate: subscriptionStartDate,
      nextBillingDate: nextBillingDate,
      lastPaymentDate: user.lastPaymentDate,
      paymentAccessEnabled: user.paymentAccessEnabled,
      subscription: subscriptionDetails
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/payments/webhook
// @desc    Handle Stripe webhooks
// @access  Public (Stripe only)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

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
    await payment.save();

    const isSetupFeePayment = payment.type === 'setup_fee' || payment.type === 'one-time';

    if (isSetupFeePayment) {
      const user = await User.findById(payment.user);
      if (user) {
        user.oneTimePaymentCompleted = true;
        user.oneTimePaymentDate = new Date();
        user.lastPaymentDate = new Date();
        await user.save();
      }
    }
  }
}

async function handlePaymentIntentFailed(paymentIntent) {
  const payment = await Payment.findOne({ stripePaymentIntentId: paymentIntent.id });
  
  if (payment) {
    payment.status = 'failed';
    await payment.save();
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

    // Update user
    const user = await User.findById(sub.user);
    if (user) {
      user.subscriptionStatus = 'canceled';
      user.paymentAccessEnabled = false;
      await user.save();
    }
  }
}

async function handleInvoicePaid(invoice) {
  if (invoice.subscription) {
    const sub = await Subscription.findOne({ stripeSubscriptionId: invoice.subscription });
    
    if (sub) {
      // Create payment record for subscription payment
      await Payment.create({
        user: sub.user,
        type: 'subscription',
        amount: invoice.amount_paid,
        currency: invoice.currency,
        stripeInvoiceId: invoice.id,
        status: 'succeeded',
        description: 'Monthly subscription payment',
        paidAt: new Date()
      });

      // Update user last payment date
      const user = await User.findById(sub.user);
      if (user) {
        user.lastPaymentDate = new Date();
        user.paymentAccessEnabled = true;
        await user.save();
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
      }
    }
  }
}

module.exports = router;
