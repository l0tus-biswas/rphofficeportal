# Stripe Payment Integration - Complete Setup Guide

## Overview
The payment system has been fully integrated with Stripe for handling:
- **One-time registration fee**: $179 (required before account creation)
- **Monthly subscription**: $25/month (required for platform access)

## Backend Implementation ✅

### 1. Models Created
- `Payment.js` - Tracks all payment transactions
- `Subscription.js` - Manages user subscriptions
- Updated `User.js` with payment tracking fields

### 2. Routes Implemented

#### Payment Routes (`/api/payments`)
- `POST /one-time-intent` - Create $179 payment intent
- `POST /subscription-intent` - Create $25/month subscription
- `GET /status` - Get user's payment status
- `POST /webhook` - Handle Stripe webhooks (for production)

#### Admin Payment Routes (`/api/admin`)
- `GET /payments` - View all payments with filters
- `GET /subscriptions` - View all subscriptions
- `POST /payments/:userId/enable-access` - Manually enable access
- `POST /payments/:userId/disable-access` - Manually disable access
- `POST /subscriptions/:userId/cancel` - Cancel subscription
- `GET /payment-settings` - Get payment configuration

#### User Routes (`/api/user`)
- `GET /payments` - User's transaction history
- `GET /subscription` - User's subscription details

### 3. Middleware
- `requirePayment` - Checks both one-time payment AND active subscription
- `requireOneTimePayment` - Checks only one-time payment

## Frontend Implementation ✅

### Components Created
1. **OneTimePaymentComponent** - Handles $179 registration payment
2. **SubscriptionPaymentComponent** - Handles $25/month subscription
3. **PaymentSuccessComponent** - Success page after payment
4. **UserTransactionsComponent** - User's payment history
5. **AdminPaymentManagementComponent** - Admin payment dashboard

### Services
- `PaymentService` - Complete API integration for all payment operations

## Setup Instructions

### 1. Install Dependencies

```bash
# Backend (already done)
cd backend
npm install stripe

# Frontend (already done)
cd frontend
npm install @stripe/stripe-js
```

### 2. Stripe Account Setup

1. **Create Stripe Account**: https://dashboard.stripe.com/register
2. **Get API Keys**:
   - Go to Developers → API keys
   - Copy your **Publishable key** (starts with `pk_`)
   - Copy your **Secret key** (starts with `sk_`)

3. **Create Products & Prices**:
   
   **A. Create Monthly Subscription Product:**
   - Go to Products → Add product
   - Name: "Monthly Subscription"
   - Price: $25.00
   - Billing: Recurring, Monthly
   - Copy the **Price ID** (starts with `price_`)

### 3. Configure Environment Variables

**Backend (.env)**:
```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_your_secret_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
STRIPE_ONE_TIME_PRICE=17900
STRIPE_MONTHLY_SUBSCRIPTION_PRICE=2500
STRIPE_MONTHLY_PRICE_ID=price_your_monthly_price_id_here
```

**Frontend (environment.ts)**:
```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:5000/api',
  appUrl: 'http://localhost:4200',
  stripePublishableKey: 'pk_test_your_publishable_key_here'
};
```

### 4. Stripe Webhook Setup (Production Only)

1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://yourdomain.com/api/payments/webhook`
3. Select events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
4. Copy the webhook signing secret and add to `.env`

## Payment Flow

### For New Users (Apply Process)

1. **User applies** → `/apply?ref=AGT123`
2. **Upload documents** → `/onboarding-upload`
3. **Complete one-time payment** → `/one-time-payment` ($179)
4. **Setup subscription** → `/subscription-payment` ($25/month)
5. **Account created** → User can now login and access platform

### Access Control

- Users MUST complete one-time payment before accessing onboarding
- Users MUST have active subscription to access dashboard/features
- If subscription lapses (unpaid), access is automatically disabled
- Admin can manually enable/disable access via payment management

## Admin Features

Navigate to: `/admin/payments`

### Tabs:
1. **Payments** - View all transactions, filter by type/status
2. **Subscriptions** - Manage user subscriptions
3. **Settings** - View current pricing configuration

### Actions:
- ✅ Enable payment access (bypass subscription check)
- ❌ Disable payment access (revoke access)
- 🗑️ Cancel subscription (ends at period end)

## User Features

Navigate to: `/transactions`

Users can:
- View complete payment history
- See subscription status
- Check next billing date
- View payment access status

## Testing

### Test Cards (Stripe Test Mode)

**Successful Payment:**
- Card: `4242 4242 4242 4242`
- Expiry: Any future date
- CVC: Any 3 digits
- ZIP: Any 5 digits

**Failed Payment:**
- Card: `4000 0000 0000 0002`

**Requires 3D Secure:**
- Card: `4000 0027 6000 3184`

## API Endpoints Reference

### Payment Endpoints
```
POST /api/payments/one-time-intent
POST /api/payments/subscription-intent
GET  /api/payments/status
POST /api/payments/webhook
```

### Admin Endpoints
```
GET  /api/admin/payments
GET  /api/admin/subscriptions
POST /api/admin/payments/:userId/enable-access
POST /api/admin/payments/:userId/disable-access
POST /api/admin/subscriptions/:userId/cancel
GET  /api/admin/payment-settings
```

### User Endpoints
```
GET /api/user/payments
GET /api/user/subscription
```

## Database Schema

### User Model (New Fields)
- `oneTimePaymentCompleted: Boolean`
- `oneTimePaymentAmount: Number`
- `oneTimePaymentDate: Date`
- `stripeCustomerId: String`
- `stripeSubscriptionId: String`
- `subscriptionStatus: String`
- `subscriptionStartDate: Date`
- `nextBillingDate: Date`
- `lastPaymentDate: Date`
- `paymentAccessEnabled: Boolean`

### Payment Model
- `user: ObjectId`
- `type: 'one-time' | 'subscription'`
- `amount: Number`
- `currency: String`
- `stripePaymentIntentId: String`
- `status: String`
- `paidAt: Date`

### Subscription Model
- `user: ObjectId`
- `stripeSubscriptionId: String`
- `stripeCustomerId: String`
- `status: String`
- `currentPeriodStart: Date`
- `currentPeriodEnd: Date`
- `amount: Number`

## Troubleshooting

### Payment not completing?
- Check browser console for Stripe errors
- Verify Stripe keys are correct
- Ensure test mode matches (test keys with test cards)

### Webhook not working?
- Use `stripe listen --forward-to localhost:5000/api/payments/webhook` for local testing
- Check webhook signature secret is correct
- Verify endpoint is publicly accessible (production)

### Access disabled after payment?
- Check subscription status in database
- Verify webhook events are being received
- Admin can manually enable access

## Next Steps

1. ✅ Update `.env` with actual Stripe keys
2. ✅ Create Stripe products and get price IDs
3. ✅ Update frontend environment files
4. ⏳ Test payment flow end-to-end
5. ⏳ Setup webhook endpoint for production
6. ⏳ Integrate payment checks in auth guard (optional)

## Support

For Stripe documentation: https://stripe.com/docs
For API reference: https://stripe.com/docs/api
