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
  
  // Agent Level/Rank
  level: {
    type: String,
    enum: [
      'associate',
      'senior associate',
      'field manager',
      'senior manager',
      'division executive',
      'regional executive',
      'national executive'
    ],
    default: 'associate'
  },
  promotedAt: Date,
  promotedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
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
  
  // Payment & Subscription
  oneTimePaymentCompleted: {
    type: Boolean,
    default: false
  },
  oneTimePaymentAmount: {
    type: Number,
    default: 17900 // $179 in cents
  },
  oneTimePaymentDate: Date,
  stripeCustomerId: {
    type: String,
    sparse: true
  },
  stripeSubscriptionId: {
    type: String,
    sparse: true
  },
  subscriptionStatus: {
    type: String,
    enum: ['none', 'active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'trialing', 'unpaid'],
    default: 'none'
  },
  subscriptionStartDate: Date,
  nextBillingDate: Date,
  lastPaymentDate: Date,
  paymentAccessEnabled: {
    type: Boolean,
    default: false
  },
  
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
  
  // Generate 2 random alphanumeric characters (mix of letters and numbers) for total of 5
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars like 0, O, 1, I
  let random = '';
  for (let i = 0; i < 2; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
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
  
  // Fetch all descendants at once to avoid N+1 queries
  const getAllDescendants = async (rootId) => {
    const allUsers = [];
    const queue = [rootId];
    const visited = new Set();
    
    while (queue.length > 0) {
      const currentIds = [...queue];
      queue.length = 0;
      
      const users = await User.find({ 
        referredBy: { $in: currentIds },
        _id: { $nin: Array.from(visited) }
      })
      .select('_id name email role referralCode isActive createdAt referredBy')
      .lean();
      
      users.forEach(user => {
        if (!visited.has(user._id.toString())) {
          visited.add(user._id.toString());
          allUsers.push(user);
          queue.push(user._id);
        }
      });
    }
    
    return allUsers;
  };
  
  // Get all descendants
  const descendants = await getAllDescendants(this._id);
  
  // Build tree structure from flat list
  const buildTree = (userId, usersMap) => {
    const children = descendants.filter(u => u.referredBy && u.referredBy.toString() === userId.toString());
    return children.map(child => ({
      ...child,
      children: buildTree(child._id, usersMap)
    }));
  };
  
  // Get root user
  const rootUser = await User.findById(this._id)
    .select('_id name email role referralCode isActive createdAt')
    .lean();
  
  if (!rootUser) return null;
  
  // Build tree
  rootUser.children = buildTree(this._id, descendants);
  
  return rootUser;
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
