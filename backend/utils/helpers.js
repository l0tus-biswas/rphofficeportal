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

/**
 * Recursively collect all descendant user IDs for a given upline user.
 * Uses the User.children[] array to walk the tree breadth-first.
 *
 * @param {string|ObjectId} userId  - The root user (upline) whose full downline we want
 * @returns {Promise<ObjectId[]>}   - Array of all descendant ObjectIds (not including userId itself)
 */
exports.getDownlineIds = async (userId) => {
  const User = require('../models/User');
  const result = [];
  const queue = [userId];

  while (queue.length > 0) {
    const current = queue.shift();
    const user = await User.findById(current).select('children').lean();
    if (user && user.children && user.children.length > 0) {
      for (const childId of user.children) {
        result.push(childId);
        queue.push(childId);
      }
    }
  }

  return result;
};

