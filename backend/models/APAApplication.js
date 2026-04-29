const mongoose = require('mongoose');

const apaApplicationSchema = new mongoose.Schema({
  // Application Status
  status: {
    type: String,
    enum: ['pending_signature', 'pending_payment', 'active', 'completed', 'rejected'],
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
  
  // DocuSign Integration
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
    stripeCustomerId: String,
    stripePaymentMethodId: String,
    stripeSubscriptionId: String,
    useSamePaymentMethod: { type: Boolean, default: true },
    alternatePaymentMethodId: String,
    couponCode: String
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
