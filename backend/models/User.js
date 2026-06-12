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
  
  // Transfer tracking — when agent was last transferred to a new upline
  transferredAt: {
    type: Date,
    default: null
  },
  
  // Profile
  address: String,
  city: String,
  state: String,
  zipCode: String,
  dateOfBirth: Date,
  timezone: {
    type: String,
    default: null
  },
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  
  // Soft-delete
  deletedAt: {
    type: Date,
    default: null
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  // Password Reset
  resetPasswordToken: String,
  resetPasswordExpire: Date,

  // One-time auto-login token (for post-registration flows)
  autoLoginToken: String,
  autoLoginTokenExpire: Date,
  
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
    default: 0 // No setup fee in new onboarding flow
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
  
  // Billing Exempt: admin can mark users who should have free access without charges
  billingExempt: {
    type: Boolean,
    default: false
  },
  billingExemptReason: {
    type: String,
    default: null,
    trim: true
  },
  billingExemptSetBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  billingExemptSetAt: {
    type: Date,
    default: null
  },

  // Welcome message: tracks if user has dismissed the welcome popup
  welcomeMessageSeenAt: {
    type: Date,
    default: null
  },
  
  // Audit Fields (createdAt/updatedAt auto-managed by timestamps: true)
  lastLogin: Date,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // QuickBooks Online integration
  qboEmployeeId: {
    type: String,
    default: null
  },
  qboSyncedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Indexes (only compound indexes, unique indexes are defined in schema)
userSchema.index({ referredBy: 1 });
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ deletedAt: 1 });
userSchema.index({ email: 1 });

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
userSchema.pre('save', async function(next) {
  if (!this.referralCode) {
    // Retry up to 5 times in case of collision with existing codes
    const User = mongoose.model('User');
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = this.generateReferralCode();
      const existing = await User.findOne({ referralCode: code });
      if (!existing) {
        this.referralCode = code;
        return next();
      }
    }
    // Fallback: use timestamp-based code to guarantee uniqueness
    this.referralCode = `${this.role === 'admin' ? 'ADM' : 'AGT'}${Date.now().toString(36).toUpperCase().slice(-6)}`;
  }
  next();
});

// Sync denormalized agent data in ACAClientRecord when name or email changes
userSchema.pre('save', function(next) {
  this._nameOrEmailChanged = this.isModified('name') || this.isModified('email');
  next();
});

