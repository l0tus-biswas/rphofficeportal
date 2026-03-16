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
  // Soft-delete: set when agent or admin deletes the document
  deletedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Indexes
onboardingDocumentSchema.index({ agent: 1, docType: 1 });
onboardingDocumentSchema.index({ agent: 1, deletedAt: 1 });

module.exports = mongoose.model('OnboardingDocument', onboardingDocumentSchema);
