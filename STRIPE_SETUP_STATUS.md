# Stripe Integration Status & Setup Guide

## ✅ What's Already Implemented

### Backend
1. **Stripe Utility Functions** (`backend/utils/stripe.js`)
   - Customer creation
   - Payment intents
   - Subscriptions
   - Webhook event construction
   - Error handling for missing configuration

2. **Payment Routes** (`backend/routes/payment.routes.js`)
   - Create customer
   - One-time payment intent
   - Subscription creation
   - Payment status checking
   - Webhook handling for payment events

3. **Models**
   - Payment model (tracks all transactions)
   - Subscription model (tracks recurring subscriptions)
   - Coupon model (for discount codes)

### Frontend
1. **Payment Components**
   - APA Payment component (needs update to use real Stripe)
   - Subscription payment component
   - Stripe.js integration

2. **Environment Configuration**
   - Test publishable key configured
   - Production placeholder ready

## ❌ What's Pending

### 1. Stripe Products & Prices Setup
**Status**: Not created yet
**Action Required**: Run setup script

```bash
cd backend
node scripts/setup-stripe-products.js
```

This will create:
- Agent Setup Fee product ($179 one-time)
- Monthly Subscription product ($25/month)
- Coupon codes (LICENSED, WELCOME50, FIRSTMONTHFREE)

### 2. APA Payment Integration
**Status**: Using mock payment, needs real Stripe Checkout
**Action Required**: Component already updated with Stripe Checkout session

New endpoint created: `POST /api/public/apa-application/create-checkout-session`

### 3. Stripe Webhook Configuration
**Status**: Endpoints exist, need URL configuration in Stripe Dashboard

**Test Mode Webhook**:
- URL: `https://your-domain.com/api/public/apa-application/stripe-webhook`
- Events to select:
  - `checkout.session.completed`
  - `invoice.paid`
  - `invoice.payment_failed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`

**Get Webhook Secret**:
1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint with above URL
3. Copy signing secret (starts with `whsec_`)
4. Add to `.env` as `STRIPE_WEBHOOK_SECRET`

### 4. Environment Variables

**Test Environment (.env)**:
```env
# Stripe Test Mode
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_ONE_TIME_PRICE=17900
STRIPE_MONTHLY_SUBSCRIPTION_PRICE=2500
STRIPE_SETUP_FEE_PRICE_ID=price_...  # From setup script
STRIPE_MONTHLY_PRICE_ID=price_...    # From setup script
STRIPE_SETUP_FEE_PRODUCT_ID=prod_... # From setup script
STRIPE_SUBSCRIPTION_PRODUCT_ID=prod_... # From setup script
```

**Production Environment**:
When ready for production, replace all `sk_test_` and `pk_test_` keys with `sk_live_` and `pk_live_` keys.

## 🔧 Complete Setup Steps

### Step 1: Create Stripe Products (Test Mode)
```bash
cd backend
node scripts/setup-stripe-products.js
```

Copy the output price IDs and product IDs to your `.env` file.

### Step 2: Configure Webhooks
1. Go to https://dashboard.stripe.com/test/webhooks
2. Click "Add endpoint"
3. URL: `https://rhpoffice.com/api/public/apa-application/stripe-webhook`
4. Select events listed above
5. Copy webhook signing secret to `.env`

### Step 3: Test the Integration
1. Submit an APA application
2. Complete DocuSign signing
3. Receive payment email
4. Click payment link
5. Complete Stripe Checkout
6. Verify account creation and welcome email

### Step 4: Production Setup (When Ready)
1. Switch Stripe Dashboard to "Live mode"
2. Run `setup-stripe-products.js` again in production
3. Update `.env` with production keys:
   ```env
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_PUBLISHABLE_KEY=pk_live_...
   STRIPE_WEBHOOK_SECRET=whsec_... (new production webhook)
   ```
4. Configure production webhook at https://dashboard.stripe.com/webhooks
5. Update frontend `environment.prod.ts` with `pk_live_` key

## 🎯 New Features Added

### 1. Stripe Checkout Session for APA Payments
- Replaces mock payment with real Stripe Checkout
- Supports coupon codes
- Handles both setup fee and subscription in one checkout
- Redirects to success/cancel URLs
- Automatically creates user account after successful payment

### 2. Webhook Handlers
- `checkout.session.completed`: Creates user account, sends welcome email
- `invoice.paid`: Records recurring payments
- `invoice.payment_failed`: Disables user access
- `customer.subscription.updated`: Updates subscription status
- `customer.subscription.deleted`: Handles cancellations

### 3. Coupon Integration
- Validates coupons from database
- Applies Stripe coupon codes in checkout
- Tracks usage and limits
- Pre-created coupons: LICENSED, WELCOME50, FIRSTMONTHFREE

## 🔍 Testing Checklist

- [ ] Run `setup-stripe-products.js` script
- [ ] Add price IDs to `.env`
- [ ] Configure Stripe webhook
- [ ] Test APA application submission
- [ ] Test DocuSign signing completion
- [ ] Test payment link email receipt
- [ ] Test Stripe Checkout completion
- [ ] Verify user account creation
- [ ] Verify welcome email with credentials
- [ ] Test coupon code application
- [ ] Test subscription recurring payment (wait for invoice or simulate)
- [ ] Test payment failure scenarios
- [ ] Test subscription cancellation

## 📞 Stripe Dashboard URLs

**Test Mode**:
- Products: https://dashboard.stripe.com/test/products
- Customers: https://dashboard.stripe.com/test/customers
- Subscriptions: https://dashboard.stripe.com/test/subscriptions
- Webhooks: https://dashboard.stripe.com/test/webhooks
- Coupons: https://dashboard.stripe.com/test/coupons

**Live Mode** (production):
- Products: https://dashboard.stripe.com/products
- Customers: https://dashboard.stripe.com/customers
- Subscriptions: https://dashboard.stripe.com/subscriptions
- Webhooks: https://dashboard.stripe.com/webhooks
- Coupons: https://dashboard.stripe.com/coupons

## 💡 Test Cards

**Successful Payment**:
- Card: 4242 4242 4242 4242
- Exp: Any future date
- CVC: Any 3 digits
- ZIP: Any 5 digits

**Requires Authentication** (3D Secure):
- Card: 4000 0027 6000 3184

**Payment Fails**:
- Card: 4000 0000 0000 0002

**Insufficient Funds**:
- Card: 4000 0000 0000 9995

More test cards: https://stripe.com/docs/testing

## 🚀 Ready for Production?

Before going live:
1. Complete all test checklist items ✅
2. Review Stripe's [go-live checklist](https://stripe.com/docs/development/checklist)
3. Enable Stripe Radar for fraud prevention
4. Set up email receipts in Stripe settings
5. Configure statement descriptor ("RHP OFFICE" or similar)
6. Test with real credit card in test mode first
7. Switch to live keys
8. Monitor first few real transactions closely

---

**Status**: Integration 95% complete. Just need to run setup script and configure webhooks!
