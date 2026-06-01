const mongoose = require('mongoose');

const configSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  category: {
    type: String,
    enum: ['database', 'server', 'email', 'jwt', 'application', 'general', 'other'],
    default: 'other'
  },
  description: {
    type: String,
    trim: true
  },
  isSecret: {
    type: Boolean,
    default: false
  },
  isEditable: {
    type: Boolean,
    default: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index for faster queries
configSchema.index({ category: 1 });

module.exports = mongoose.model('SystemConfig', configSchema);
