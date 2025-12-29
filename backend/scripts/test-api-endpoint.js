const mongoose = require('mongoose');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
require('dotenv').config();

async function testApiLogic() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');
    console.log('=== SIMULATING GET /api/payments/status ENDPOINT ===\n');

    const user = await User.findOne({ role: 'agent', email: 'bestinthewestindia@gmail.com' });
    
    // SIMULATE THE API ENDPOINT LOGIC
    let subscriptionDetails = null;
    let subscriptionStatus = user.subscriptionStatus || 'none';
    let nextBillingDate = user.nextBillingDate;
    let subscriptionStartDate = user.subscriptionStartDate;
    
    if (user.stripeSubscriptionId) {
      const subscription = await Subscription.findOne({ 
        stripeSubscriptionId: user.stripeSubscriptionId 
      });
      
      if (subscription) {
        subscriptionDetails = subscription;
        // Use Subscription model as source of truth, fall back to User fields
        subscriptionStatus = subscription.status || subscriptionStatus;
        nextBillingDate = subscription.currentPeriodEnd || nextBillingDate;
        subscriptionStartDate = subscription.currentPeriodStart || subscriptionStartDate;
      }
    }

    const response = {
      oneTimePaymentCompleted: user.oneTimePaymentCompleted,
      oneTimePaymentAmount: user.oneTimePaymentAmount,
      oneTimePaymentDate: user.oneTimePaymentDate,
      subscriptionStatus: subscriptionStatus,
      subscriptionStartDate: subscriptionStartDate,
      nextBillingDate: nextBillingDate,
      lastPaymentDate: user.lastPaymentDate,
      paymentAccessEnabled: user.paymentAccessEnabled,
      subscription: subscriptionDetails
    };

    console.log('API Response:');
    console.log(JSON.stringify({
      oneTimePaymentCompleted: response.oneTimePaymentCompleted,
      subscriptionStatus: response.subscriptionStatus,
      subscriptionStartDate: response.subscriptionStartDate?.toDateString(),
      nextBillingDate: response.nextBillingDate?.toDateString(),
      paymentAccessEnabled: response.paymentAccessEnabled,
      subscriptionAmount: subscriptionDetails ? `$${subscriptionDetails.amount/100}/month` : 'N/A'
    }, null, 2));
    
    console.log('\n=== FRONTEND DISPLAY ===');
    console.log(`One-Time Payment: ${response.oneTimePaymentCompleted ? '✅ Completed' : '❌ Not Completed'}`);
    console.log(`Subscription Status: ${response.subscriptionStatus.toUpperCase()}`);
    console.log(`Next Billing Date: ${response.nextBillingDate ? response.nextBillingDate.toDateString() : 'N/A'}`);
    console.log(`Payment Access: ${response.paymentAccessEnabled ? '✅ Enabled' : '❌ Disabled'}`);
    
    console.log('\n=== RESULT ===');
    if (response.subscriptionStatus === 'active' && response.nextBillingDate) {
      console.log('🎉 SUCCESS! Billing page will display correctly!');
      console.log('   ✅ Subscription Status: Active (not "None")');
      console.log('   ✅ Next Billing Date: ' + response.nextBillingDate.toDateString() + ' (not "N/A")');
    } else {
      console.log('❌ ISSUE DETECTED!');
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testApiLogic();