userSchema.post('save', async function(doc) {
  if (doc._nameOrEmailChanged) {
    try {
      const ACAClientRecord = mongoose.model('ACAClientRecord');
      await ACAClientRecord.syncAgentInfo(doc._id, doc.name, doc.email);
    } catch (err) {
      console.warn(`Failed to sync ACAClientRecord for user ${doc._id}: ${err.message}`);
    }
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate referral code
userSchema.methods.generateReferralCode = function() {
  let prefix = 'AGT'; // Default for agents
  if (this.role === 'admin') prefix = 'ADM';
  
  // Generate 6 random alphanumeric characters for sufficient uniqueness
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars like 0, O, 1, I
  let random = '';
  for (let i = 0; i < 6; i++) {
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

// Generate a one-time auto-login token (used after registration to auto-login the user)
userSchema.methods.getAutoLoginToken = function() {
  const token = crypto.randomBytes(32).toString('hex');

  this.autoLoginToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  this.autoLoginTokenExpire = Date.now() + 5 * 60 * 1000; // 5 minutes

  return token;
};

// Soft-delete user and cascade to related collections
userSchema.methods.softDelete = async function(deletedByUserId) {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const userId = this._id;
    const now = new Date();
    
    // 1. Mark user as soft-deleted
    this.deletedAt = now;
    this.deletedBy = deletedByUserId;
    this.isActive = false;
    this.paymentAccessEnabled = false;
    await this.save({ session });
    
    // 2. Cancel Stripe subscription if exists
    const Subscription = mongoose.model('Subscription');
    const subscription = await Subscription.findOne({ user: userId }).session(session);
    if (subscription?.stripeSubscriptionId) {
      try {
        const { cancelSubscription } = require('../utils/stripe');
        await cancelSubscription(subscription.stripeSubscriptionId);
        subscription.status = 'canceled';
        subscription.canceledAt = now;
        await subscription.save({ session });
      } catch (stripeError) {
        console.warn(`Failed to cancel Stripe subscription during soft-delete: ${stripeError.message}`);
      }
    }
    
    // 3. Cascade soft-delete to related collections
    const cascadeModels = [
      { model: 'Payment', field: 'user' },
      { model: 'Subscription', field: 'user' },
      { model: 'Notification', field: 'userId' },
      { model: 'LicensingProgress', field: 'agent' },
      { model: 'ProductionSubmission', field: 'agent' },
      { model: 'OnboardingDocument', field: 'agent' },
      { model: 'AgentCarrierStatus', field: 'agent' },
      { model: 'ExamFXProgress', field: 'agent' },
      { model: 'NotificationPreference', field: 'userId' },
    ];
    
    for (const { model, field } of cascadeModels) {
      try {
        const Model = mongoose.model(model);
        await Model.updateMany(
          { [field]: userId, deletedAt: null },
          { $set: { deletedAt: now, deletedBy: deletedByUserId } },
          { session }
        );
      } catch (err) {
        // Model may not have deletedAt field yet — skip gracefully
        console.warn(`Cascade soft-delete skipped for ${model}: ${err.message}`);
      }
    }
    
    // 4. Soft-delete Onboarding record
    const Onboarding = mongoose.model('Onboarding');
    await Onboarding.updateMany(
      { user: userId, deletedAt: null },
      { $set: { deletedAt: now, deletedBy: deletedByUserId } },
      { session }
    );
    
    // 5. Soft-delete APA Applications
    const APAApplication = mongoose.model('APAApplication');
    await APAApplication.updateMany(
      { $or: [{ userId: userId }, { 'personalInfo.email': this.email?.toLowerCase() }], deletedAt: null },
      { $set: { deletedAt: now, deletedBy: deletedByUserId } },
      { session }
    );
    
    // 6. Remove from parent's children cache
    if (this.referredBy) {
      await mongoose.model('User').updateOne(
        { _id: this.referredBy },
        { $pull: { children: userId } },
        { session }
      );
    }
    
    await session.commitTransaction();
    return { success: true, deletedAt: now };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

// Restore a soft-deleted user and cascade restore
userSchema.methods.restore = async function(restoredByUserId) {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const userId = this._id;
    const deletedAt = this.deletedAt;
    
    if (!deletedAt) {
      throw new Error('User is not soft-deleted');
    }
    
    // 1. Restore user
    this.deletedAt = null;
    this.deletedBy = null;
    this.isActive = true;
    this.updatedBy = restoredByUserId;
    await this.save({ session });
    
    // 2. Cascade restore related collections (only those deleted at the same time)
    const cascadeModels = [
      { model: 'Payment', field: 'user' },
      { model: 'Subscription', field: 'user' },
      { model: 'Notification', field: 'userId' },
      { model: 'LicensingProgress', field: 'agent' },
      { model: 'ProductionSubmission', field: 'agent' },
      { model: 'OnboardingDocument', field: 'agent' },
      { model: 'AgentCarrierStatus', field: 'agent' },
      { model: 'ExamFXProgress', field: 'agent' },
      { model: 'NotificationPreference', field: 'userId' },
    ];
    
    for (const { model, field } of cascadeModels) {
      try {
        const Model = mongoose.model(model);
        await Model.updateMany(
          { [field]: userId, deletedAt: deletedAt },
          { $set: { deletedAt: null, deletedBy: null } },
          { session }
        );
      } catch (err) {
        console.warn(`Cascade restore skipped for ${model}: ${err.message}`);
      }
    }
    
    // 3. Restore Onboarding
    const Onboarding = mongoose.model('Onboarding');
    await Onboarding.updateMany(
      { user: userId, deletedAt: deletedAt },
      { $set: { deletedAt: null, deletedBy: null } },
      { session }
    );
    
    // 4. Restore APA Applications
    const APAApplication = mongoose.model('APAApplication');
    await APAApplication.updateMany(
      { $or: [{ userId: userId }, { 'personalInfo.email': this.email?.toLowerCase() }], deletedAt: deletedAt },
      { $set: { deletedAt: null, deletedBy: null } },
      { session }
    );
    
    // 5. Re-add to parent's children cache
    if (this.referredBy) {
      await mongoose.model('User').updateOne(
        { _id: this.referredBy },
        { $addToSet: { children: userId } },
        { session }
      );
    }
    
    await session.commitTransaction();
    return { success: true };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
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
        _id: { $nin: Array.from(visited) },
        deletedAt: null
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
  const users = await this.find({ role: { $in: ['admin', 'agent'] }, referredBy: null, deletedAt: null })
    .select('_id name email role referralCode isActive createdAt')
    .lean();
  
  const buildTree = async (userId) => {
    const children = await this.find({ referredBy: userId, deletedAt: null })
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
