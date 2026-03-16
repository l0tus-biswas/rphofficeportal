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
    required: [true, 'URL is required'],
    trim: true
  },
  category: {
    type: String,
    default: 'general'
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
  
  // PDF Attachment
  pdfAttachment: {
    fileName: { type: String },
    filePath: { type: String },
    uploadedAt: { type: Date, default: Date.now }
  },

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

module.exports = mongoose.model('TrainingMaterial', trainingMaterialSchema);
