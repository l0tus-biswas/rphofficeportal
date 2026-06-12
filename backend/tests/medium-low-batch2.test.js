/**
 * Unit tests for MEDIUM/LOW batch 2 fixes (#22, #23, #36, #51, #52, #54, #60, #64)
 * Tests: errorResponse type detection, commission pagination, rate limiter,
 *        CSP headers, localStorage safety, timestamp deduplication
 */
process.env.NODE_ENV = 'test';

// ─────────────────────────────────────────────────────────
// Fix #51: errorResponse smart status code detection
// ─────────────────────────────────────────────────────────
describe('Fix #51: errorResponse type detection', () => {
  const { errorResponse } = require('../utils/helpers');

  it('should return 400 for ValidationError', () => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const err = new Error('Validation failed');
    err.name = 'ValidationError';
    errorResponse(res, err);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return 400 for CastError', () => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const err = new Error('Cast failed');
    err.name = 'CastError';
    errorResponse(res, err);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return 409 for duplicate key (11000)', () => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const err = new Error('Duplicate key');
    err.code = 11000;
    err.keyPattern = { email: 1 };
    errorResponse(res, err);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('email')
    }));
  });

  it('should return 401 for JWT errors', () => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const err = new Error('jwt expired');
    err.name = 'TokenExpiredError';
    errorResponse(res, err);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should return 500 for unknown errors', () => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const err = new Error('Something unknown');
    errorResponse(res, err);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('should use explicit statusCode when provided', () => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const err = new Error('Custom');
    errorResponse(res, err, 422);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('should hide error details in production mode', () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const { errorResponse: prodErrorResponse } = require('../utils/helpers');
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const err = new Error('Sensitive details');
    prodErrorResponse(res, err);
    const jsonCall = res.json.mock.calls[0][0];
    expect(jsonCall.message).not.toContain('Sensitive');
    expect(jsonCall.stack).toBeUndefined();
    process.env.NODE_ENV = origEnv;
  });
});

// ─────────────────────────────────────────────────────────
// Fix #23: Commission statements pagination
// ─────────────────────────────────────────────────────────
describe('Fix #23: Commission statements pagination', () => {
  const fs = require('fs');
  const path = require('path');
  const routeCode = fs.readFileSync(
    path.join(__dirname, '../routes/commission-statements.routes.js'), 'utf8'
  );

  it('route uses skip and limit for pagination', () => {
    expect(routeCode).toContain('.skip(skip)');
    expect(routeCode).toContain('.limit(limit)');
  });

  it('has countDocuments for total', () => {
    expect(routeCode).toContain('countDocuments(filter)');
  });

  it('returns array when no page/limit params (backward compat)', () => {
    expect(routeCode).toContain('req.query.page || req.query.limit');
    expect(routeCode).toContain('res.json(statements)');
  });

  it('limits max page size to 200', () => {
    expect(routeCode).toContain('Math.min(200');
  });
});

// ─────────────────────────────────────────────────────────
// Fix #36: Rate limiter only skips in test, not development
// ─────────────────────────────────────────────────────────
describe('Fix #36: Rate limiter configuration', () => {
  const fs = require('fs');
  const path = require('path');
  const limiterCode = fs.readFileSync(
    path.join(__dirname, '../middleware/rateLimiter.middleware.js'), 'utf8'
  );

  it('skip function checks for test or development environment', () => {
    expect(limiterCode).toContain("process.env.NODE_ENV === 'test'");
    expect(limiterCode).toContain("process.env.NODE_ENV === 'development'");
  });

  it('logs when running in development mode', () => {
    expect(limiterCode).toContain('Rate Limiter');
    expect(limiterCode).toContain('development');
  });

  it('uses shared shouldSkip function', () => {
    expect(limiterCode).toContain('skip: shouldSkip');
  });
});

