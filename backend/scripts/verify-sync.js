const mongoose = require('mongoose');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
require('dotenv').config();

async function verifySync() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const agent = await User.findOne({ role: 'agent', email: 'bestinthewestindia@gmail.com' });
    const subscription = await Subscription.findOne({ user: agent._id });
    
    console.log('=== VERIFICATION: Subscription Model (SOURCE OF TRUTH) ===');
    console.log('Status:', subscription.status);
    console.log('Current Period Start:', subscription.currentPeriodStart);
    console.log('Current Period End:', subscription.currentPeriodEnd);
    console.log('Amount:', `$${subscription.amount/100}/month`);
    console.log('Interval:', subscription.interval);
    
    console.log('\n=== VERIFICATION: User Model (CACHED COPY) ===');
    console.log('Subscription Status:', agent.subscriptionStatus);
    console.log('Subscription Start Date:', agent.subscriptionStartDate);
    console.log('Next Billing Date:', agent.nextBillingDate);
    
    console.log('\n=== SYNC STATUS ===');
    const statusMatch = subscription.status === agent.subscriptionStatus;
    const dateMatch = subscription.currentPeriodEnd.getTime() === agent.nextBillingDate.getTime();
    
    console.log('Status synced:', statusMatch ? '✅ YES' : '❌ NO');
    console.log('Next billing date synced:', dateMatch ? '✅ YES' : '❌ NO');
    
    if (statusMatch && dateMatch) {
      console.log('\n🎉 PERFECT! Subscription and User models are in sync!');
    } else {
      console.log('\n⚠️  WARNING: Models are out of sync!');
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

verifySync();
