const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.protect = async (req, res, next) => {
  try {
    let token;
    
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      req.user = await User.findById(decoded.id).select('-password');
      
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'User not found'
        });
      }
      
      if (req.user.deletedAt) {
        return res.status(403).json({
          success: false,
          message: 'Account has been deleted'
        });
      }
      
      if (!req.user.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Account is deactivated'
        });
      }
      
      // Skip payment check for admins
      if (req.user.role === 'admin') {
        next();
        return;
      }
      
      // PAYMENT CHECK TEMPORARILY DISABLED - Agents can access without payment
      // TODO: Re-enable when ready to enforce payment requirements
      /*
      // Check payment access (except for payment-related routes)
      const isPaymentRoute = req.path.includes('/api/payments') || 
                              req.path.includes('/api/user/payments') ||
                              req.path.includes('/api/user/subscription');
      
      if (!isPaymentRoute && !req.user.paymentAccessEnabled) {
        return res.status(403).json({
          success: false,
          message: 'Payment required. Please complete your payment to access the platform.',
          paymentRequired: true,
          oneTimePaymentCompleted: req.user.oneTimePaymentCompleted || false,
          subscriptionActive: req.user.subscriptionStatus === 'active'
        });
      }
      */
      
      next();
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: 'Token is invalid or expired'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error in authentication'
    });
  }
};

exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Role '${req.user.role}' is not authorized to access this route`
      });
    }
    next();
  };
};

exports.admin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin only.'
    });
  }
  next();
};

exports.optionalAuth = async (req, res, next) => {
  try {
    let token;
    
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
      
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = await User.findById(decoded.id).select('-password');
      } catch (err) {
        // Token invalid, continue without user
      }
    }
    
    next();
  } catch (error) {
    next();
  }
};