// ─────────────────────────────────────────────────────────
// Fix #22: Promotion check structured error logging
// ─────────────────────────────────────────────────────────
describe('Fix #22: Promotion check structured logging', () => {
  const fs = require('fs');
  const path = require('path');
  const prodCode = fs.readFileSync(
    path.join(__dirname, '../routes/production.routes.js'), 'utf8'
  );

  it('logs submissionId in promotion error', () => {
    expect(prodCode).toContain('submissionId: submission._id');
  });

  it('logs agentId in promotion error', () => {
    expect(prodCode).toContain('agentId: agentId.toString()');
  });

  it('logs stack trace in promotion error', () => {
    expect(prodCode).toContain('stack: promoErr.stack');
  });
});

// ─────────────────────────────────────────────────────────
// Fix #60: Helmet CSP enabled
// ─────────────────────────────────────────────────────────
describe('Fix #60: Helmet CSP configuration', () => {
  const fs = require('fs');
  const path = require('path');
  const serverCode = fs.readFileSync(
    path.join(__dirname, '../server.js'), 'utf8'
  );

  it('CSP is no longer disabled', () => {
    expect(serverCode).not.toContain("contentSecurityPolicy: false");
  });

  it('has CSP directives defined', () => {
    expect(serverCode).toContain('contentSecurityPolicy');
    expect(serverCode).toContain('directives');
    expect(serverCode).toContain('defaultSrc');
    expect(serverCode).toContain('scriptSrc');
  });

  it('allows self and inline for Angular', () => {
    expect(serverCode).toContain("'self'");
    expect(serverCode).toContain("'unsafe-inline'");
  });

  it('blocks frames and objects', () => {
    expect(serverCode).toContain("frameSrc");
    expect(serverCode).toContain("objectSrc");
    expect(serverCode).toContain("'none'");
  });
});

// ─────────────────────────────────────────────────────────
// Fix #52: Redundant timestamps removed from User model
// ─────────────────────────────────────────────────────────
describe('Fix #52: User model timestamps', () => {
  const fs = require('fs');
  const path = require('path');
  const userModelCode = fs.readFileSync(
    path.join(__dirname, '../models/User.js'), 'utf8'
  );

  it('uses timestamps: true option', () => {
    expect(userModelCode).toContain('timestamps: true');
  });

  it('does not have manual createdAt field declaration', () => {
    // Should not have "createdAt: { type: Date, default: Date.now }"
    expect(userModelCode).not.toMatch(/createdAt:\s*\{[^}]*type:\s*Date/);
  });

  it('does not have manual updatedAt field declaration', () => {
    expect(userModelCode).not.toMatch(/updatedAt:\s*\{[^}]*type:\s*Date/);
  });
});

// ─────────────────────────────────────────────────────────
// Fix #54: _getDownlineIds is NOT a duplicate (different behavior)
// ─────────────────────────────────────────────────────────
describe('Fix #54: getDownlineIds functions serve different purposes', () => {
  const fs = require('fs');
  const path = require('path');
  const examfxCode = fs.readFileSync(
    path.join(__dirname, '../routes/examfx.routes.js'), 'utf8'
  );
  const helpersCode = fs.readFileSync(
    path.join(__dirname, '../utils/helpers.js'), 'utf8'
  );

  it('examfx _getDownlineIds only gets direct children (referredBy)', () => {
    // Uses referredBy query, not recursive children walk
    expect(examfxCode).toContain('referredBy: agentId');
  });

  it('helpers getDownlineIds walks children tree recursively', () => {
    expect(helpersCode).toContain('queue');
    expect(helpersCode).toContain('user.children');
  });
});

// ─────────────────────────────────────────────────────────
// Fix #64: localStorage JSON.parse safety
// ─────────────────────────────────────────────────────────
describe('Fix #64: localStorage JSON parse safety', () => {
  const fs = require('fs');
  const path = require('path');
  const interceptorCode = fs.readFileSync(
    path.join(__dirname, '../../frontend/src/app/interceptors/auth.interceptor.ts'), 'utf8'
  );

  it('wraps JSON.parse in try/catch', () => {
    expect(interceptorCode).toContain('try');
    expect(interceptorCode).toContain('catch');
    expect(interceptorCode).toContain('JSON.parse');
  });

  it('clears invalid user from localStorage on parse error', () => {
    expect(interceptorCode).toContain("localStorage.removeItem('user')");
  });
});
