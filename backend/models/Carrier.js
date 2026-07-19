const mongoose = require('mongoose');

const carrierSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Carrier name is required'],
    trim: true
  },

  // Product categories this carrier belongs to (supports multiple)
  category: {
    type: [String],
    enum: ['Life Insurance', 'Health Insurance', 'Medicare', 'Supplemental Insurance'],
    validate: {
      validator: function(v) { return v && v.length > 0; },
      message: 'At least one carrier category is required'
    }
  },

  isActive: {
    type: Boolean,
    default: true
  },

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

  // General named PDF documents (guides, forms, resources) available to any carrier
  documents: [{
    name: { type: String, required: true, trim: true },
    filePath: { type: String, required: true },
    originalFileName: String,
    fileSize: Number,
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    uploadedAt: { type: Date, default: Date.now }
  }],

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
  },

  // Soft-delete tracking
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

// Index for quick lookups
carrierSchema.index({ isActive: 1 });
carrierSchema.index({ category: 1, isActive: 1 });
// Unique per name, but only while active — a soft-deleted (isActive: false)
// carrier no longer occupies the name, so it can be reused by a new entry.
carrierSchema.index({ name: 1 }, { unique: true, partialFilterExpression: { isActive: true } });

module.exports = mongoose.model('Carrier', carrierSchema);
