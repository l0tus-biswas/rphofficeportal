const mongoose = require('mongoose');
const User = require('../models/User');
const Payment = require('../models/Payment');
const Subscription = require('../models/Subscription');
require('dotenv').config();

async function migratePaymentRecords() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find all users who completed payment but don't have Payment records
    const users = await User.find({ 
      oneTimePaymentCompleted: true,
      role: 'agent'
    });

    console.log(`Found ${users.length} users who completed payment`);

    let paymentsCreated = 0;
    let paymentsUpdated = 0;
    let subscriptionsCreated = 0;

    for (const user of users) {
      // Check if Payment record exists
      let payment = await Payment.findOne({ user: user._id, type: 'one-time' });
      
      if (!payment) {
        // Create Payment record for one-time fee
        payment = await Payment.create({
          user: user._id,
          type: 'one-time',
          amount: 16900, // $169 in cents
          currency: 'usd',
          stripePaymentIntentId: user.stripePaymentIntentId || `pi_migrated_${Date.now()}_${user._id}`,
          status: 'succeeded',
          description: 'One-time registration fee',
          paidAt: user.oneTimePaymentDate || user.createdAt,
          metadata: {
            source: 'migration',
            migratedAt: new Date()
          }
        });
        paymentsCreated++;
        console.log(`✓ Created payment record for ${user.email}`);
      } else if (payment.status === 'pending') {
        // Update existing pending payments to succeeded
        payment.status = 'succeeded';
        payment.paidAt = user.oneTimePaymentDate || user.createdAt;
        await payment.save();
        paymentsUpdated++;
        console.log(`✓ Updated payment status for ${user.email}`);
      }

      // Check if Subscription record exists
      let subscription = await Subscription.findOne({ user: user._id });
      
      if (!subscription && user.stripeSubscriptionId) {
        // Create Subscription record
        subscription = await Subscription.create({
          user: user._id,
          stripeSubscriptionId: user.stripeSubscriptionId,
          stripeCustomerId: user.stripeCustomerId,
          status: user.subscriptionStatus || 'active',
          planAmount: 2500, // $25 in cents
          currency: 'usd',
          currentPeriodStart: user.subscription?.startDate || user.createdAt,
          currentPeriodEnd: user.nextBillingDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          metadata: {
            source: 'migration',
            migratedAt: new Date()
          }
        });
        subscriptionsCreated++;
        console.log(`✓ Created subscription record for ${user.email}`);
      }
    }

    console.log('\n=== Migration Summary ===');
    console.log(`Payment records created: ${paymentsCreated}`);
    console.log(`Payment records updated: ${paymentsUpdated}`);
    console.log(`Subscription records created: ${subscriptionsCreated}`);
    console.log('Migration completed successfully!');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

migratePaymentRecords();
