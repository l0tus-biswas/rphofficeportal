const express = require('express');
const router = express.Router();
const User = require('../models/User');
const SystemConfig = require('../models/SystemConfig');
const { validateRequest, schemas } = require('../middleware/validation.middleware');
const { applyLimiter } = require('../middleware/rateLimiter.middleware');
const { sendWelcomeEmail } = require('../utils/neuzmail');
const { generatePassword, sendResponse, errorResponse } = require('../utils/helpers');
const { createPaymentIntent } = require('../utils/stripe');

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const DEFAULT_SITE_ACCESS_MESSAGE = 'RHP Office is temporarily under maintenance. Please check back shortly.';

// @route   GET /api/public/branding
// @desc    Get branding configuration (public)
// @access  Public
router.get('/branding', async (req, res) => {
  try {
    const appName = await SystemConfig.findOne({ key: 'app_name' });
    const appLogo = await SystemConfig.findOne({ key: 'app_logo' });
    
    sendResponse(res, 200, {
      appName: appName?.value || 'Escape',
      appLogo: appLogo?.value || null
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/public/timezone
// @desc    Get configured timezone for the application
// @access  Public
router.get('/timezone', async (req, res) => {
  try {
    const config = await SystemConfig.findOne({ key: 'app_timezone' }).lean();
    sendResponse(res, 200, { timezone: config?.value || 'America/New_York' });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/public/site-access
// @desc    Get emergency site access state and message
// @access  Public
router.get('/site-access', async (req, res) => {
  try {
    const [enabledConfig, messageConfig] = await Promise.all([
      SystemConfig.findOne({ key: 'site_access_enabled' }).lean(),
      SystemConfig.findOne({ key: 'site_access_message' }).lean()
    ]);

    const siteAccessEnabled = (enabledConfig?.value || 'true').toLowerCase() !== 'false';
    const siteAccessMessage = messageConfig?.value || DEFAULT_SITE_ACCESS_MESSAGE;

    sendResponse(res, 200, { siteAccessEnabled, siteAccessMessage });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/public/apply
// @desc    Get agent info for apply page (optional - for showing agent name)
// @access  Public
router.get('/apply', async (req, res) => {
  try {
    const { ref } = req.query;
    
    if (!ref) {
      return sendResponse(res, 200, {
        message: 'Apply form ready',
        referralCode: null
      });
    }
    
    const agent = await User.findOne({ referralCode: ref, isActive: true })
      .select('name referralCode role');
    
    if (!agent) {
      return sendResponse(res, 404, {
        message: 'Invalid referral code'
      });
    }
    
    sendResponse(res, 200, {
      agent: {
        name: agent.name,
        referralCode: agent.referralCode
      }
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/public/apply
// @desc    Submit application (creates recruit user)
// @access  Public
router.post('/apply', applyLimiter, validateRequest(schemas.applyForm), async (req, res) => {
  try {
    const { name, email, phone, address, city, state, zipCode, metadata } = req.body;
    const { ref } = req.query;
    
    // Check if email already exists (case-insensitive)
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return sendResponse(res, 400, {
        message: 'An account with this email already exists'
      });
    }
    
    // Find agent by referral code
    let agent = null;
    let referredById = null;
    
    if (ref) {
      agent = await User.findOne({ referralCode: ref, isActive: true });
      if (!agent) {
        return sendResponse(res, 400, {
          message: 'Invalid referral code'
        });
      }
      referredById = agent._id;
    }
    
    // Generate temporary password
    const tempPassword = generatePassword(10);
    
    // Create new agent user
    const newUser = await User.create({
      name,
      email,
      phone,
      password: tempPassword,
      role: 'agent',
      referredBy: referredById,
      address,
      city,
      state,
      zipCode,
      metadata: metadata || {},
      isActive: true
    });
    
    // Update agent's children array atomically
    if (agent) {
      await User.findByIdAndUpdate(agent._id, { $push: { children: newUser._id } });
    }
    
    // Send welcome email with credentials
    try {
      await sendWelcomeEmail(newUser, tempPassword, agent);
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      // Continue even if email fails
    }

    // Generate a one-time auto-login token (expires in 5 minutes)
    const autoLoginToken = newUser.getAutoLoginToken();
    await newUser.save({ validateBeforeSave: false });
    
    sendResponse(res, 201, {
      message: 'Application submitted successfully! Check your email for login credentials.',
      user: {
        _id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role
      },
      autoLoginToken
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/public/verify-referral/:code
// @desc    Verify if referral code is valid
// @access  Public
router.get('/verify-referral/:code', async (req, res) => {
  try {
    const user = await User.findOne({ 
      referralCode: req.params.code, 
      isActive: true,
      role: { $in: ['agent', 'admin'] }
    }).select('name email phone referralCode role');
    
    if (!user) {
      return sendResponse(res, 404, {
        message: 'Invalid or inactive referral code'
      });
    }
    
    sendResponse(res, 200, {
      valid: true,
      agent: {
        name: user.name,
        email: user.email,
        phone: user.phone,
        referralCode: user.referralCode
      }
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/public/registration-payment-intent
// @desc    Create payment intent for registration (public route)
// @access  Public
router.post('/registration-payment-intent', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return sendResponse(res, 400, { message: 'Email is required' });
    }

    // Check if user already exists (case-insensitive)
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return sendResponse(res, 400, { message: 'Account already exists. Please login.' });
    }

    const amount = parseInt(process.env.STRIPE_ONE_TIME_PRICE) || 17900; // $179

    // Create payment intent without customer (will be created after payment)
    const paymentIntent = await createPaymentIntent(
      amount,
      'usd',
      null, // No customer yet
      {
        type: 'registration',
        email: email,
        description: 'Registration fee - account will be created after payment'
      }
    );

    sendResponse(res, 200, {
      clientSecret: paymentIntent.client_secret,
      amount: amount
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/public/recruiters/search
// @desc    Search recruiters by name, email, phone, or referral code
// @access  Public
router.get('/recruiters/search', async (req, res) => {
  try {
    const { q } = req.query;
    const query = (q || '').trim();

    if (query.length < 2) {
      return sendResponse(res, 400, { message: 'Search term must be at least 2 characters' });
    }

    const regex = new RegExp(escapeRegex(query), 'i');
    const referralRegex = new RegExp('^' + escapeRegex(query), 'i');

    const recruiters = await User.find({
      isActive: true,
      role: { $in: ['agent', 'admin'] },
      $or: [
        { name: regex },
        { email: regex },
        { phone: regex },
        { referralCode: referralRegex }
      ]
    })
      .select('name email phone referralCode role level')
      .sort({ name: 1 })
      .limit(10)
      .lean();

    sendResponse(res, 200, {
      results: recruiters.map(user => ({
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        referralCode: user.referralCode,
        role: user.role,
        level: user.level
      }))
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

module.exports = router;
