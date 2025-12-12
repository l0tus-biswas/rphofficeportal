const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth.middleware');
const { validateRequest, schemas } = require('../middleware/validation.middleware');
const { logAction } = require('../middleware/audit.middleware');
const { sendResponse, errorResponse, paginate } = require('../utils/helpers');

// All routes require authentication as agent or admin
router.use(protect);
router.use(authorize('agent', 'admin'));

// @route   GET /api/agent/profile
// @desc    Get agent's own profile
// @access  Private (Agent/Admin)
router.get('/profile', async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password')
      .populate('referredBy', 'name email referralCode');
    
    sendResponse(res, 200, { user });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   PUT /api/agent/profile
// @desc    Update agent's own profile
// @access  Private (Agent/Admin)
router.put('/profile', validateRequest(schemas.updateProfile), logAction('UPDATE_PROFILE'), async (req, res) => {
  try {
    const { name, phone, address, city, state, zipCode, dateOfBirth } = req.body;
    
    const user = await User.findById(req.user._id);
    
    if (name) user.name = name;
    if (phone) user.phone = phone;
    if (address) user.address = address;
    if (city) user.city = city;
    if (state) user.state = state;
    if (zipCode) user.zipCode = zipCode;
    if (dateOfBirth) user.dateOfBirth = dateOfBirth;
    
    user.updatedBy = req.user._id;
    await user.save();
    
    sendResponse(res, 200, {
      message: 'Profile updated successfully',
      user: await User.findById(user._id).select('-password')
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/agent/change-password
// @desc    Change password
// @access  Private (Agent/Admin)
router.post('/change-password', validateRequest(schemas.changePassword), logAction('CHANGE_PASSWORD'), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    const user = await User.findById(req.user._id).select('+password');
    
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return sendResponse(res, 400, { message: 'Current password is incorrect' });
    }
    
    user.password = newPassword;
    await user.save();
    
    sendResponse(res, 200, {
      message: 'Password changed successfully'
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/agent/recruits
// @desc    Get first-level recruits (direct referrals only) with filters and stats
// @access  Private (Agent/Admin)
router.get('/recruits', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status; // 'active', 'inactive', or 'all'
    const search = req.query.search;
    const sortBy = req.query.sortBy || '-createdAt'; // '-createdAt', 'name', etc.
    
    // Build filter
    const filter = { referredBy: req.user._id };
    
    if (status === 'active') {
      filter.isActive = true;
    } else if (status === 'inactive') {
      filter.isActive = false;
    }
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }
    
    const query = User.find(filter)
      .select('-password')
      .populate('referredBy', 'name email')
      .sort(sortBy);
    
    const recruits = await paginate(query, page, limit);
    const total = await User.countDocuments(filter);
    
    // Get stats
    const totalRecruits = await User.countDocuments({ referredBy: req.user._id });
    const activeCount = await User.countDocuments({ referredBy: req.user._id, isActive: true });
    const inactiveCount = await User.countDocuments({ referredBy: req.user._id, isActive: false });
    
    sendResponse(res, 200, {
      recruits,
      stats: {
        total: totalRecruits,
        active: activeCount,
        inactive: inactiveCount,
        filtered: total
      },
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

// @route   GET /api/agent/downline
// @desc    Get agent's complete downline tree (genealogy) with stats
// @access  Private (Agent/Admin)
router.get('/downline', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const downlineTree = await user.getDownlineTree();
    
    // Calculate downline stats by level
    const calculateLevelStats = (node, level = 1, stats = {}) => {
      if (!node) return stats;
      
      if (!stats[level]) {
        stats[level] = { total: 0, active: 0, inactive: 0 };
      }
      
      stats[level].total++;
      if (node.isActive) {
        stats[level].active++;
      } else {
        stats[level].inactive++;
      }
      
      if (node.children && node.children.length > 0) {
        node.children.forEach(child => {
          calculateLevelStats(child, level + 1, stats);
        });
      }
      
      return stats;
    };
    
    const levelStats = downlineTree ? calculateLevelStats(downlineTree) : {};
    const totalMembers = Object.values(levelStats).reduce((sum, level) => sum + level.total, 0);
    const totalActive = Object.values(levelStats).reduce((sum, level) => sum + level.active, 0);
    
    sendResponse(res, 200, {
      downline: downlineTree,
      stats: {
        totalMembers,
        totalActive,
        totalInactive: totalMembers - totalActive,
        levels: Object.keys(levelStats).length,
        levelStats
      }
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/agent/stats
// @desc    Get agent's statistics
// @access  Private (Agent/Admin)
router.get('/stats', async (req, res) => {
  try {
    const directRecruits = await User.countDocuments({ referredBy: req.user._id });
    
    // Get all descendants count (recursive)
    const getDescendantsCount = async (userId) => {
      const children = await User.find({ referredBy: userId }).select('_id');
      let count = children.length;
      
      for (const child of children) {
        count += await getDescendantsCount(child._id);
      }
      
      return count;
    };
    
    const totalDownline = await getDescendantsCount(req.user._id);
    
    const activeRecruits = await User.countDocuments({ 
      referredBy: req.user._id, 
      isActive: true 
    });
    
    sendResponse(res, 200, {
      stats: {
        directRecruits,
        totalDownline,
        activeRecruits,
        inactiveRecruits: directRecruits - activeRecruits
      }
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/agent/referral-link
// @desc    Get agent's referral link
// @access  Private (Agent/Admin)
router.get('/referral-link', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user.referralCode) {
      user.referralCode = user.generateReferralCode();
      await user.save();
    }
    
    const referralLink = `${process.env.APP_URL}/apply?ref=${user.referralCode}`;
    
    sendResponse(res, 200, {
      referralCode: user.referralCode,
      referralLink
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

module.exports = router;
