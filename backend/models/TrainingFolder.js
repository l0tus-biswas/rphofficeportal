const mongoose = require('mongoose');

const trainingFolderSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Folder name is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  thumbnail: {
    type: String,
    default: null
  },
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TrainingFolder',
    default: null
  },
  order: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

trainingFolderSchema.index({ parent: 1, isActive: 1, order: 1 });
trainingFolderSchema.index({ name: 1, parent: 1 });

module.exports = mongoose.model('TrainingFolder', trainingFolderSchema);
