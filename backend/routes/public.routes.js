const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { validateRequest, schemas } = require('../middleware/validation.middleware');
const { applyLimiter } = require('../middleware/rateLimiter.middleware');
const { sendWelcomeEmail } = require('../utils/email');
const { generatePassword, sendResponse, errorResponse } = require('../utils/helpers');

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
    
    // Check if email already exists
    const existingUser = await User.findOne({ email });
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
    
    // Update agent's children array (cache)
    if (agent) {
      agent.children.push(newUser._id);
      await agent.save();
    }
    
    // Send welcome email with credentials
    try {
      await sendWelcomeEmail(newUser, tempPassword, agent);
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      // Continue even if email fails
    }
    
    sendResponse(res, 201, {
      message: 'Application submitted successfully! Check your email for login credentials.',
      user: {
        _id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role
      },
      credentials: {
        email: newUser.email,
        password: tempPassword
      }
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
    }).select('name referralCode role');
    
    if (!user) {
      return sendResponse(res, 404, {
        message: 'Invalid or inactive referral code'
      });
    }
    
    sendResponse(res, 200, {
      valid: true,
      agent: {
        name: user.name,
        referralCode: user.referralCode
      }
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

module.exports = router;
