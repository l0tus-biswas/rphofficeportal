# Subscription Data Architecture - ROOT LEVEL DESIGN

## Problem Statement
Previously, subscription data was duplicated in two places (User model and Subscription model) without proper synchronization, leading to inconsistencies and "None" status displays.

## Root-Level Solution

### 1. **Single Source of Truth: Subscription Model**
The `Subscription` model is the **authoritative source** for all subscription data:
- `status` - Current subscription status (active, past_due, canceled, etc.)
- `currentPeriodStart` - Start date of current billing period
- `currentPeriodEnd` - End date / next billing date
- `amount` - Subscription amount in cents
- `interval` - Billing interval (month/year)

### 2. **User Model: Cached Copy for Performance**
User model fields (`subscriptionStatus`, `subscriptionStartDate`, `nextBillingDate`) are **cached copies** for quick access, NOT the source of truth.

### 3. **API Endpoint with Fallback Logic**
**GET /api/payments/status** (payment.routes.js)
```javascript
// Fetches from Subscription model (source of truth)
// Falls back to User model fields if Subscription not found
// This ensures resilience and backward compatibility
```

### 4. **Automatic Synchronization Points**

#### A. Webhook Handlers (payment.routes.js)
- `handleSubscriptionUpdate()` - Syncs when Stripe subscription changes
- `handleSubscriptionDeleted()` - Syncs when subscription is canceled
- `handleInvoicePaid()` - Updates payment records

#### B. APA Application Completion (apa.routes.js)
```javascript
// Step 1: Create Subscription record (SOURCE OF TRUTH)
await Subscription.create({ ... });

// Step 2: SYNC to User model (CACHED COPY)
newUser.subscriptionStatus = 'active';
newUser.nextBillingDate = subscriptionEndDate;
await newUser.save();
```

#### C. Migration Scripts (backend/scripts/)
- `fix-agent-payments.js` - Creates Subscription → Syncs to User
- `sync-from-subscription.js` - Utility to re-sync from Subscription

## Data Flow

```
┌─────────────────┐
│  Stripe Events  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────────┐
│    Webhooks     │─────▶│ Subscription     │ ◀── SOURCE OF TRUTH
└─────────────────┘      │ Model (MongoDB)  │
                         └────────┬─────────┘
                                  │
                         SYNC     │
                                  ▼
                         ┌──────────────────┐
                         │ User Model       │ ◀── CACHED COPY
                         │ (subscriptionStatus,
                         │  nextBillingDate)│
                         └────────┬─────────┘
                                  │
                                  ▼
                         ┌──────────────────┐
                         │ GET /api/payments│
                         │ /status          │
                         │ (with fallback)  │
                         └────────┬─────────┘
                                  │
                                  ▼
                         ┌──────────────────┐
                         │   Frontend       │
                         │ (Billing Page)   │
                         └──────────────────┘
```

## Benefits of This Architecture

1. **Single Source of Truth** - Subscription model is authoritative
2. **Performance** - User fields provide fast access without extra queries
3. **Resilience** - API falls back to User fields if Subscription not found
4. **Consistency** - All updates go through sync points
5. **Stripe Integration** - Webhooks keep data in sync automatically

## Key Files Modified

### Backend Routes
- `backend/routes/payment.routes.js` - Status endpoint with fallback logic
- `backend/routes/apa.routes.js` - Proper Subscription creation + sync

### Models
- `backend/models/Subscription.js` - Source of truth (required fields: stripePriceId, amount, interval)
- `backend/models/User.js` - Cached fields (subscriptionStatus, nextBillingDate)

### Scripts
- `backend/scripts/fix-agent-payments.js` - Migration with proper sync
- `backend/scripts/sync-from-subscription.js` - One-time sync utility
- `backend/scripts/verify-sync.js` - Verification tool

## Testing Verification

```bash
# Verify sync status
node backend/scripts/verify-sync.js

# Expected Output:
# Status synced: ✅ YES
# Next billing date synced: ✅ YES
# 🎉 PERFECT! Subscription and User models are in sync!
```

## Future Considerations

1. **Periodic Sync Job** - Run nightly to catch any missed syncs
2. **Sync Validation** - Add middleware to verify sync on User.save()
3. **Monitoring** - Alert if Subscription and User fields drift apart
4. **Migration** - Consider removing User fields entirely and always query Subscription

## Result

✅ Billing page now displays "Active" instead of "None"
✅ Next billing date shows proper date instead of "N/A"
✅ All subscription data comes from authoritative source
✅ Automatic sync ensures consistency
✅ No more patches or workarounds needed
