const mongoose = require('mongoose');

const trainingMaterialSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  type: {
    type: String,
    enum: ['link', 'youtube', 'loom', 'document', 'video', 'article', 'other'],
    required: true
  },
  url: {
    type: String,
    trim: true,
    default: ''
  },
  category: {
    type: String,
    default: 'general'
  },
  folder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TrainingFolder',
    default: null
  },
  tags: [String],
  duration: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  order: {
    type: Number,
    default: 0
  },
  thumbnail: String,
  
  // PDF Attachment (legacy single-file field, kept for materials created before
  // multi-attachment support — new uploads go into pdfAttachments below)
  pdfAttachment: {
    fileName: { type: String },
    filePath: { type: String },
    uploadedAt: { type: Date, default: Date.now }
  },

  // PDF Attachments (multiple)
  pdfAttachments: [{
    fileName: { type: String, required: true },
    filePath: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now }
  }],

  // Access control
  accessLevel: {
    type: String,
    enum: ['all', 'agent', 'recruit'],
    default: 'all'
  },
  
  // Audit
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
trainingMaterialSchema.index({ isActive: 1, order: 1 });
trainingMaterialSchema.index({ category: 1 });
trainingMaterialSchema.index({ folder: 1, isActive: 1 });

module.exports = mongoose.model('TrainingMaterial', trainingMaterialSchema);
