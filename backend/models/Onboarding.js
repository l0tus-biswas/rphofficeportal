const mongoose = require('mongoose');

const STEP_STATUSES = ['pending', 'approved', 'rejected', 'missing'];
const OVERALL_STATUSES = ['not-started', 'pending', 'approved', 'rejected', 'missing'];

const noteSchema = new mongoose.Schema({
  message: {
    type: String,
    trim: true,
    required: true,
    maxlength: 1000
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  role: {
    type: String,
    enum: ['admin', 'agent'],
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const historySchema = new mongoose.Schema({
  status: {
    type: String,
    enum: STEP_STATUSES,
    required: true
  },
  comment: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const onboardingStepSchema = new mongoose.Schema({
  fileName: {
    type: String,
    trim: true
  },
  originalName: {
    type: String,
    trim: true
  },
  mimeType: {
    type: String,
    trim: true
  },
  size: Number,
  uploadedAt: Date,
  status: {
    type: String,
    enum: STEP_STATUSES,
    default: 'pending'
  },
  adminComment: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  history: {
    type: [historySchema],
    default: []
  }
}, { _id: false });

const onboardingSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  steps: {
    stateLicense: { type: onboardingStepSchema, default: () => ({}) },
    driversLicense: { type: onboardingStepSchema, default: () => ({}) },
    fingerprintBackground: { type: onboardingStepSchema, default: () => ({}) },
    cmsCertificate: { type: onboardingStepSchema, default: () => ({}) },
    directDeposit: { type: onboardingStepSchema, default: () => ({}) }
  },
  status: {
    type: String,
    enum: OVERALL_STATUSES,
    default: 'not-started'
  },
  submittedAt: Date,
  reviewedAt: Date,
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  notes: {
    type: [noteSchema],
    default: []
  },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastUpdatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

onboardingSchema.methods.updateOverallStatus = function () {
  const stepStatuses = Object.values(this.steps || {})
    .filter(step => step && step.status)
    .map(step => step.status);

  if (stepStatuses.length === 0) {
    this.status = 'not-started';
    return this.status;
  }

  if (stepStatuses.every(status => status === 'approved')) {
    this.status = 'approved';
  } else if (stepStatuses.some(status => status === 'rejected')) {
    this.status = 'rejected';
  } else if (stepStatuses.some(status => status === 'missing')) {
    this.status = 'missing';
  } else {
    this.status = 'pending';
  }

  return this.status;
};

const Onboarding = mongoose.model('Onboarding', onboardingSchema);

Onboarding.STEP_STATUSES = STEP_STATUSES;
Onboarding.OVERALL_STATUSES = OVERALL_STATUSES;

module.exports = Onboarding;
