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
  
  // Product sold
  productSold: {
    type: String,
    required: [true, 'Product is required'],
    enum: [
      'Accident Insurance',
      'Cancer Insurance',
      'Critical Illness',
      'Dental / Vision / Hearing',
      'Disability',
      'Final Expense',
      'Hospital Indemnity',
      'Life Insurance – Term',
      'Life Insurance – IUL',
      'Life Insurance – Whole Life',
      'Life Insurance – VUL',
      'Long Term Care',
      'Medicare Advantage',
      'Other'
    ]
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
  
  // Status tracking (for future use)
  status: {
    type: String,
    enum: ['submitted', 'pending', 'approved', 'rejected', 'paid'],
    default: 'submitted'
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
