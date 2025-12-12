const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  // Basic Info
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
  },
  phone: {
    type: String,
    required: [true, 'Phone is required'],
    trim: true
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6,
    select: false
  },
  
  // Role-based
  role: {
    type: String,
    enum: ['admin', 'agent'],
    default: 'agent'
  },
  
  // Referral System
  referralCode: {
    type: String,
    unique: true,
    sparse: true
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  // Genealogy - Cache for performance
  children: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Profile
  address: String,
  city: String,
  state: String,
  zipCode: String,
  dateOfBirth: Date,
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  
  // Password Reset
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  
  // Metadata (from apply form)
  metadata: {
    type: Map,
    of: String
  },
  
  // Onboarding tracking
  onboardingStatus: {
    type: String,
    enum: ['not-started', 'pending', 'approved', 'rejected', 'missing'],
    default: 'not-started'
  },
  onboarding: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Onboarding',
    default: null
  },
  onboardingSubmittedAt: Date,
  onboardingApprovedAt: Date,
  
  // Audit Fields
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  lastLogin: Date,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes (only compound indexes, unique indexes are defined in schema)
userSchema.index({ referredBy: 1 });
userSchema.index({ role: 1, isActive: 1 });

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Generate referral code for all users
userSchema.pre('save', function(next) {
  if (!this.referralCode) {
    this.referralCode = this.generateReferralCode();
  }
  next();
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate referral code
userSchema.methods.generateReferralCode = function() {
  let prefix = 'AGT'; // Default for agents
  if (this.role === 'admin') prefix = 'ADM';
  
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}${random}`;
};

// Generate password reset token
userSchema.methods.getResetPasswordToken = function() {
  const resetToken = crypto.randomBytes(20).toString('hex');
  
  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  
  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
  
  return resetToken;
};

// Get downline tree (recursive)
userSchema.methods.getDownlineTree = async function() {
  const User = mongoose.model('User');
  
  const buildTree = async (userId) => {
    const user = await User.findById(userId)
      .select('name email role referralCode isActive createdAt')
      .lean();
    
    if (!user) return null;
    
    const children = await User.find({ referredBy: userId })
      .select('_id name email role referralCode isActive createdAt')
      .lean();
    
    user.children = await Promise.all(
      children.map(child => buildTree(child._id))
    );
    
    return user;
  };
  
  return await buildTree(this._id);
};

// Static method to get full hierarchy for admin
userSchema.statics.getFullHierarchy = async function() {
  const users = await this.find({ role: { $in: ['admin', 'agent'] }, referredBy: null })
    .select('_id name email role referralCode isActive createdAt')
    .lean();
  
  const buildTree = async (userId) => {
    const children = await this.find({ referredBy: userId })
      .select('_id name email role referralCode isActive createdAt')
      .lean();
    
    return await Promise.all(
      children.map(async (child) => ({
        ...child,
        children: await buildTree(child._id)
      }))
    );
  };
  
  return await Promise.all(
    users.map(async (user) => ({
      ...user,
      children: await buildTree(user._id)
    }))
  );
};

module.exports = mongoose.model('User', userSchema);
