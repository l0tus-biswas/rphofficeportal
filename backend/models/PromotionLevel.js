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
