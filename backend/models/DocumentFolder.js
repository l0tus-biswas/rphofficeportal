const mongoose = require('mongoose');

const documentFolderSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Folder name is required'],
    trim: true
  },
  // Self-referencing parent for subfolder hierarchy
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DocumentFolder',
    default: null
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
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

documentFolderSchema.index({ parent: 1, sortOrder: 1 });
documentFolderSchema.index({ name: 1, parent: 1 }, { unique: true });

module.exports = mongoose.model('DocumentFolder', documentFolderSchema);
