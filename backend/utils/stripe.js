const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

// Initialize Stripe with error handling for missing key
let stripe;
if (!stripeSecretKey || stripeSecretKey === 'sk_test_your_stripe_secret_key') {
  console.warn('⚠️  Stripe API key not configured. Payment features will be disabled.');
  console.warn('   Please add STRIPE_SECRET_KEY to your .env file to enable payments.');
  stripe = null;
} else {
  stripe = require('stripe')(stripeSecretKey);
}

const ensureStripeConfigured = () => {
  if (!stripe) {
    throw new Error('Stripe is not configured. Please add STRIPE_SECRET_KEY to your .env file.');
  }
};

const createCustomer = async (email, name, metadata = {}) => {
  ensureStripeConfigured();
  try {
    const customer = await stripe.customers.create({
      email,
      name,
      metadata
    });
    return customer;
  } catch (error) {
    console.error('Stripe create customer error:', error);
    throw error;
  }
};

const createPaymentIntent = async (amount, currency = 'usd', customerId, metadata = {}) => {
  ensureStripeConfigured();
  try {
    const paymentIntentData = {
      amount,
      currency,
      metadata,
      automatic_payment_methods: {
        enabled: true
      }
    };
    
    // Only include customer if provided (not needed for registration flow)
    if (customerId) {
      paymentIntentData.customer = customerId;
    }
    
    const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);
    return paymentIntent;
  } catch (error) {
    console.error('Stripe create payment intent error:', error);
    throw error;
  }
};

const createSubscription = async (customerId, priceId, metadata = {}) => {
  ensureStripeConfigured();
  try {
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
      metadata
    });
    return subscription;
  } catch (error) {
    console.error('Stripe create subscription error:', error);
    throw error;
  }
};

const cancelSubscription = async (subscriptionId) => {
  ensureStripeConfigured();
  try {
    const subscription = await stripe.subscriptions.cancel(subscriptionId);
    return subscription;
  } catch (error) {
    console.error('Stripe cancel subscription error:', error);
    throw error;
  }
};

// Schedule cancellation at the end of the current billing period.
// The subscription stays active (access retained) until period end, and Stripe
// does not bill the following cycle.
const cancelSubscriptionAtPeriodEnd = async (subscriptionId) => {
  ensureStripeConfigured();
  try {
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true
    });
    return subscription;
  } catch (error) {
    console.error('Stripe schedule cancellation error:', error);
    throw error;
  }
};

// Undo a scheduled cancellation (re-enable auto-renew) while still active.
const reactivateSubscription = async (subscriptionId) => {
  ensureStripeConfigured();
  try {
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false
    });
    return subscription;
  } catch (error) {
    console.error('Stripe reactivate subscription error:', error);
    throw error;
  }
};

const updateSubscription = async (subscriptionId, params) => {
  ensureStripeConfigured();
  try {
    const subscription = await stripe.subscriptions.update(subscriptionId, params);
    return subscription;
  } catch (error) {
    console.error('Stripe update subscription error:', error);
    throw error;
  }
};

const retrieveSubscription = async (subscriptionId) => {
  ensureStripeConfigured();
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    return subscription;
  } catch (error) {
    console.error('Stripe retrieve subscription error:', error);
    throw error;
  }
};

const retrievePaymentIntent = async (paymentIntentId) => {
  ensureStripeConfigured();
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    return paymentIntent;
  } catch (error) {
    console.error('Stripe retrieve payment intent error:', error);
    throw error;
  }
};

const retrieveInvoice = async (invoiceId) => {
  ensureStripeConfigured();
  try {
    const invoice = await stripe.invoices.retrieve(invoiceId);
    return invoice;
  } catch (error) {
    console.error('Stripe retrieve invoice error:', error);
    throw error;
  }
};

// Create a Stripe Customer Billing Portal session so the user can update their
// saved card, view invoices/receipts, and manage the subscription on a
// Stripe-hosted page. Requires the portal to be enabled in the Stripe dashboard.
const createBillingPortalSession = async (customerId, returnUrl) => {
  ensureStripeConfigured();
  try {
    return await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl
    });
  } catch (error) {
    console.error('Stripe billing portal error:', error);
    throw error;
  }
};

const retrieveCharge = async (chargeId) => {
  ensureStripeConfigured();
  try {
    return await stripe.charges.retrieve(chargeId);
  } catch (error) {
    console.error('Stripe retrieve charge error:', error);
    throw error;
  }
};

// List a customer's invoices (used to reconcile monthly subscription payments
// into our records so every renewal shows a transaction + receipt, even if a
// webhook was missed). Returns [] if Stripe isn't configured — never throws.
const listInvoices = async (customerId, limit = 100) => {
  if (!stripe || !customerId) return [];
  try {
    const result = await stripe.invoices.list({ customer: customerId, limit });
    return result?.data || [];
  } catch (error) {
    console.error('Stripe list invoices error:', error.message);
    return [];
  }
};

// Resolve a user-facing Stripe receipt URL for a payment from whatever
// identifiers we have. Prefers the charge's hosted receipt_url; falls back to
// the invoice's hosted URL (used by subscription payments where the payment
// intent lives on the invoice). Best-effort: returns null if nothing resolves
// or Stripe isn't configured, and never throws.
const resolveStripeReceiptUrl = async ({ paymentIntentId, invoiceId, chargeId, sessionId } = {}) => {
  if (!stripe) return null;

  // 1. Direct charge
  if (chargeId) {
    try {
      const charge = await stripe.charges.retrieve(chargeId);
      if (charge?.receipt_url) return charge.receipt_url;
    } catch (e) { /* fall through */ }
  }

  // 2. Payment intent -> latest charge -> receipt
  if (paymentIntentId) {
    try {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (pi?.latest_charge) {
        const charge = await stripe.charges.retrieve(pi.latest_charge);
        if (charge?.receipt_url) return charge.receipt_url;
      }
    } catch (e) { /* fall through */ }
  }

  // 3. Invoice -> hosted invoice URL (or its charge's receipt)
  if (invoiceId) {
    try {
      const invoice = await stripe.invoices.retrieve(invoiceId);
      if (invoice?.hosted_invoice_url) return invoice.hosted_invoice_url;
      if (invoice?.charge) {
        const charge = await stripe.charges.retrieve(invoice.charge);
        if (charge?.receipt_url) return charge.receipt_url;
      }
    } catch (e) { /* fall through */ }
  }

  // 4. Checkout session (legacy APA payments only stored the session id) ->
  //    resolve via its invoice / payment intent.
  if (sessionId) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session?.invoice || session?.payment_intent) {
        return await resolveStripeReceiptUrl({
          invoiceId: session.invoice,
          paymentIntentId: session.payment_intent
        });
      }
    } catch (e) { /* fall through */ }
  }

  return null;
};

const constructWebhookEvent = (payload, signature) => {
  ensureStripeConfigured();
  try {
    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    return event;
  } catch (error) {
    console.error('Stripe webhook signature verification failed:', error);
    throw error;
  }
};

module.exports = {
  stripe,
  createCustomer,
  createPaymentIntent,
  createSubscription,
  cancelSubscription,
  cancelSubscriptionAtPeriodEnd,
  reactivateSubscription,
  updateSubscription,
  retrieveSubscription,
  retrievePaymentIntent,
  retrieveInvoice,
  retrieveCharge,
  listInvoices,
  resolveStripeReceiptUrl,
  createBillingPortalSession,
  constructWebhookEvent
};
