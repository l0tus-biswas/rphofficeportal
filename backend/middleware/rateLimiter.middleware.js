const rateLimit = require('express-rate-limit');

// General API rate limiter
exports.apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Strict rate limiter for auth endpoints
exports.authLimiter = rateLimit({
  windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 5,
  skipSuccessfulRequests: false,
  message: {
    success: false,
    message: 'Too many login attempts, please try again after 15 minutes.'
  }
});

// Public apply form rate limiter
exports.applyLimiter = rateLimit({
  windowMs: parseInt(process.env.APPLY_RATE_LIMIT_WINDOW_MS) || 60 * 60 * 1000, // 1 hour
  max: parseInt(process.env.APPLY_RATE_LIMIT_MAX) || 20,
  skip: (req) => process.env.NODE_ENV === 'development', // Skip rate limiting in development
  message: {
    success: false,
    message: 'Too many applications from this IP, please try again later.'
  }
});

// Password reset rate limiter
exports.resetLimiter = rateLimit({
  windowMs: parseInt(process.env.RESET_RATE_LIMIT_WINDOW_MS) || 60 * 60 * 1000, // 1 hour
  max: parseInt(process.env.RESET_RATE_LIMIT_MAX) || 3,
  message: {
    success: false,
    message: 'Too many password reset attempts, please try again later.'
  }
});
