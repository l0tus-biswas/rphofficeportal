const mongoose = require('mongoose');

const printfulOrderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userEmail: {
    type: String,
    required: true
  },
  userName: {
    type: String,
    default: ''
  },

  // Printful data
  printfulOrderId: {
    type: Number,
    sparse: true
  },
  printfulStatus: {
    type: String,
    enum: ['not_submitted', 'draft', 'pending', 'inprocess', 'fulfilled', 'canceled', 'archived'],
    default: 'not_submitted'
  },

  // Product info (snapshot at order time)
  product: {
    name: String,
    variantId: Number,
    variantName: String,
    sku: String,
    thumbnail: String,
    unitPrice: Number,
    quantity: Number
  },

  // Personalization
  textValues: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Mockup / customization
  mockupUrl: String,
  mockupTaskKey: String,

  // Shipping
  shippingAddress: {
    name: String,
    address1: String,
    address2: String,
    city: String,
    state: String,
    zip: String,
    country: { type: String, default: 'US' },
    phone: String
  },

  // Costs
  subtotal: { type: Number, default: 0 },
  shipping: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  total: { type: Number, default: 0 },

  // Payment / Stripe
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'pending', 'paid', 'refunded', 'failed'],
    default: 'unpaid'
  },
  stripePaymentIntentId: {
    type: String,
    sparse: true
  },
  stripeReceiptUrl: String,
  paidAt: Date,

  // Admin management
  adminStatus: {
    type: String,
    enum: ['pending_review', 'approved', 'rejected', 'deleted'],
    default: 'pending_review'
  },
  adminNotes: {
    type: String,
    default: ''
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: Date,

  // Soft delete
  deletedAt: Date,
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

printfulOrderSchema.index({ user: 1, createdAt: -1 });
printfulOrderSchema.index({ adminStatus: 1 });
printfulOrderSchema.index({ paymentStatus: 1 });
printfulOrderSchema.index({ stripePaymentIntentId: 1 });

module.exports = mongoose.model('PrintfulOrder', printfulOrderSchema);
