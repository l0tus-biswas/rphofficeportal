const mongoose = require('mongoose');

const carrierSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Carrier name is required'],
    trim: true,
    unique: true
  },
  
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Optional additional info
  contactInfo: {
    phone: String,
    email: String,
    website: String
  },
  
  notes: {
    type: String,
    default: ''
  },
  
  // Track who added/modified
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index for quick lookups
carrierSchema.index({ name: 1 });
carrierSchema.index({ isActive: 1 });

module.exports = mongoose.model('Carrier', carrierSchema);
