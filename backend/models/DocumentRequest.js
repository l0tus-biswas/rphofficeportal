const mongoose = require('mongoose');

const documentRequestSchema = new mongoose.Schema({
  // Admin who created the request
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Agent(s) the request targets
  requestedFrom: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  title: {
    type: String,
    required: [true, 'Request title is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  dueDate: {
    type: Date,
    default: null
  },
  // Folder where approved files are saved
  saveToFolder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DocumentFolder',
    default: null
  },
  // Per-agent response tracking
  responses: [{
    agent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'submitted', 'approved', 'rejected'],
      default: 'pending'
    },
    filePath: String,
    originalFileName: String,
    submittedAt: Date,
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reviewedAt: Date,
    reviewNotes: String
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

documentRequestSchema.index({ 'requestedFrom': 1 });
documentRequestSchema.index({ 'responses.agent': 1, 'responses.status': 1 });
documentRequestSchema.index({ requestedBy: 1, createdAt: -1 });

module.exports = mongoose.model('DocumentRequest', documentRequestSchema);
