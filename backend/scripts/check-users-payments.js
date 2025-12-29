const mongoose = require('mongoose');
const User = require('../models/User');
const Payment = require('../models/Payment');
const Subscription = require('../models/Subscription');
require('dotenv').config();

async function checkUsersPayments() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Check all agents
    const agents = await User.find({ role: 'agent' }).select('name email oneTimePaymentCompleted stripeCustomerId stripeSubscriptionId subscriptionStatus subscriptionStartDate nextBillingDate lastPaymentDate createdAt');
    console.log(`Total agents: ${agents.length}\n`);

    for (const agent of agents) {
      console.log(`--- ${agent.name} (${agent.email}) ---`);
      console.log(`Created: ${agent.createdAt}`);
      console.log(`One-time payment completed: ${agent.oneTimePaymentCompleted || false}`);
      console.log(`Stripe Customer ID: ${agent.stripeCustomerId || 'None'}`);
      console.log(`Stripe Subscription ID: ${agent.stripeSubscriptionId || 'None'}`);
      
      // Check Payment records
      const payments = await Payment.find({ user: agent._id });
      console.log(`Payment records: ${payments.length}`);
      if (payments.length > 0) {
        payments.forEach(p => {
          console.log(`  - ${p.type}: $${p.amount/100} (${p.status}) - ${p.description}`);
        });
      }
      
      // Check Subscription records
      const subscription = await Subscription.findOne({ user: agent._id });
      console.log(`Subscription record: ${subscription ? `${subscription.status} - $${subscription.amount/100}/month` : 'None'}`);
      
      // Check User subscription fields
      console.log(`User subscription status: ${agent.subscriptionStatus || 'none'}`);
      console.log(`User next billing date: ${agent.nextBillingDate ? agent.nextBillingDate.toDateString() : 'Not set'}`);
      console.log('');
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkUsersPayments();
