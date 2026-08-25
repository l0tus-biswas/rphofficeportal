const mongoose = require('mongoose');

// Agent-submitted "income paid" entry — a carrier can pay out a single policy
// in multiple installments over time (e.g. an upfront payment, then several
// months of trailing commission), so an agent may log several entries against
// the same period. Gated by admin approval before it counts toward any
// promotion-level income requirement (Producer or Builder track).
const incomePaidSchema = new mongoose.Schema({
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: [true, 'Income amount is required'],
    min: 0
  },
  // The exact date the carrier paid this installment — used both for
  // rolling-window sums and so admins can line payments up against carrier
  // statements when reviewing.
  datePaidByCarrier: {
    type: Date,
    required: [true, 'Date paid by carrier is required']
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: Date,
  reviewNotes: {
    type: String,
    trim: true,
    maxlength: 1000
  }
}, { timestamps: true });

incomePaidSchema.index({ agent: 1, status: 1, datePaidByCarrier: -1 });

module.exports = mongoose.model('IncomePaid', incomePaidSchema);
