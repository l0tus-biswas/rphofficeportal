const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Onboarding = require('../models/Onboarding');
const AuditLog = require('../models/AuditLog');
const Payment = require('../models/Payment');
const Subscription = require('../models/Subscription');
const { protect, authorize } = require('../middleware/auth.middleware');
const { validateRequest, schemas } = require('../middleware/validation.middleware');
const { logAction } = require('../middleware/audit.middleware');
const { sendWelcomeEmail } = require('../utils/email');
const { generatePassword, sendResponse, errorResponse, paginate } = require('../utils/helpers');
const { cancelSubscription } = require('../utils/stripe');
const path = require('path');
const fs = require('fs');
const { ONBOARDING_ROOT } = require('../utils/storage');

// All routes require admin authentication
router.use(protect);
router.use(authorize('admin'));

// @route   GET /api/admin/hierarchy
// @desc    Get full user hierarchy (all agents and their downlines)
// @access  Private (Admin only)
router.get('/hierarchy', async (req, res) => {
  try {
    const hierarchy = await User.getFullHierarchy();
    
    sendResponse(res, 200, {
      hierarchy
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/admin/users
// @desc    Get all users with filters and pagination
// @access  Private (Admin only)
router.get('/users', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const role = req.query.role;
    const isActive = req.query.isActive;
    const search = req.query.search;
    
    const filter = {};
    if (role) filter.role = role;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }
    
    const query = User.find(filter)
      .select('-password')
      .populate('referredBy', 'name email referralCode')
      .sort('-createdAt');
    
    const users = await paginate(query, page, limit);
    const total = await User.countDocuments(filter);
    
    sendResponse(res, 200, {
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/admin/users/:userId
// @desc    Get single user details
// @access  Private (Admin only)
router.get('/users/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('-password')
      .populate('referredBy', 'name email referralCode')
      .populate('children', 'name email role isActive createdAt');
    
    if (!user) {
      return sendResponse(res, 404, { message: 'User not found' });
    }
    
    // Get user's downline tree
    const downline = await user.getDownlineTree();
    
    sendResponse(res, 200, {
      user,
      downline
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/admin/users
// @desc    Create new user (admin/agent/recruit)
// @access  Private (Admin only)
router.post('/users', validateRequest(schemas.createUser), logAction('CREATE_USER'), async (req, res) => {
  try {
    const { name, email, phone, role, password } = req.body;
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return sendResponse(res, 400, { message: 'Email already exists' });
    }
    
    const userPassword = password || generatePassword(10);
    
    const newUser = await User.create({
      name,
      email,
      phone,
      role,
      password: userPassword,
      isActive: true,
      createdBy: req.user._id
    });
    
    // Send welcome email
    try {
      await sendWelcomeEmail(newUser, userPassword, null);
    } catch (emailError) {
      console.error('Email failed:', emailError);
    }
    
    sendResponse(res, 201, {
      message: 'User created successfully',
      user: await User.findById(newUser._id).select('-password')
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   PUT /api/admin/users/:userId
// @desc    Update user details
// @access  Private (Admin only)
router.put('/users/:userId', validateRequest(schemas.updateUser), logAction('UPDATE_USER'), async (req, res) => {
  try {
    const { name, phone, role, isActive } = req.body;
    
    const user = await User.findById(req.params.userId);
    
    if (!user) {
      return sendResponse(res, 404, { message: 'User not found' });
    }
    
    if (name) user.name = name;
    if (phone) user.phone = phone;
    if (role) user.role = role;
    if (isActive !== undefined) user.isActive = isActive;
    
    user.updatedBy = req.user._id;
    await user.save();
    
    sendResponse(res, 200, {
      message: 'User updated successfully',
      user: await User.findById(user._id).select('-password')
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   PUT /api/admin/users/:userId/activate
// @desc    Activate user
// @access  Private (Admin only)
router.put('/users/:userId/activate', logAction('ACTIVATE_USER'), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    
    if (!user) {
      return sendResponse(res, 404, { message: 'User not found' });
    }
    
    user.isActive = true;
    user.updatedBy = req.user._id;
    await user.save();
    
    sendResponse(res, 200, {
      message: 'User activated successfully',
      user: await User.findById(user._id).select('-password')
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   PUT /api/admin/users/:userId/deactivate
// @desc    Deactivate user
// @access  Private (Admin only)
router.put('/users/:userId/deactivate', logAction('DEACTIVATE_USER'), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    
    if (!user) {
      return sendResponse(res, 404, { message: 'User not found' });
    }
    
    user.isActive = false;
    user.updatedBy = req.user._id;
    await user.save();
    
    sendResponse(res, 200, {
      message: 'User deactivated successfully',
      user: await User.findById(user._id).select('-password')
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   PUT /api/admin/users/:userId/promote
// @desc    Promote/demote agent to new level
// @access  Private (Admin only)
router.put('/users/:userId/promote', logAction('PROMOTE_AGENT'), async (req, res) => {
  try {
    const { level } = req.body;
    
    const validLevels = [
      'associate',
      'senior associate',
      'field manager',
      'senior manager',
      'division executive',
      'regional executive',
      'national executive'
    ];
    
    if (!level || !validLevels.includes(level)) {
      return sendResponse(res, 400, { 
        message: 'Invalid level. Must be one of: ' + validLevels.join(', ') 
      });
    }
    
    const user = await User.findById(req.params.userId);
    
    if (!user) {
      return sendResponse(res, 404, { message: 'User not found' });
    }
    
    if (user.role !== 'agent') {
      return sendResponse(res, 400, { message: 'Can only promote/demote agents' });
    }
    
    const oldLevel = user.level;
    user.level = level;
    user.promotedAt = Date.now();
    user.promotedBy = req.user._id;
    await user.save();
    
    sendResponse(res, 200, {
      message: `Agent level changed from ${oldLevel} to ${level}`,
      user: await User.findById(user._id).select('-password').populate('promotedBy', 'name')
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   DELETE /api/admin/users/:userId
// @desc    Delete user (hard delete)
// @access  Private (Admin only)
router.delete('/users/:userId', logAction('DELETE_USER'), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    
    if (!user) {
      return sendResponse(res, 404, { message: 'User not found' });
    }
    
    // Hard delete - permanently remove user
    await User.findByIdAndDelete(req.params.userId);
    
    sendResponse(res, 200, {
      message: 'User deleted successfully'
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   DELETE /api/admin/onboarding/:userId
// @desc    Delete onboarding record for a user
// @access  Private (Admin only)
router.delete('/onboarding/:userId', logAction('DELETE_ONBOARDING'), async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Validate userId
    if (!userId || userId === 'null' || userId === 'undefined') {
      return sendResponse(res, 400, { message: 'Invalid user ID' });
    }
    
    // Find the onboarding record (using 'user' field, not 'userId')
    const onboarding = await Onboarding.findOne({ user: userId });
    
    if (!onboarding) {
      return sendResponse(res, 404, { message: 'Onboarding record not found' });
    }
    
    // Delete all uploaded files for this user
    const userOnboardingDir = path.join(ONBOARDING_ROOT, userId.toString());
    try {
      if (fs.existsSync(userOnboardingDir)) {
        await fs.promises.rm(userOnboardingDir, { recursive: true, force: true });
      }
    } catch (fileError) {
      console.warn(`Failed to delete onboarding files for user ${userId}:`, fileError.message);
    }
    
    // Delete the onboarding record
    await Onboarding.findByIdAndDelete(onboarding._id);
    
    // Update user's onboarding references
    await User.findByIdAndUpdate(userId, {
      $unset: {
        onboarding: 1,
        onboardingStatus: 1,
        onboardingSubmittedAt: 1,
        onboardingApprovedAt: 1
      }
    });
    
    sendResponse(res, 200, {
      message: 'Onboarding record deleted successfully. User will need to upload documents again.'
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/admin/stats
// @desc    Get admin dashboard statistics
// @access  Private (Admin only)
router.get('/stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalAdmins = await User.countDocuments({ role: 'admin' });
    const totalAgents = await User.countDocuments({ role: 'agent' });
    const activeUsers = await User.countDocuments({ isActive: true });
    const inactiveUsers = await User.countDocuments({ isActive: false });
    
    // Users created in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentUsers = await User.countDocuments({ 
      createdAt: { $gte: thirtyDaysAgo } 
    });
    
    sendResponse(res, 200, {
      stats: {
        totalUsers,
        totalAdmins,
        totalAgents,
        activeUsers,
        inactiveUsers,
        recentUsers
      }
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/admin/audit-logs
// @desc    Get audit logs
// @access  Private (Admin only)
router.get('/audit-logs', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const action = req.query.action;
    const userId = req.query.userId;
    
    const filter = {};
    if (action) filter.action = action;
    if (userId) filter.performedBy = userId;
    
    const query = AuditLog.find(filter)
      .populate('performedBy', 'name email role')
      .populate('targetUser', 'name email role')
      .sort('-timestamp');
    
    const logs = await paginate(query, page, limit);
    const total = await AuditLog.countDocuments(filter);
    
    sendResponse(res, 200, {
      logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/admin/payments
// @desc    Get all payments with filters and pagination
// @access  Private (Admin only)
router.get('/payments', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const type = req.query.type; // one-time or subscription
    const status = req.query.status;
    const userId = req.query.userId;

    const filter = {};
    if (type) filter.type = type;
    if (status) filter.status = status;
    if (userId) filter.user = userId;

    const query = Payment.find(filter)
      .populate('user', 'name email role')
      .sort('-createdAt');

    const payments = await paginate(query, page, limit);
    const total = await Payment.countDocuments(filter);

    // Calculate stats
    const stats = await Payment.aggregate([
      { $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' }
      }}
    ]);

    sendResponse(res, 200, {
      payments,
      stats,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/admin/subscriptions
// @desc    Get all subscriptions with filters and pagination
// @access  Private (Admin only)
router.get('/subscriptions', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const status = req.query.status;

    const filter = {};
    if (status) filter.status = status;

    const query = Subscription.find(filter)
      .populate('user', 'name email role paymentAccessEnabled')
      .sort('-createdAt');

    const subscriptions = await paginate(query, page, limit);
    const total = await Subscription.countDocuments(filter);

    // Calculate stats
    const stats = await Subscription.aggregate([
      { $group: {
        _id: '$status',
        count: { $sum: 1 }
      }}
    ]);

    sendResponse(res, 200, {
      subscriptions,
      stats,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/admin/payments/:userId/enable-access
// @desc    Manually enable payment access for user
// @access  Private (Admin only)
router.post('/payments/:userId/enable-access', logAction('ENABLE_PAYMENT_ACCESS'), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    
    if (!user) {
      return sendResponse(res, 404, { message: 'User not found' });
    }

    user.paymentAccessEnabled = true;
    await user.save();

    sendResponse(res, 200, {
      message: 'Payment access enabled successfully',
      user: {
        _id: user._id,
        name: user.name,
        paymentAccessEnabled: user.paymentAccessEnabled
      }
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/admin/payments/:userId/disable-access
// @desc    Manually disable payment access for user
// @access  Private (Admin only)
router.post('/payments/:userId/disable-access', logAction('DISABLE_PAYMENT_ACCESS'), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    
    if (!user) {
      return sendResponse(res, 404, { message: 'User not found' });
    }

    user.paymentAccessEnabled = false;
    await user.save();

    sendResponse(res, 200, {
      message: 'Payment access disabled successfully',
      user: {
        _id: user._id,
        name: user.name,
        paymentAccessEnabled: user.paymentAccessEnabled
      }
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/admin/subscriptions/:userId/cancel
// @desc    Cancel user subscription
// @access  Private (Admin only)
router.post('/subscriptions/:userId/cancel', logAction('CANCEL_SUBSCRIPTION'), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    
    if (!user) {
      return sendResponse(res, 404, { message: 'User not found' });
    }

    if (!user.stripeSubscriptionId) {
      return sendResponse(res, 404, { message: 'No active subscription found' });
    }

    // Cancel in Stripe
    const stripeSubscription = await cancelSubscription(user.stripeSubscriptionId);

    // Update local subscription record
    const subscription = await Subscription.findOne({ 
      stripeSubscriptionId: user.stripeSubscriptionId 
    });
    
    if (subscription) {
      subscription.status = 'canceled';
      subscription.canceledAt = new Date();
      subscription.endedAt = new Date();
      await subscription.save();
    }

    // Update user
    user.subscriptionStatus = 'canceled';
    user.paymentAccessEnabled = false;
    await user.save();

    sendResponse(res, 200, {
      message: 'Subscription canceled successfully',
      subscription: stripeSubscription
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/admin/payment-settings
// @desc    Get payment settings (one-time fee, monthly fee)
// @access  Private (Admin only)
router.get('/payment-settings', async (req, res) => {
  try {
    sendResponse(res, 200, {
      oneTimePrice: parseInt(process.env.STRIPE_ONE_TIME_PRICE) || 17900,
      monthlyPrice: parseInt(process.env.STRIPE_MONTHLY_SUBSCRIPTION_PRICE) || 2500,
      monthlyPriceId: process.env.STRIPE_MONTHLY_PRICE_ID || '',
      stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || ''
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

module.exports = router;
