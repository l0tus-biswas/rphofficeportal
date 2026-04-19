const mongoose = require('mongoose');

const productionSubmissionSchema = new mongoose.Schema({
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Submission date (when the sale happened)
  submissionDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  
  // Client information
  clientName: {
    type: String,
    required: [true, 'Client name is required'],
    trim: true
  },
  
  // 8.1: Number of members (for ACA / health policies)
  numberOfMembers: {
    type: Number,
    default: 1,
    min: 1
  },

  // Product sold — no hardcoded enum; valid values are driven by the ProductType collection
  productSold: {
    type: String,
    required: [true, 'Product is required'],
    trim: true
  },
  
  // For "Other" product type
  productOtherDescription: {
    type: String,
    trim: true
  },
  
  // Carrier selected
  carrier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Carrier',
    required: [true, 'Carrier is required']
  },
  
  // Premium/payment amount
  premiumAmount: {
    type: Number,
    required: [true, 'Premium amount is required'],
    min: 0
  },
  
  // Optional notes
  notes: {
    type: String,
    default: ''
  },
  
  // Product category (auto-derived from productSold)
  productCategory: {
    type: String,
    enum: [
      'Life Insurance',
      'Health Insurance',
      'Medicare',
      'Supplemental Insurance',
      'Retirement / Annuities',
      'Property & Casualty - Personal',
      'Property & Casualty - Commercial'
    ],
    required: true
  },

  // Status tracking
  status: {
    type: String,
    enum: ['Submitted', 'Pending', 'In Force', 'Lapsed', 'Cancelled'],
    default: 'Submitted'
  },
  
  // 8.8: Track whether production was done during training period
  isTrainingPeriod: {
    type: Boolean,
    default: false
  },

  // 8.2: Custom fields — dynamic key-value pairs set by admin
  customFields: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Admin review
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: Date,
  reviewNotes: String,
  
  // Supporting documents (optional)
  documents: [{
    filename: String,
    url: String,
    uploadedAt: Date
  }]
}, {
  timestamps: true
});

// Indexes for filtering
productionSubmissionSchema.index({ agent: 1, submissionDate: -1 });
productionSubmissionSchema.index({ productSold: 1 });
productionSubmissionSchema.index({ carrier: 1 });
productionSubmissionSchema.index({ submissionDate: -1 });
productionSubmissionSchema.index({ status: 1 });

module.exports = mongoose.model('ProductionSubmission', productionSubmissionSchema);
