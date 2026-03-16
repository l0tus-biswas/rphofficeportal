const mongoose = require('mongoose');

const ACAClientRecordSchema = new mongoose.Schema({
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  agentName: {
    type: String,
    trim: true
  },
  agentEmail: {
    type: String,
    trim: true,
    lowercase: true
  },
  clientCount: {
    type: Number,
    required: true,
    min: 0
  },
  verifiedPremium: {
    type: Number,
    default: 0,
    min: 0
  },
  isProducing: {
    type: Boolean,
    default: true
  },
  uploadBatch: {
    type: String,        // e.g. '2026-03' (YYYY-MM) or free text like 'March 2026'
    required: true,
    index: true
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  source: {
    type: String,
    default: 'csv'
  }
});

// Compound index: one record per agent per batch
ACAClientRecordSchema.index({ agent: 1, uploadBatch: 1 }, { unique: true });

module.exports = mongoose.model('ACAClientRecord', ACAClientRecordSchema);
