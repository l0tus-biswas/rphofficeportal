const mongoose = require('mongoose');

const commissionStatementSchema = new mongoose.Schema({
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Plain string — no FK needed, carrier names can change/be informal on statements
  carrier: {
    type: String,
    required: true,
    trim: true
  },
  // The week-ending or pay-period date
  payPeriod: {
    type: Date,
    required: true
  },
  filePath: {
    type: String,
    required: true
  },
  originalFileName: {
    type: String
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

commissionStatementSchema.index({ agent: 1, payPeriod: -1 });
commissionStatementSchema.index({ agent: 1, carrier: 1 });

module.exports = mongoose.model('CommissionStatement', commissionStatementSchema);
