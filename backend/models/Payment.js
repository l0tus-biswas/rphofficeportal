const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['one-time', 'subscription'],
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
    enum: ['pending', 'succeeded', 'failed', 'refunded', 'canceled'],
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
  }
}, {
  timestamps: true
});

// Indexes
paymentSchema.index({ user: 1, createdAt: -1 });
paymentSchema.index({ stripePaymentIntentId: 1 });
paymentSchema.index({ stripeInvoiceId: 1 });
paymentSchema.index({ status: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
