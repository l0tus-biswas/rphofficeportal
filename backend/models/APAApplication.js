const mongoose = require('mongoose');

const apaApplicationSchema = new mongoose.Schema({
  // Application Status
  status: {
    type: String,
    // pending_resignature: agent edited an existing application and must sign again.
    // pending_review: re-signed after an edit/rejection, waiting for admin re-approval.
    enum: ['pending_signature', 'pending_payment', 'active', 'completed', 'rejected', 'pending_resignature', 'pending_review'],
    default: 'pending_signature'
  },
  
  // Link to created user account
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // SECTION 1: Personal Information
  personalInfo: {
    legalFirstName: { type: String, required: true, trim: true },
    legalMiddleName: { type: String, trim: true },
    legalLastName: { type: String, required: true, trim: true },
    agencyLegalName: { type: String, trim: true, default: 'N/A' }, // Agency / LLC full legal name, 'N/A' if none
    gender: { type: String, enum: ['M', 'F'], required: true },
    dateOfBirth: { type: Date, required: true },
    ssn: { type: String, required: true }, // Should be encrypted in production
    mobilePhone: { type: String, required: true },
    email: { type: String, required: true, lowercase: true },
    homeAddress: {
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      zipCode: { type: String, required: true }
    },
    mailingAddress: {
      street: String,
      city: String,
      state: String,
      zipCode: String
    },
    previouslyContracted: { type: Boolean, default: false }
  },
  
  // SECTION 2: Recruiting & Hierarchy
  recruitingInfo: {
    recruiterFullName: { type: String, required: true },
    recruiterAgentId: String,
    recruiterContact: { type: String, required: true },
    uplineLeaderName: String,
    teamName: String,
    referralCode: String
  },
  
  // SECTION 3: Background & Compliance
  complianceQuestions: {
    previouslyContractedOther: {
      answer: { type: Boolean, required: true },
      explanation: String,
      documentUrl: String
    },
    felonyConviction: {
      answer: { type: Boolean, required: true },
      explanation: String,
      documentUrl: String
    },
    misdemeanorFraud: {
      answer: { type: Boolean, required: true },
      explanation: String,
      documentUrl: String
    },
    civilAction: {
      answer: { type: Boolean, required: true },
      explanation: String,
      documentUrl: String
    },
    licenseDenied: {
      answer: { type: Boolean, required: true },
      explanation: String,
      documentUrl: String
    },
    bondIssues: {
      answer: { type: Boolean, required: true },
      explanation: String,
      documentUrl: String
    }
  },
  
  // SECTION 4: Financial Background
  financialBackground: {
    unsatisfiedJudgments: { type: Boolean, required: true },
    unsatisfiedJudgmentsExplanation: String,
    unsatisfiedLiens: { type: Boolean, required: true },
    unsatisfiedLiensExplanation: String,
    bankruptcy: {
      filed: { type: Boolean, required: true },
      chapter: { type: String, enum: ['7', '11', '13', null] },
      status: { type: String, enum: ['Discharged', 'Open', 'Dismissed', null] }
    }
  },
  
  // SECTION 5: Licensing Status
  licensingStatus: {
    currentlyLicensed: { type: Boolean, required: true },
    licenseTypes: [{ type: String, enum: ['Life', 'Health', 'Life & Health', 'Other'] }],
    statesLicensed: [String],
    licenseNumber: String,
    licenseStatus: { type: String, enum: ['Active', 'Inactive', 'Pending Renewal', 'Expired', null] },
    licenseOtherDescription: String
  },
  
  // Zoho Sign Integration
  docusign: {
    envelopeId: String,
    status: { 
      type: String, 
      enum: ['draft', 'sent', 'delivered', 'signed', 'completed', 'declined', 'voided'], 
      default: 'draft' 
    },
    sentAt: Date,
    signedAt: Date,
    documentUrl: String
  },
  
  // Payment Information
  payment: {
    onboardingFeeAmount: { type: Number, default: 20 },
    onboardingFeePaid: { type: Boolean, default: false },
    onboardingFeeWaived: { type: Boolean, default: false },
    onboardingFeePaymentIntentId: String,
    monthlyFeeAmount: { type: Number, default: 20 },
    monthlyFeeAuthorized: { type: Boolean, default: false },
    paymentDate: Date,
    paidAt: Date,
    paymentStatus: String,
    paymentIntentId: String,
    amount: Number,
    stripeCustomerId: String,
    stripePaymentMethodId: String,
    stripeSubscriptionId: String,
    useSamePaymentMethod: { type: Boolean, default: true },
    alternatePaymentMethodId: String,
    couponCode: String,
    // Set once the coupon's usageCount has been incremented (at payment
    // completion, not checkout creation) so it is only ever counted once.
    couponUsageCounted: { type: Boolean, default: false },
    // Atomic lock taken while a paid checkout is being turned into an account,
    // so the browser return and the Stripe webhook can't both create one.
    registrationClaimedAt: Date
  },
  
  // Linked User (created after payment)
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Timestamps
  submittedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: Date,
  
  // Admin review fields
  adminNotes: String,
  reviewedAt: Date,
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectionReason: String,

  // Agent-initiated "request to edit" flow. 'approved' stays open (agent can
  // edit repeatedly) until an admin re-locks it, which sets it to 'locked'.
  editRequest: {
    status: {
      type: String,
      enum: ['none', 'pending', 'approved', 'denied', 'locked'],
      default: 'none'
    },
    reason: String,
    requestedAt: Date,
    reviewedAt: Date,
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    adminNote: String,
    lastEditedAt: Date
  },
  // Simple version history. The live fields above are always the current
  // version; each time an agent edits + re-signs, the version being replaced is
  // pushed here as a read-only snapshot (SSN is never copied into snapshots).
  currentVersion: { type: Number, default: 1 },
  currentVersionReason: {
    type: String,
    enum: ['original', 'edit_request', 'rejection_resubmit'],
    default: 'original'
  },
  versions: [{
    version: Number,
    reason: { type: String, enum: ['original', 'edit_request', 'rejection_resubmit'] },
    snapshot: mongoose.Schema.Types.Mixed,
    signedDocumentUrl: String,
    signedAt: Date,
    rejectionReason: String,
    supersededAt: { type: Date, default: Date.now },
    supersededBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  // Set while an edited application waits for the agent's new signature.
  resign: {
    required: { type: Boolean, default: false },
    source: { type: String, enum: ['edit_request', 'rejection_resubmit'] },
    requestedAt: Date
  },
  editHistory: [{
    editedAt: { type: Date, default: Date.now },
    editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changes: [{ field: String, from: String, to: String }]
  }],
  deletedAt: {
    type: Date,
    default: null
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, { timestamps: true });

// Pre-save middleware to convert empty strings to null for enum fields
apaApplicationSchema.pre('save', function(next) {
  // Financial background bankruptcy fields
  if (this.financialBackground?.bankruptcy) {
    // If bankruptcy was not filed, clear chapter and status
    if (this.financialBackground.bankruptcy.filed === false) {
      this.financialBackground.bankruptcy.chapter = null;
      this.financialBackground.bankruptcy.status = null;
    } else {
      // Convert empty strings to null for enum validation
      if (this.financialBackground.bankruptcy.chapter === '') {
        this.financialBackground.bankruptcy.chapter = null;
      }
      if (this.financialBackground.bankruptcy.status === '') {
        this.financialBackground.bankruptcy.status = null;
      }
    }
  }
  
  // Licensing status - convert empty string to null
  if (this.licensingStatus?.licenseStatus === '') {
    this.licensingStatus.licenseStatus = null;
  }
  
  next();
});

// Indexes
apaApplicationSchema.index({ email: 1 });
apaApplicationSchema.index({ status: 1 });
apaApplicationSchema.index({ 'docusign.envelopeId': 1 });
apaApplicationSchema.index({ 'payment.stripeCustomerId': 1 });

module.exports = mongoose.model('APAApplication', apaApplicationSchema);
