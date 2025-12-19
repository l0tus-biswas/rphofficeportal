const express = require('express');
const router = express.Router();
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { protect, authorize } = require('../middleware/auth.middleware');
const { validateRequest, schemas } = require('../middleware/validation.middleware');
const { logAction } = require('../middleware/audit.middleware');
const { sendWelcomeEmail } = require('../utils/email');
const { generatePassword, sendResponse, errorResponse, paginate } = require('../utils/helpers');

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

module.exports = router;
