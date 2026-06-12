require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Subscription = require('../models/Subscription');
  const Payment = require('../models/Payment');

  // Check subscription stats
  const stats = await Subscription.aggregate([
    { $match: { deletedAt: null } },
    { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'userDoc' } },
    { $match: { 'userDoc.0': { $exists: true }, 'userDoc.0.deletedAt': null } },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);
  console.log('Subscription Stats (excluding deleted users):', JSON.stringify(stats, null, 2));

  // Check raw counts
  const allSubs = await Subscription.find({ deletedAt: null }).populate('user', 'name email deletedAt').lean();
  console.log('\nTotal subscriptions (not soft-deleted):', allSubs.length);
  
  const activeSubs = allSubs.filter(s => s.status === 'active');
  console.log('Active subscriptions (raw, before user filter):', activeSubs.length);
  
  const activeWithDeletedUsers = activeSubs.filter(s => s.user && s.user.deletedAt);
  console.log('Active subs belonging to DELETED users:', activeWithDeletedUsers.length);
  activeWithDeletedUsers.forEach(s => console.log('  -', s.user.name, s.user.email, 'deletedAt:', s.user.deletedAt));

  const activeWithNoUser = activeSubs.filter(s => !s.user);
  console.log('Active subs with NO user (orphaned):', activeWithNoUser.length);

  // Check payments
  const paymentStats = await Payment.aggregate([
    { $match: { deletedAt: null } },
    { $group: { _id: '$status', count: { $sum: 1 }, totalAmount: { $sum: '$amount' } } }
  ]);
  console.log('\nPayment Stats:', JSON.stringify(paymentStats, null, 2));

  // Check pending payments older than 24 hours
  const staleDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const stalePending = await Payment.find({ status: 'pending', createdAt: { $lt: staleDate }, deletedAt: null }).populate('user', 'name email').lean();
  console.log('\nStale pending payments (>24h old):', stalePending.length);
  stalePending.forEach(p => console.log('  -', p.user?.name || 'no user', p.type, '$' + (p.amount/100).toFixed(2), 'created:', p.createdAt));

  await mongoose.disconnect();
}
main().catch(e => console.error(e));
