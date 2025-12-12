const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  discountType: {
    type: String,
    enum: ['percentage', 'fixed'],
    required: true
  },
  discountValue: {
    type: Number,
    required: true,
    min: 0
  },
  minPurchaseAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  maxDiscountAmount: {
    type: Number,
    min: 0
  },
  validFrom: {
    type: Date,
    required: true,
    default: Date.now
  },
  validUntil: {
    type: Date,
    required: true
  },
  usageLimit: {
    type: Number,
    min: 0,
    default: null // null means unlimited
  },
  usageCount: {
    type: Number,
    default: 0,
    min: 0
  },
  userUsageLimit: {
    type: Number,
    min: 1,
    default: 1 // How many times one user can use this coupon
  },
  applicableRoles: [{
    type: String,
    enum: ['admin', 'agent']
  }],
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

// Virtual to check if coupon is valid
couponSchema.virtual('isValid').get(function() {
  const now = new Date();
  return this.isActive && 
         now >= this.validFrom && 
         now <= this.validUntil &&
         (this.usageLimit === null || this.usageCount < this.usageLimit);
});

// Method to check if user can use this coupon
couponSchema.methods.canUserUse = function(userRole) {
  if (!this.isValid) return false;
  if (this.applicableRoles.length === 0) return true;
  return this.applicableRoles.includes(userRole);
};

// Method to apply coupon and calculate discount
couponSchema.methods.calculateDiscount = function(purchaseAmount) {
  if (purchaseAmount < this.minPurchaseAmount) {
    return { 
      valid: false, 
      message: `Minimum purchase amount of $${this.minPurchaseAmount} required` 
    };
  }

  let discount = 0;
  if (this.discountType === 'percentage') {
    discount = (purchaseAmount * this.discountValue) / 100;
    if (this.maxDiscountAmount && discount > this.maxDiscountAmount) {
      discount = this.maxDiscountAmount;
    }
  } else {
    discount = this.discountValue;
  }

  return {
    valid: true,
    discount: Math.min(discount, purchaseAmount),
    finalAmount: purchaseAmount - Math.min(discount, purchaseAmount)
  };
};

// Method to increment usage count
couponSchema.methods.incrementUsage = async function() {
  this.usageCount += 1;
  return await this.save();
};

module.exports = mongoose.model('Coupon', couponSchema);
