const express = require('express');
const router = express.Router();
const Payment = require('../models/Payment');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const APAApplication = require('../models/APAApplication');
const { protect } = require('../middleware/auth.middleware');
const { sendResponse, errorResponse, paginate } = require('../utils/helpers');

// @route   GET /api/user/payments
// @desc    Get user's payment history
// @access  Private
router.get('/payments', protect, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const query = Payment.find({ user: req.user._id })
      .sort('-createdAt');

    const payments = await paginate(query, page, limit);
    const total = await Payment.countDocuments({ user: req.user._id });

    sendResponse(res, 200, {
      payments,
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

// @route   GET /api/user/subscription
// @desc    Get user's subscription details
// @access  Private
router.get('/subscription', protect, async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ user: req.user._id });

    if (!subscription) {
      return sendResponse(res, 404, { message: 'No subscription found' });
    }

    sendResponse(res, 200, { subscription });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/user/apa-application
// @desc    Get user's APA application details
// @access  Private
router.get('/apa-application', protect, async (req, res) => {
  try {
    const application = await APAApplication.findOne({ userId: req.user._id })
      .sort({ createdAt: -1 }); // Get most recent application

    if (!application) {
      return sendResponse(res, 404, { message: 'No APA application found' });
    }

    sendResponse(res, 200, { application });
  } catch (error) {
    errorResponse(res, error);
  }
});

module.exports = router;
