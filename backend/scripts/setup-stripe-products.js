require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

/**
 * Script to create Stripe products and prices
 * Run this once for test environment and once for production
 * Usage: node scripts/setup-stripe-products.js
 */

async function setupStripeProducts() {
  console.log('🚀 Setting up Stripe products and prices...\n');
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Using Stripe key: ${process.env.STRIPE_SECRET_KEY?.substring(0, 20)}...\n`);

  try {
    // 1. Create APA Setup Fee Product
    console.log('📦 Creating APA Setup Fee product...');
    const setupFeeProduct = await stripe.products.create({
      name: 'Agent Setup Fee',
      description: 'One-time setup fee for new agents',
      metadata: {
        type: 'setup_fee',
        environment: process.env.NODE_ENV || 'development'
      }
    });
    console.log('✅ Setup Fee Product created:', setupFeeProduct.id);

    // Create price for setup fee
    const setupFeePrice = await stripe.prices.create({
      product: setupFeeProduct.id,
      unit_amount: parseInt(process.env.STRIPE_ONE_TIME_PRICE) || 17900, // $179
      currency: 'usd',
      metadata: {
        type: 'setup_fee'
      }
    });
    console.log('✅ Setup Fee Price created:', setupFeePrice.id);
    console.log(`   Amount: $${setupFeePrice.unit_amount / 100}\n`);

    // 2. Create Monthly Subscription Product
    console.log('📦 Creating Monthly Subscription product...');
    const subscriptionProduct = await stripe.products.create({
      name: 'Agent Monthly Subscription',
      description: 'Monthly subscription for active agents',
      metadata: {
        type: 'subscription',
        environment: process.env.NODE_ENV || 'development'
      }
    });
    console.log('✅ Subscription Product created:', subscriptionProduct.id);

    // Create price for monthly subscription
    const subscriptionPrice = await stripe.prices.create({
      product: subscriptionProduct.id,
      unit_amount: parseInt(process.env.STRIPE_MONTHLY_SUBSCRIPTION_PRICE) || 2000, // $20
      currency: 'usd',
      recurring: {
        interval: 'month',
        interval_count: 1
      },
      metadata: {
        type: 'monthly_subscription'
      }
    });
    console.log('✅ Subscription Price created:', subscriptionPrice.id);
    console.log(`   Amount: $${subscriptionPrice.unit_amount / 100}/month\n`);

    // 3. Create Coupon Codes
    console.log('🎟️  Creating coupon codes...');
    
    // Licensed agent discount (waive setup fee)
    const licensedCoupon = await stripe.coupons.create({
      id: 'LICENSED',
      percent_off: 100,
      duration: 'once',
      name: 'Licensed Agent - Waive Setup Fee',
      applies_to: {
        products: [setupFeeProduct.id]
      },
      metadata: {
        description: 'For agents with existing insurance license'
      }
    });
    console.log('✅ Coupon created: LICENSED (100% off setup fee)');

    // 50% off setup fee
    const welcome50 = await stripe.coupons.create({
      id: 'WELCOME50',
      percent_off: 50,
      duration: 'once',
      name: 'Welcome Discount - 50% Off Setup Fee',
      applies_to: {
        products: [setupFeeProduct.id]
      }
    });
    console.log('✅ Coupon created: WELCOME50 (50% off setup fee)');

    // First month free
    const firstMonthFree = await stripe.coupons.create({
      id: 'FIRSTMONTHFREE',
      percent_off: 100,
      duration: 'once',
      name: 'First Month Free',
      applies_to: {
        products: [subscriptionProduct.id]
      }
    });
    console.log('✅ Coupon created: FIRSTMONTHFREE (100% off first month)\n');

    // Print summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✨ Stripe Setup Complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n📝 Add these to your .env file:\n');
    console.log(`STRIPE_SETUP_FEE_PRICE_ID=${setupFeePrice.id}`);
    console.log(`STRIPE_MONTHLY_PRICE_ID=${subscriptionPrice.id}`);
    console.log(`STRIPE_SETUP_FEE_PRODUCT_ID=${setupFeeProduct.id}`);
    console.log(`STRIPE_SUBSCRIPTION_PRODUCT_ID=${subscriptionProduct.id}`);
    console.log('\n💡 Available Coupon Codes:');
    console.log('   - LICENSED (100% off setup fee)');
    console.log('   - WELCOME50 (50% off setup fee)');
    console.log('   - FIRSTMONTHFREE (100% off first month)');
    console.log('\n');

  } catch (error) {
    if (error.code === 'resource_already_exists') {
      console.error('❌ Error: Resource already exists');
      console.log('\n💡 If you need to recreate products, delete them in Stripe Dashboard first:');
      console.log('   https://dashboard.stripe.com/products');
    } else {
      console.error('❌ Error setting up Stripe:', error.message);
    }
    process.exit(1);
  }
}

setupStripeProducts();
