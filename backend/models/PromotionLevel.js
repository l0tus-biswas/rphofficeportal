const mongoose = require('mongoose');

const promotionLevelSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Level name is required'],
    unique: true,
    trim: true
  },
  rank: {
    type: Number,
    required: true,
    unique: true,
    min: 1
  },
  commissionPercent: {
    type: Number,
    required: true,
    min: 0,
    max: 200
  },

  // --- Producer Track ---
  producerPremiumThreshold: {
    type: Number,
    required: true,
    min: 0
  },
  producerWindowDays: {
    type: Number,
    default: 30,
    min: 1
  },

  // --- Builder Track ---
  builderPremiumThreshold: {
    type: Number,
    required: true,
    min: 0
  },
  builderAgentCountThreshold: {
    type: Number,
    required: true,
    min: 0
  },
  builderWindowDays: {
    type: Number,
    default: 60,
    min: 1
  },
  // Team composition by rank — replaces the plain agent-count check when set.
  // OR semantics across entries: satisfied if ANY entry's count is met by
  // downline members at-or-above that rank (e.g. "2 Advisors OR 1 Senior Advisor").
  builderRequiredRanks: [{
    rank: { type: String, required: true, trim: true, lowercase: true },
    count: { type: Number, required: true, min: 1 },
    _id: false
  }],

  // --- Income requirement (both tracks) ---
  // Fed by admin-approved IncomePaid entries. 0 threshold = not required.
  producerIncomeThreshold: {
    type: Number,
    default: 0,
    min: 0
  },
  producerIncomeWindowDays: {
    type: Number,
    default: 180,
    min: 1
  },
  builderIncomeThreshold: {
    type: Number,
    default: 0,
    min: 0
  },
  builderIncomeWindowDays: {
    type: Number,
    default: 180,
    min: 1
  },

  // --- Skip-level promotion ---
  canSkipTo: {
    type: Boolean,
    default: false
  },
  skipMultiplier: {
    type: Number,
    default: 1.4,
    min: 1
  },
  skipLegCapPercent: {
    type: Number,
    default: 50,
    min: 1,
    max: 100
  },

  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

module.exports = mongoose.model('PromotionLevel', promotionLevelSchema);
