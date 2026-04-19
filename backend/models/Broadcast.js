const mongoose = require('mongoose');

const broadcastSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Broadcast title is required'],
    trim: true
  },
  message: {
    type: String,
    required: [true, 'Broadcast message is required'],
    trim: true
  },
  link: {
    type: String,
    default: null,
    trim: true
  },
  targetRoles: {
    type: [String],
    enum: ['admin', 'agent'],
    default: []
  },
  sentCount: {
    type: Number,
    default: 0
  },
  emailsSent: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

broadcastSchema.index({ isActive: 1, createdAt: -1 });

module.exports = mongoose.model('Broadcast', broadcastSchema);
