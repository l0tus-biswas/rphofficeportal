const mongoose = require('mongoose');

const productFactorSchema = new mongoose.Schema({
  productName: { type: String, required: true, trim: true },
  factor: { type: Number, min: 0, max: 200 },
  level: { type: String, trim: true } // e.g. 'Level 1', 'Level 2' for supplemental
}, { _id: false });

const carrierSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Carrier name is required'],
    trim: true,
    unique: true
  },

  // Product category this carrier belongs to
  category: {
    type: String,
    enum: ['Life Insurance', 'Health Insurance', 'Medicare', 'Supplemental Insurance'],
    required: [true, 'Carrier category is required']
  },

  isActive: {
    type: Boolean,
    default: true
  },

  // Base / default commission factor (%)
  factor: {
    type: Number,
    min: 0,
    max: 200,
    default: null
  },

  // Per-product commission factors (for multi-product carriers)
  productFactors: [productFactorSchema],

  // Contracting
  contractingLink: {
    type: String,
    trim: true
  },
  contractingInstructions: {
    type: String
  },
  whatToExpect: {
    type: String
  },

  // For supplemental carriers: path to uploaded level-guide PDF
  supplementalLevelGuide: {
    type: String  // relative file path, e.g. 'uploads/carrier-guides/gtl-guide.pdf'
  },

  // Optional additional info
  contactInfo: {
    phone: String,
    email: String,
    website: String
  },

  notes: {
    type: String,
    default: ''
  },

  // Track who added/modified
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index for quick lookups
carrierSchema.index({ isActive: 1 });
carrierSchema.index({ category: 1, isActive: 1 });

module.exports = mongoose.model('Carrier', carrierSchema);
