const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

async function directCheck() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const agent = await User.findOne({ role: 'agent', email: 'bestinthewestindia@gmail.com' });
    
    console.log('Direct query results:');
    console.log('Email:', agent.email);
    console.log('subscriptionStatus:', agent.subscriptionStatus);
    console.log('subscriptionStartDate:', agent.subscriptionStartDate);
    console.log('nextBillingDate:', agent.nextBillingDate);
    console.log('lastPaymentDate:', agent.lastPaymentDate);
    console.log('\nRaw document:');
    console.log(JSON.stringify({
      subscriptionStatus: agent.subscriptionStatus,
      subscriptionStartDate: agent.subscriptionStartDate,
      nextBillingDate: agent.nextBillingDate,
      lastPaymentDate: agent.lastPaymentDate
    }, null, 2));

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

directCheck();
