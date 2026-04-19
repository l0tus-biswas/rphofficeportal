const mongoose = require('mongoose');

const tierEntrySchema = new mongoose.Schema({
  tier:      { type: Number, required: true },
  label:     { type: String, required: true },
  threshold: { type: Number, required: true, min: 0 },
  rate:      { type: Number, required: true, min: 0 }
}, { _id: false });

const AcaTierConfigSchema = new mongoose.Schema({
  // null  → global (system-wide) default tiers
  // <id>  → per-agent override
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  tiers: {
    type: [tierEntrySchema],
    required: true,
    validate: v => v.length > 0
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// One config per agent (null = global)
AcaTierConfigSchema.index({ agent: 1 }, { unique: true });

// ── Static: get tiers for a given agent (fallback to global) ──
AcaTierConfigSchema.statics.getTiersForAgent = async function (agentId) {
  // Check agent-specific override first
  if (agentId) {
    const override = await this.findOne({ agent: agentId }).lean();
    if (override) return override.tiers;
  }
  // Fallback to global config
  const global = await this.findOne({ agent: null }).lean();
  if (global) return global.tiers;
  // Hardcoded defaults if nothing in DB yet
  return [
    { tier: 0, label: 'Tier 0', threshold: 0,    rate: 0 },
    { tier: 1, label: 'Tier 1', threshold: 1000,  rate: 1 },
    { tier: 2, label: 'Tier 2', threshold: 2000,  rate: 2 },
    { tier: 3, label: 'Tier 3', threshold: 3000,  rate: 3 }
  ];
};

// ── Static: calculate tier for a client count given tiers array ──
AcaTierConfigSchema.statics.calcTierFromList = function (count, tiers) {
  // Sort tiers descending by threshold and find the first match
  const sorted = [...tiers].sort((a, b) => b.threshold - a.threshold);
  for (const t of sorted) {
    if (count >= t.threshold) {
      return { tier: t.tier, label: t.label, rate: t.rate, bonus: count * t.rate };
    }
  }
  // Shouldn't happen if tier 0 has threshold 0, but just in case
  return { tier: 0, label: 'Tier 0', rate: 0, bonus: 0 };
};

module.exports = mongoose.model('AcaTierConfig', AcaTierConfigSchema);
