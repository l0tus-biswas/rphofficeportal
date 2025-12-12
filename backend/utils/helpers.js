const crypto = require('crypto');

// Generate random password
exports.generatePassword = (length = 10) => {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
  let password = '';
  
  for (let i = 0; i < length; i++) {
    const randomIndex = crypto.randomInt(0, charset.length);
    password += charset[randomIndex];
  }
  
  return password;
};

// Generate JWT token
exports.generateToken = (user, secret, expiresIn) => {
  const jwt = require('jsonwebtoken');
  return jwt.sign({ id: user._id }, secret, { expiresIn });
};

// Response formatter
exports.sendResponse = (res, statusCode, data) => {
  res.status(statusCode).json({
    success: statusCode < 400,
    ...data
  });
};

// Error handler
exports.errorResponse = (res, error, statusCode = 500) => {
  console.error('Error:', error);
  res.status(statusCode).json({
    success: false,
    message: error.message || 'An error occurred',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
};

// Pagination helper
exports.paginate = (query, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;
  return query.skip(skip).limit(limit);
};
