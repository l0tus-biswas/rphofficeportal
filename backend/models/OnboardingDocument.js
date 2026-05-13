const mongoose = require('mongoose');

const onboardingDocumentSchema = new mongoose.Schema({
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  docType: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OnboardingDocType',
    required: true
  },
  // For file uploads
  filePath: {
    type: String
  },
  originalFileName: {
    type: String
  },
  // For read-only links (e.g. DocuSign completed APA Agreement URL)
  externalLink: {
    type: String
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'missing'],
    default: 'pending'
  },
  adminComment: {
    type: String,
    trim: true,
    default: ''
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  reviewedAt: {
    type: Date,
    default: null
  },
  history: [{
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'missing'],
      required: true
    },
    comment: {
      type: String,
      trim: true,
      default: ''
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Optional notes from uploader
  notes: {
    type: String,
    trim: true,
    default: ''
  },
  // Direct Deposit fields (AES-256-GCM encrypted at rest)
  bankRoutingNumber: {
    type: String,
    default: null
  },
  bankAccountNumber: {
    type: String,
    default: null
  },
  bankAccountType: {
    type: String,
    enum: ['checking', 'savings', null],
    default: null
  },
  // Soft-delete: set when agent or admin deletes the document
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
onboardingDocumentSchema.index({ agent: 1, docType: 1 });
onboardingDocumentSchema.index({ agent: 1, deletedAt: 1 });
onboardingDocumentSchema.index({ status: 1, deletedAt: 1 });

module.exports = mongoose.model('OnboardingDocument', onboardingDocumentSchema);
