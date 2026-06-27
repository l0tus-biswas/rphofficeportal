const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Notification = require('../models/Notification');
const Broadcast = require('../models/Broadcast');
const { validateRequest, schemas } = require('../middleware/validation.middleware');
const { authLimiter, resetLimiter } = require('../middleware/rateLimiter.middleware');
const { sendPasswordResetEmail } = require('../utils/neuzmail');
const { generateToken, sendResponse, errorResponse } = require('../utils/helpers');
const crypto = require('crypto');
const SystemConfig = require('../models/SystemConfig');

const DEFAULT_SITE_ACCESS_MESSAGE = 'RHP Office is temporarily under maintenance. Please check back shortly.';

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', authLimiter, validateRequest(schemas.login), async (req, res) => {
  try {
    const { password } = req.body;
    const email = String(req.body.email || '').trim().toLowerCase();
    
    const user = await User.findOne({ email }).select('+password');
    
    if (!user) {
      return sendResponse(res, 401, { message: 'Invalid credentials' });
    }
    
    if (user.deletedAt) {
      return sendResponse(res, 403, { message: 'Account has been deleted. Please contact support.' });
    }
    
    if (!user.isActive) {
      return sendResponse(res, 403, { message: 'Account is deactivated. Please contact support.' });
    }
    
    const isMatch = await user.comparePassword(password);
    
    if (!isMatch) {
      return sendResponse(res, 401, { message: 'Invalid credentials' });
    }

    // Emergency maintenance mode: non-admin users cannot log in when disabled
    if (user.role !== 'admin') {
      const [enabledConfig, messageConfig] = await Promise.all([
        SystemConfig.findOne({ key: 'site_access_enabled' }).lean(),
        SystemConfig.findOne({ key: 'site_access_message' }).lean()
      ]);

      const siteAccessEnabled = (enabledConfig?.value || 'true').toLowerCase() !== 'false';
      if (!siteAccessEnabled) {
        return res.status(503).json({
          success: false,
          maintenanceMode: true,
          message: messageConfig?.value || DEFAULT_SITE_ACCESS_MESSAGE
        });
      }
    }
    
    // Capture first-login state before updating lastLogin
    const isFirstLogin = !user.lastLogin;

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

    // First login: mark all pre-existing broadcasts as read so new agents
    // don't see historical announcements they missed before joining.
    if (isFirstLogin) {
      try {
        const query = { isActive: true };
        if (user.role !== 'admin') {
          query.$or = [
            { targetRoles: { $size: 0 } },
            { targetRoles: user.role }
          ];
        }
        query.createdAt = { $gte: user.createdAt || new Date() };

        const existingBroadcasts = await Broadcast.find(query).select('_id title message link').lean();

        if (existingBroadcasts.length > 0) {
          // Check which broadcasts already have notifications for this user
          const existingNotifs = await Notification.find({
            userId: user._id,
            type: 'admin_broadcast',
            'data.broadcastId': { $in: existingBroadcasts.map(b => b._id.toString()) }
          }).select('data.broadcastId').lean();

          const existingSet = new Set(existingNotifs.map(n => n.data?.broadcastId?.toString()));

          // Create read notifications for any broadcasts without one
          const toMark = existingBroadcasts.filter(b => !existingSet.has(b._id.toString()));
          for (const b of toMark) {
            await Notification.create({
              userId: user._id,
              type: 'admin_broadcast',
              title: b.title,
              message: b.message,
              data: { broadcastId: b._id.toString() },
              isRead: true,
              link: b.link || null
            });
          }
        }
      } catch (firstLoginErr) {
        console.error('First login broadcast marking error:', firstLoginErr.message);
      }
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
    
    // Always return the same response to prevent email enumeration
    const genericMessage = 'If an account exists with that email, a password reset link has been sent.';
    
    if (!user) {
      return sendResponse(res, 200, { message: genericMessage });
    }
    
    const resetToken = user.getResetPasswordToken();
    await user.save({ validateBeforeSave: false });
    
    try {
      await sendPasswordResetEmail(user, resetToken);
    } catch (error) {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });
      // Log but don't reveal failure to client
      console.error('Password reset email failed:', error.message);
    }
    
    sendResponse(res, 200, { message: genericMessage });
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
    sendResponse(res, 200, { user, impersonating: !!req.impersonatorId });
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
    const { name, phone, address, city, state, zipCode, dateOfBirth, timezone } = req.body;
    
    const user = await User.findById(req.user._id);
    
    if (name) user.name = name;
    if (phone) user.phone = phone;
    if (address) user.address = address;
    if (city) user.city = city;
    if (state) user.state = state;
    if (zipCode) user.zipCode = zipCode;
    if (dateOfBirth) user.dateOfBirth = dateOfBirth;
    if (timezone !== undefined) user.timezone = timezone || null;
    
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

// @route   POST /api/auth/token-exchange
// @desc    Exchange a one-time auto-login token for a JWT (used after registration)
// @access  Public
router.post('/token-exchange', authLimiter, async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return sendResponse(res, 400, { message: 'Token is required' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      autoLoginToken: hashedToken,
      autoLoginTokenExpire: { $gt: Date.now() }
    });

    if (!user) {
      return sendResponse(res, 401, { message: 'Invalid or expired token' });
    }

    // Invalidate the one-time token immediately
    user.autoLoginToken = undefined;
    user.autoLoginTokenExpire = undefined;
    user.lastLogin = Date.now();
    await user.save();

    const jwtToken = generateToken(user, process.env.JWT_SECRET, process.env.JWT_EXPIRE);

    const userResponse = await User.findById(user._id)
      .select('-password')
      .populate('referredBy', 'name email phone referralCode');

    sendResponse(res, 200, { token: jwtToken, user: userResponse });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/auth/stop-impersonation
// @desc    End an impersonation session and return a fresh token for the
//          original admin. Verifies the token inline so it works even when
//          non-admin access is otherwise restricted (e.g. maintenance mode).
// @access  Private (valid impersonation token)
router.post('/stop-impersonation', async (req, res) => {
  try {
    const jwt = require('jsonwebtoken');

    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (!token) {
      return sendResponse(res, 401, { message: 'Not authorized to access this route' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return sendResponse(res, 401, { message: 'Token is invalid or expired' });
    }

    if (!decoded.impersonatorId) {
      return sendResponse(res, 400, { message: 'Not an impersonation session' });
    }

    const admin = await User.findById(decoded.impersonatorId).select('-password');

    if (!admin || admin.role !== 'admin' || admin.deletedAt || !admin.isActive) {
      return sendResponse(res, 403, { message: 'Original admin account is no longer available.' });
    }

    const adminToken = generateToken(admin, process.env.JWT_SECRET, process.env.JWT_EXPIRE);

    const adminResponse = await User.findById(admin._id)
      .select('-password')
      .populate('referredBy', 'name email phone referralCode');

    sendResponse(res, 200, {
      message: 'Impersonation ended',
      token: adminToken,
      user: adminResponse
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
