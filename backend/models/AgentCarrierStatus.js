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
    enum: ['Requested', 'Appointed', 'Unappointed'],
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
  },
  unappointedAt: {
    type: Date
  },
  unappointedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  notes: [{
    text: { type: String, required: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    addedAt: { type: Date, default: Date.now }
  }]
}, {
  timestamps: true
});

// One record per agent-carrier combination
agentCarrierStatusSchema.index({ agent: 1, carrier: 1 }, { unique: true });
agentCarrierStatusSchema.index({ status: 1 });

module.exports = mongoose.model('AgentCarrierStatus', agentCarrierStatusSchema);
