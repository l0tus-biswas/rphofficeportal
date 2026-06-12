const rateLimit = require('express-rate-limit');

// Skip rate limiting in test and development (log warning in dev)
const shouldSkip = () => process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development';

if (process.env.NODE_ENV === 'development') {
  console.log('[Rate Limiter] WARNING: Rate limiting is SKIPPED in development mode. Set NODE_ENV=production to enable.');
}

// General API rate limiter
exports.apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  skip: shouldSkip,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Strict rate limiter for auth endpoints – keyed by email (not IP)
exports.authLimiter = rateLimit({
  windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 5,
  skip: shouldSkip,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const email = (req.body && req.body.email || '').trim().toLowerCase();
    return email || req.ip;
  },
  message: {
    success: false,
    message: 'Too many login attempts for this account, please try again after 15 minutes.'
  }
});

// Public apply form rate limiter
exports.applyLimiter = rateLimit({
  windowMs: parseInt(process.env.APPLY_RATE_LIMIT_WINDOW_MS) || 60 * 60 * 1000, // 1 hour
  max: parseInt(process.env.APPLY_RATE_LIMIT_MAX) || 20,
  skip: shouldSkip,
  message: {
    success: false,
    message: 'Too many applications from this IP, please try again later.'
  }
});

// Password reset rate limiter
exports.resetLimiter = rateLimit({
  windowMs: parseInt(process.env.RESET_RATE_LIMIT_WINDOW_MS) || 60 * 60 * 1000, // 1 hour
  max: parseInt(process.env.RESET_RATE_LIMIT_MAX) || 3,
  skip: shouldSkip,
  message: {
    success: false,
    message: 'Too many password reset attempts, please try again later.'
  }
});
