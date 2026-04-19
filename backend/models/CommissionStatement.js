const mongoose = require('mongoose');

const commissionNoteSchema = new mongoose.Schema({
  text: { type: String, required: true, trim: true },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  addedAt: { type: Date, default: Date.now }
}, { _id: true });

const commissionStatementSchema = new mongoose.Schema({
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // 6.2: Support multiple carriers (array). Legacy single 'carrier' field preserved for migration.
  carrier: {
    type: String,
    trim: true,
    default: ''
  },
  carriers: {
    type: [String],
    default: []
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
  },
  // 6.3: Notes per statement
  notes: {
    type: [commissionNoteSchema],
    default: []
  }
}, {
  timestamps: true
});

// Virtual: return carriers array, falling back to legacy single carrier field
commissionStatementSchema.virtual('carrierList').get(function () {
  if (this.carriers && this.carriers.length > 0) return this.carriers;
  if (this.carrier) return [this.carrier];
  return [];
});

commissionStatementSchema.set('toJSON', { virtuals: true });
commissionStatementSchema.set('toObject', { virtuals: true });

commissionStatementSchema.index({ agent: 1, payPeriod: -1 });
commissionStatementSchema.index({ agent: 1, carrier: 1 });

module.exports = mongoose.model('CommissionStatement', commissionStatementSchema);
