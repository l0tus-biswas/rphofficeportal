const mongoose = require('mongoose');

const agentCarrierStatusSchema = new mongoose.Schema({
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  carrier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Carrier',
    required: true
  },
  status: {
    type: String,
    enum: ['Requested', 'Appointed'],
    default: 'Requested'
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  appointedAt: {
    type: Date
  },
  appointedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// One record per agent-carrier combination
agentCarrierStatusSchema.index({ agent: 1, carrier: 1 }, { unique: true });
agentCarrierStatusSchema.index({ status: 1 });

module.exports = mongoose.model('AgentCarrierStatus', agentCarrierStatusSchema);
