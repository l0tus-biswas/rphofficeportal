const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  targetUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  details: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },
  ipAddress: String,
  userAgent: String,
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Index for querying
auditLogSchema.index({ performedBy: 1, timestamp: -1 });
auditLogSchema.index({ targetUser: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
