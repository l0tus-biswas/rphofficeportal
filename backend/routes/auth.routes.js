const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Notification = require('../models/Notification');
const { validateRequest, schemas } = require('../middleware/validation.middleware');
const { authLimiter, resetLimiter } = require('../middleware/rateLimiter.middleware');
const { sendPasswordResetEmail } = require('../utils/email');
const { generateToken, sendResponse, errorResponse } = require('../utils/helpers');
const crypto = require('crypto');

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', authLimiter, validateRequest(schemas.login), async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email }).select('+password');
    
    if (!user) {
      return sendResponse(res, 401, { message: 'Invalid credentials' });
    }
    
    if (!user.isActive) {
      return sendResponse(res, 403, { message: 'Account is deactivated. Please contact support.' });
    }
    
    const isMatch = await user.comparePassword(password);
    
    if (!isMatch) {
      return sendResponse(res, 401, { message: 'Invalid credentials' });
    }
    
    // Update last login
    user.lastLogin = Date.now();
    await user.save();
    
    const token = generateToken(user, process.env.JWT_SECRET, process.env.JWT_EXPIRE);
    
    // Get full user object without password
    const userResponse = await User.findById(user._id)
      .select('-password')
      .populate('referredBy', 'name email phone referralCode');

    // Login notification – awaited so it exists before the frontend fetches unread count
    try {
      await Notification.createNotification({
        userId: user._id,
        type: 'login',
        title: 'New Login',
        message: `You logged in on ${new Date().toLocaleString()}`,
        link: '/dashboard'
      }, false);
    } catch (notifErr) {
      console.error('Login notification error:', notifErr.message);
    }

    sendResponse(res, 200, {
      token,
      user: userResponse
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/auth/forgot-password
// @desc    Send password reset email
// @access  Public
router.post('/forgot-password', resetLimiter, validateRequest(schemas.forgotPassword), async (req, res) => {
  try {
    const { email } = req.body;
    
    const user = await User.findOne({ email });
    
    if (!user) {
      return sendResponse(res, 404, { message: 'No account found with that email' });
    }
    
    const resetToken = user.getResetPasswordToken();
    await user.save({ validateBeforeSave: false });
    
    try {
      await sendPasswordResetEmail(user, resetToken);
      
      sendResponse(res, 200, {
        message: 'Password reset email sent successfully'
      });
    } catch (error) {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });
      
      throw new Error('Email could not be sent');
    }
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/auth/reset-password/:resetToken
// @desc    Reset password
// @access  Public
router.post('/reset-password/:resetToken', validateRequest(schemas.resetPassword), async (req, res) => {
  try {
    const resetPasswordToken = crypto
      .createHash('sha256')
      .update(req.params.resetToken)
      .digest('hex');
    
    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() }
    });
    
    if (!user) {
      return sendResponse(res, 400, { message: 'Invalid or expired reset token' });
    }
    
    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    Notification.createNotification({
      userId: user._id,
      type: 'password_reset',
      title: 'Password Reset',
      message: 'Your password was reset successfully. If you did not do this, contact support immediately.',
      link: '/profile'
    }, false).catch(() => {});
    
    sendResponse(res, 200, {
      message: 'Password reset successful. You can now login with your new password.'
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/auth/me
// @desc    Get current logged in user
// @access  Private
router.get('/me', require('../middleware/auth.middleware').protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password')
      .populate('referredBy', 'name email phone referralCode');
    sendResponse(res, 200, { user });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/auth/profile
// @desc    Get user's own profile (all roles)
// @access  Private
router.get('/profile', require('../middleware/auth.middleware').protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password')
      .populate('referredBy', 'name email phone referralCode');
    
    sendResponse(res, 200, { user });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   PUT /api/auth/profile
// @desc    Update user's own profile (all roles)
// @access  Private
router.put('/profile', require('../middleware/auth.middleware').protect, validateRequest(schemas.updateProfile), async (req, res) => {
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
    
    const updatedUser = await User.findById(user._id).select('-password');
    
    sendResponse(res, 200, {
      message: 'Profile updated successfully',
      user: updatedUser
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/auth/change-password
// @desc    Change password (all roles)
// @access  Private
router.post('/change-password', require('../middleware/auth.middleware').protect, validateRequest(schemas.changePassword), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    const user = await User.findById(req.user._id).select('+password');
    
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return sendResponse(res, 401, { message: 'Current password is incorrect' });
    }
    
    user.password = newPassword;
    await user.save();
    
    sendResponse(res, 200, { message: 'Password changed successfully' });
  } catch (error) {
    errorResponse(res, error);
  }
});

module.exports = router;
