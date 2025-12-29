const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

async function updateSubscriptionFields() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Find all agents
    const agents = await User.find({ role: 'agent' });
    
    console.log(`Processing ${agents.length} agents...\n`);

    for (const agent of agents) {
      console.log(`Updating ${agent.email}...`);
      
      // Force update subscription fields
      agent.subscriptionStatus = 'active';
      agent.subscriptionStartDate = agent.createdAt;
      agent.nextBillingDate = new Date(agent.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);
      agent.lastPaymentDate = agent.createdAt;
      
      await agent.save();
      
      console.log(`  Subscription Status: ${agent.subscriptionStatus}`);
      console.log(`  Next Billing Date: ${agent.nextBillingDate.toDateString()}`);
      console.log(`  ✓ Updated\n`);
    }

    console.log('=== Update Complete ===');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

updateSubscriptionFields();
