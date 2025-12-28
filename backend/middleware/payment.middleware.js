const User = require('../models/User');
const { sendResponse } = require('../utils/helpers');

/**
 * Middleware to check if user has completed payment requirements
 * Should be used on protected routes that require payment access
 * CURRENTLY DISABLED - Payment checks are bypassed for all users
 */
const requirePayment = async (req, res, next) => {
  // PAYMENT CHECK TEMPORARILY DISABLED
  // TODO: Re-enable when ready to enforce payment requirements
  next();
  return;
  
  /* ORIGINAL PAYMENT CHECK CODE - COMMENTED OUT
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return sendResponse(res, 401, { message: 'User not found' });
    }

    // Check if one-time payment is completed
    if (!user.oneTimePaymentCompleted) {
      return sendResponse(res, 403, { 
        message: 'One-time payment required',
        code: 'PAYMENT_REQUIRED',
        requiresPayment: true,
        paymentType: 'one-time'
      });
    }

    // Check if user has active subscription or payment access is manually enabled
    if (!user.paymentAccessEnabled) {
      return sendResponse(res, 403, { 
        message: 'Active subscription required',
        code: 'SUBSCRIPTION_REQUIRED',
        requiresPayment: true,
        paymentType: 'subscription'
      });
    }

    next();
  } catch (error) {
    console.error('Payment verification error:', error);
    return sendResponse(res, 500, { message: 'Payment verification failed' });
  }
  */
};

/**
 * Middleware to check only one-time payment (for accessing onboarding, etc.)
 * CURRENTLY DISABLED - Payment checks are bypassed for all users
 */
const requireOneTimePayment = async (req, res, next) => {
  // PAYMENT CHECK TEMPORARILY DISABLED
  // TODO: Re-enable when ready to enforce payment requirements
  next();
  return;
  
  /* ORIGINAL PAYMENT CHECK CODE - COMMENTED OUT
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return sendResponse(res, 401, { message: 'User not found' });
    }

    // Check if one-time payment is completed
    if (!user.oneTimePaymentCompleted) {
      return sendResponse(res, 403, { 
        message: 'One-time payment required',
        code: 'PAYMENT_REQUIRED',
        requiresPayment: true,
        paymentType: 'one-time'
      });
    }

    next();
  } catch (error) {
    console.error('Payment verification error:', error);
    return sendResponse(res, 500, { message: 'Payment verification failed' });
  }
  */
};

module.exports = { requirePayment, requireOneTimePayment };
