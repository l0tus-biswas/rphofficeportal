const mongoose = require('mongoose');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
require('dotenv').config();

async function fixSync() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const agent = await User.findOne({ role: 'agent', email: 'bestinthewestindia@gmail.com' });
    const subscription = await Subscription.findOne({ user: agent._id });
    
    console.log('Syncing User model from Subscription model (source of truth)...\n');
    
    // Update User fields from Subscription
    agent.subscriptionStatus = subscription.status;
    agent.subscriptionStartDate = subscription.currentPeriodStart;
    agent.nextBillingDate = subscription.currentPeriodEnd;
    await agent.save();
    
    console.log('✅ User model synced from Subscription model');
    console.log('Status:', agent.subscriptionStatus);
    console.log('Start Date:', agent.subscriptionStartDate);
    console.log('Next Billing Date:', agent.nextBillingDate);

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixSync();
