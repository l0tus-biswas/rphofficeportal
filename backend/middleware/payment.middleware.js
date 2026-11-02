const User = require('../models/User');
const { sendResponse } = require('../utils/helpers');

/**
 * Payment access enforcement.
 *
 * Off by default so behaviour is unchanged: set ENFORCE_PAYMENT_ACCESS=true to
 * start blocking agents whose setup/subscription payment is not in good
 * standing. Admins and billing-exempt (Free Access) users always pass.
 *
 * NOTE: neither middleware is attached to any route yet. paymentAccessEnabled
 * is maintained by the payment webhooks and the resume-billing flow, so before
 * enabling enforcement make sure existing agents' flags are accurate, then add
 * the middleware to the routes that should be gated.
 */
const isEnforced = () => process.env.ENFORCE_PAYMENT_ACCESS === 'true';

const exemptFromPayment = (user) => user.role === 'admin' || user.billingExempt;

const requirePayment = async (req, res, next) => {
  if (!isEnforced()) return next();

  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return sendResponse(res, 401, { message: 'User not found' });
    }

    if (exemptFromPayment(user)) return next();

    // Check if setup fee payment is completed
    if (!user.oneTimePaymentCompleted) {
      return sendResponse(res, 403, {
        message: 'Setup fee payment required',
        code: 'PAYMENT_REQUIRED',
        requiresPayment: true,
        paymentType: 'setup_fee'
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
};

/**
 * Checks only the setup fee payment (for accessing onboarding, etc.).
 */
const requireOneTimePayment = async (req, res, next) => {
  if (!isEnforced()) return next();

  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return sendResponse(res, 401, { message: 'User not found' });
    }

    if (exemptFromPayment(user)) return next();

    if (!user.oneTimePaymentCompleted) {
      return sendResponse(res, 403, {
        message: 'Setup fee payment required',
        code: 'PAYMENT_REQUIRED',
        requiresPayment: true,
        paymentType: 'setup_fee'
      });
    }

    next();
  } catch (error) {
    console.error('Payment verification error:', error);
    return sendResponse(res, 500, { message: 'Payment verification failed' });
  }
};

module.exports = { requirePayment, requireOneTimePayment };
