const mongoose = require('mongoose');

const onboardingDocTypeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  // Whether this document is mandatory for onboarding completion
  required: {
    type: Boolean,
    default: false
  },
  // Can the agent upload this themselves?
  agentCanUpload: {
    type: Boolean,
    default: true
  },
  // Can the agent delete their own uploaded copy?
  agentCanDelete: {
    type: Boolean,
    default: true
  },
  // True for APA Agreement — this is a read-only link, no upload UI shown
  isReadOnlyLink: {
    type: Boolean,
    default: false
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

onboardingDocTypeSchema.index({ sortOrder: 1, isActive: 1 });

module.exports = mongoose.model('OnboardingDocType', onboardingDocTypeSchema);
