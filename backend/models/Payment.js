const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  type: {
    type: String,
    enum: ['subscription', 'setup_fee'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'usd'
  },
  stripePaymentIntentId: {
    type: String,
    sparse: true
  },
  stripeInvoiceId: {
    type: String,
    sparse: true
  },
  status: {
    type: String,
    enum: ['pending', 'succeeded', 'failed', 'refunded', 'canceled', 'completed'],
    default: 'pending'
  },
  description: {
    type: String
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  },
  paidAt: {
    type: Date
  },
  refundedAt: {
    type: Date
  },
  deletedAt: {
    type: Date,
    default: null
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true
});

// Indexes
paymentSchema.pre('validate', function(next) {
  if (this.type === 'one-time') {
    this.type = 'setup_fee';
  }
  next();
});

paymentSchema.index({ user: 1, createdAt: -1 });
paymentSchema.index({ status: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
