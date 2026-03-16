const mongoose = require('mongoose');

const productTypeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    unique: true,
    trim: true
  },
  category: {
    type: String,
    enum: [
      'Life Insurance',
      'Health Insurance',
      'Medicare',
      'Supplemental Insurance',
      'Retirement / Annuities',
      'Property & Casualty - Personal',
      'Property & Casualty - Commercial'
    ],
    required: [true, 'Category is required']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

productTypeSchema.index({ isActive: 1 });
productTypeSchema.index({ category: 1 });

module.exports = mongoose.model('ProductType', productTypeSchema);
