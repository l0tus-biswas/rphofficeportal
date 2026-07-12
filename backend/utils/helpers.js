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
// extraClaims lets callers embed additional payload fields (e.g. impersonatorId)
exports.generateToken = (user, secret, expiresIn, extraClaims = {}) => {
  const jwt = require('jsonwebtoken');
  return jwt.sign({ id: user._id, ...extraClaims }, secret, { expiresIn });
};

// Response formatter
exports.sendResponse = (res, statusCode, data) => {
  res.status(statusCode).json({
    success: statusCode < 400,
    ...data
  });
};

// Error handler with smart status code detection
exports.errorResponse = (res, error, statusCode) => {
  console.error('Error:', error);

  const explicitStatusCode = !!statusCode;

  // Auto-detect appropriate status code from error type if not explicitly provided
  if (!statusCode) {
    if (error.name === 'ValidationError') {
      statusCode = 400; // Mongoose validation error
    } else if (error.name === 'CastError') {
      statusCode = 400; // Invalid ObjectId or type cast
    } else if (error.code === 11000) {
      statusCode = 409; // MongoDB duplicate key
    } else if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      statusCode = 401; // JWT errors
    } else {
      statusCode = 500;
    }
  }
  
  const isDev = process.env.NODE_ENV === 'development';
  
  // Build a user-friendly message for known error types
  let message;
  if (isDev) {
    message = error.message || 'An error occurred';
  } else if (error.code === 11000) {
    // Extract the duplicate field name from the error
    const field = Object.keys(error.keyPattern || {})[0] || 'field';
    message = `A record with that ${field} already exists`;
  } else if (error.name === 'ValidationError') {
    message = 'Validation failed';
  } else if (error.name === 'CastError') {
    message = 'Invalid ID format';
  } else if (explicitStatusCode && statusCode >= 400 && statusCode < 500 && error.message) {
    // A route explicitly chose a client-error status and crafted this message
    // for the caller (e.g. "An account already exists with this email") — it's
    // safe to show as-is, unlike unclassified 500s which may leak internals.
    message = error.message;
  } else {
    message = 'An error occurred';
  }
  
  res.status(statusCode).json({
    success: false,
    message,
    ...(isDev && { stack: error.stack })
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

/**
 * Safely resolve a relative file path from the backend root directory.
 * Prevents path traversal attacks by verifying the resolved path stays
 * within the expected base directory.
 *
 * @param {string} relativePath - The DB-stored relative path (e.g. 'uploads/document-hub/file.pdf')
 * @returns {string|null} - The absolute path if safe, or null if traversal is detected
 */
exports.safePath = (relativePath) => {
  const path = require('path');
  // Normalize backslashes to forward slashes to prevent traversal on Linux
  // where \ is a valid filename character, not a path separator
  const normalized = relativePath.replace(/\\/g, '/');
  const baseDir = path.resolve(__dirname, '..');
  const resolved = path.resolve(baseDir, normalized);

  if (!resolved.startsWith(baseDir + path.sep) && resolved !== baseDir) {
    return null;
  }
  return resolved;
};

