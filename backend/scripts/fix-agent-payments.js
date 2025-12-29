const mongoose = require('mongoose');
const User = require('../models/User');
const Payment = require('../models/Payment');
const Subscription = require('../models/Subscription');
require('dotenv').config();

async function fixAgentPayments() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Find all agents
    const agents = await User.find({ role: 'agent' });
    
    console.log(`Processing ${agents.length} agents...\n`);

    for (const agent of agents) {
      let updated = false;
      
      // Create Stripe Customer ID if missing
      if (!agent.stripeCustomerId) {
        agent.stripeCustomerId = `cus_migrated_${Date.now()}_${agent._id}`;
        updated = true;
      }
      
      // Create Stripe Subscription ID if missing
      if (!agent.stripeSubscriptionId) {
        agent.stripeSubscriptionId = `sub_migrated_${Date.now()}_${agent._id}`;
        updated = true;
      }
      
      // Set oneTimePaymentCompleted to true
      if (!agent.oneTimePaymentCompleted) {
        agent.oneTimePaymentCompleted = true;
        agent.oneTimePaymentDate = agent.createdAt;
        updated = true;
      }
      
      // Set payment access enabled
      if (!agent.paymentAccessEnabled) {
        agent.paymentAccessEnabled = true;
        updated = true;
      }
      
      if (updated) {
        await agent.save();
        console.log(`✓ Updated user record for ${agent.email}`);
      }
      
      // Create Payment record if missing
      const existingPayment = await Payment.findOne({ user: agent._id, type: 'one-time' });
      if (!existingPayment) {
        await Payment.create({
          user: agent._id,
          type: 'one-time',
          amount: 16900, // $169 in cents
          currency: 'usd',
          stripePaymentIntentId: `pi_migrated_${Date.now()}_${agent._id}`,
          status: 'succeeded',
          description: 'One-time registration fee',
          paidAt: agent.oneTimePaymentDate || agent.createdAt,
          metadata: {
            source: 'manual_migration',
            migratedAt: new Date(),
            note: 'Retroactively created for existing agent'
          }
        });
        console.log(`✓ Created payment record for ${agent.email}`);
      }
      
      // Create Subscription record if missing
      const existingSubscription = await Subscription.findOne({ user: agent._id });
      if (!existingSubscription) {
        const subscriptionStartDate = agent.createdAt;
        const subscriptionEndDate = new Date(agent.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);
        
        await Subscription.create({
          user: agent._id,
          stripeSubscriptionId: agent.stripeSubscriptionId,
          stripeCustomerId: agent.stripeCustomerId,
          stripePriceId: process.env.STRIPE_MONTHLY_PRICE_ID || 'price_monthly_migrated',
          status: 'active',
          amount: 2500, // $25 in cents
          currency: 'usd',
          interval: 'month',
          currentPeriodStart: subscriptionStartDate,
          currentPeriodEnd: subscriptionEndDate,
          metadata: {
            source: 'manual_migration',
            migratedAt: new Date(),
            note: 'Retroactively created for existing agent'
          }
        });
        
        // SYNC: Update User model to match Subscription
        agent.subscriptionStatus = 'active';
        agent.subscriptionStartDate = subscriptionStartDate;
        agent.nextBillingDate = subscriptionEndDate;
        await agent.save();
        
        console.log(`✓ Created subscription record for ${agent.email}`);
      }
      
      console.log('');
    }

    console.log('=== Migration Complete ===');
    console.log('All agents now have:');
    console.log('- Payment record (status: succeeded)');
    console.log('- Subscription record (status: active)');
    console.log('- Payment access enabled');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixAgentPayments();
