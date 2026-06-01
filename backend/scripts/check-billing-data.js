/**
 * Diagnostic script to check billing/subscription data
 * Run: node scripts/check-billing-data.js
 */
const mongoose = require('mongoose');
require('dotenv').config();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  // Load models in dependency order
  require('../models/User');
  const Payment = require('../models/Payment');
  const Subscription = require('../models/Subscription');
  
  // Check all payments  
  const payments = await Payment.find({ deletedAt: null }).populate('user', 'name email deletedAt').sort('-createdAt').lean();
  console.log('=== PAYMENTS (non-deleted) ===');
  console.log('Total:', payments.length);
  payments.forEach(p => {
    const userName = p.user ? p.user.name : 'NO USER';
    const userDeleted = p.user?.deletedAt ? ' [USER DELETED]' : '';
    console.log(' ', p.status.padEnd(10), p.type.padEnd(15), '$' + (p.amount/100).toFixed(2).padEnd(8), new Date(p.createdAt).toISOString().slice(0,10), userName + userDeleted);
  });
  
  console.log('\n=== SUBSCRIPTIONS (non-deleted) ===');
  const subs = await Subscription.find({ deletedAt: null }).populate('user', 'name email deletedAt').sort('-createdAt').lean();
  console.log('Total:', subs.length);
  subs.forEach(s => {
    const userName = s.user ? s.user.name : 'NO USER';
    const userDeleted = s.user?.deletedAt ? ' [USER DELETED]' : '';
    console.log(' ', s.status.padEnd(12), '$' + (s.amount/100).toFixed(2).padEnd(8), userName + userDeleted);
  });
  
  console.log('\n=== SUBSCRIPTION STATS (excluding deleted) ===');
  const stats = await Subscription.aggregate([
    { $match: { deletedAt: null } },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);
  stats.forEach(s => console.log(' ', s._id, ':', s.count));
  
  console.log('\n=== PAYMENT STATS (excluding deleted) ===');
  const pStats = await Payment.aggregate([
    { $match: { deletedAt: null } },
    { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$amount' } } }
  ]);
  pStats.forEach(s => console.log(' ', s._id, ':', s.count, '($' + (s.total/100).toFixed(2) + ')'));
  
  // Check for pending payments
  console.log('\n=== PENDING PAYMENTS ===');
  const pending = await Payment.find({ status: 'pending', deletedAt: null }).populate('user', 'name email').lean();
  if (pending.length === 0) {
    console.log('  None found');
  } else {
    pending.forEach(p => {
      console.log('  ID:', p._id, 'Created:', new Date(p.createdAt).toISOString().slice(0,10), 'User:', p.user?.name || 'N/A', 'Amount: $' + (p.amount/100).toFixed(2));
    });
  }
  
  // Check ALL subscriptions including deleted to compare
  console.log('\n=== ALL SUBSCRIPTION STATS (including deleted) ===');
  const allStats = await Subscription.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);
  allStats.forEach(s => console.log(' ', s._id, ':', s.count));
  
  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
