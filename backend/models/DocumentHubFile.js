const mongoose = require('mongoose');

const documentHubFileSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'File name is required'],
    trim: true
  },
  folder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DocumentFolder',
    default: null  // null = root level
  },
  filePath: {
    type: String,
    required: true
  },
  originalFileName: {
    type: String,
    required: true
  },
  mimeType: {
    type: String,
    default: ''
  },
  fileSize: {
    type: Number,
    default: 0
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  notes: {
    type: String,
    trim: true,
    default: ''
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Visibility: 'all' (everyone), 'admin' (admin only), 'restricted' (specific agents only)
  visibility: {
    type: String,
    enum: ['all', 'admin', 'restricted'],
    default: 'all'
  },
  // When visibility='restricted', only these users (+ admin) can see/download
  restrictedTo: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  sortOrder: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

documentHubFileSchema.index({ folder: 1, isActive: 1 });
documentHubFileSchema.index({ name: 'text', description: 'text' });

module.exports = mongoose.model('DocumentHubFile', documentHubFileSchema);
