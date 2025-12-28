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
  updateSubscription,
  retrieveSubscription,
  retrievePaymentIntent,
  retrieveInvoice,
  constructWebhookEvent
};
