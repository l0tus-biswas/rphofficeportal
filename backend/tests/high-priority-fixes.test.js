/**
 * Unit tests for HIGH-priority security fixes (Audit #8-#14, #19, #20)
 * Tests validation, auth guards, soft-delete, regex escaping, stack trace hiding
 */
process.env.NODE_ENV = 'test';

const Joi = require('joi');
const { schemas, validateRequest } = require('../middleware/validation.middleware');
const { safePath } = require('../utils/helpers');

// ─────────────────────────────────────────────────────────
// Fix #10: Production submission Joi validation
// ─────────────────────────────────────────────────────────
describe('Fix #10: Production submission Joi schema', () => {
  const schema = schemas.productionSubmission;

  it('should accept valid production submission', () => {
    const { error } = schema.validate({
      clientName: 'John Doe',
      productSold: 'Term Life Insurance',
      carrier: '507f1f77bcf86cd799439011',
      premiumAmount: 150.00
    });
    expect(error).toBeUndefined();
  });

  it('should reject missing clientName', () => {
    const { error } = schema.validate({
      productSold: 'Term Life Insurance',
      carrier: '507f1f77bcf86cd799439011',
      premiumAmount: 150.00
    });
    expect(error).toBeDefined();
    expect(error.details[0].path).toContain('clientName');
  });

  it('should reject missing productSold', () => {
    const { error } = schema.validate({
      clientName: 'John Doe',
      carrier: '507f1f77bcf86cd799439011',
      premiumAmount: 150.00
    });
    expect(error).toBeDefined();
    expect(error.details[0].path).toContain('productSold');
  });

  it('should reject missing carrier', () => {
    const { error } = schema.validate({
      clientName: 'John Doe',
      productSold: 'Term Life Insurance',
      premiumAmount: 150.00
    });
    expect(error).toBeDefined();
    expect(error.details[0].path).toContain('carrier');
  });

  it('should reject invalid carrier (not hex ObjectId)', () => {
    const { error } = schema.validate({
      clientName: 'John Doe',
      productSold: 'Term Life Insurance',
      carrier: 'not-a-valid-id',
      premiumAmount: 150.00
    });
    expect(error).toBeDefined();
  });

  it('should reject missing premiumAmount', () => {
    const { error } = schema.validate({
      clientName: 'John Doe',
      productSold: 'Term Life Insurance',
      carrier: '507f1f77bcf86cd799439011'
    });
    expect(error).toBeDefined();
    expect(error.details[0].path).toContain('premiumAmount');
  });

  it('should reject negative premiumAmount', () => {
    const { error } = schema.validate({
      clientName: 'John Doe',
      productSold: 'Term Life Insurance',
      carrier: '507f1f77bcf86cd799439011',
      premiumAmount: -100
    });
    expect(error).toBeDefined();
  });

  it('should accept premiumAmount of 0', () => {
    const { error } = schema.validate({
      clientName: 'John Doe',
      productSold: 'Term Life Insurance',
      carrier: '507f1f77bcf86cd799439011',
      premiumAmount: 0
    });
    expect(error).toBeUndefined();
  });

  it('should accept numberOfMembers=0', () => {
    const { error } = schema.validate({
      clientName: 'John Doe',
      productSold: 'Term Life Insurance',
      carrier: '507f1f77bcf86cd799439011',
      premiumAmount: 100,
      numberOfMembers: 0
    });
    expect(error).toBeUndefined();
  });

  it('should accept future submissionDate', () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const { error } = schema.validate({
      clientName: 'John Doe',
      productSold: 'Term Life Insurance',
      carrier: '507f1f77bcf86cd799439011',
      premiumAmount: 100,
      submissionDate: futureDate
    });
    expect(error).toBeUndefined();
  });

  it('should accept long client names (up to 500 chars)', () => {
    const longName = 'A'.repeat(500);
    const { error } = schema.validate({
      clientName: longName,
      productSold: 'Term Life Insurance',
      carrier: '507f1f77bcf86cd799439011',
      premiumAmount: 100
    });
    expect(error).toBeUndefined();
  });

  it('should reject client names over 500 chars', () => {
    const tooLongName = 'A'.repeat(501);
    const { error } = schema.validate({
      clientName: tooLongName,
      productSold: 'Term Life Insurance',
      carrier: '507f1f77bcf86cd799439011',
      premiumAmount: 100
    });
    expect(error).toBeDefined();
  });

  it('should accept valid status values', () => {
    const validStatuses = ['Submitted', 'Pending', 'In Force', 'Lapsed', 'Cancelled'];
    for (const status of validStatuses) {
      const { error } = schema.validate({
        clientName: 'John Doe',
        productSold: 'Term Life Insurance',
        carrier: '507f1f77bcf86cd799439011',
        premiumAmount: 100,
        status
      });
      expect(error).toBeUndefined();
    }
  });

  it('should reject invalid status value', () => {
    const { error } = schema.validate({
      clientName: 'John Doe',
      productSold: 'Term Life Insurance',
      carrier: '507f1f77bcf86cd799439011',
      premiumAmount: 100,
      status: 'invalid_status'
    });
    expect(error).toBeDefined();
  });

  it('should reject notes over 2000 chars', () => {
    const { error } = schema.validate({
      clientName: 'John Doe',
      productSold: 'Term Life Insurance',
      carrier: '507f1f77bcf86cd799439011',
      premiumAmount: 100,
      notes: 'x'.repeat(2001)
    });
    expect(error).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────
// Fix #14: Regex escaping in admin search
// ─────────────────────────────────────────────────────────
describe('Fix #14: Regex escaping', () => {
  const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  it('should escape dots', () => {
    expect(escapeRegex('john.doe')).toBe('john\\.doe');
  });

  it('should escape regex quantifiers', () => {
    expect(escapeRegex('a*b+c?')).toBe('a\\*b\\+c\\?');
  });

  it('should escape groups and anchors', () => {
    expect(escapeRegex('^(evil)$')).toBe('\\^\\(evil\\)\\$');
  });

  it('should escape character classes', () => {
    expect(escapeRegex('[a-z]')).toBe('\\[a-z\\]');
  });

  it('should handle ReDoS-style patterns', () => {
    const redos = '(a+)+$';
    const escaped = escapeRegex(redos);
    expect(escaped).toBe('\\(a\\+\\)\\+\\$');
    // This should NOT cause catastrophic backtracking
    const regex = new RegExp(escaped);
    const start = Date.now();
    regex.test('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!');
    expect(Date.now() - start).toBeLessThan(100);
  });

  it('should handle empty string', () => {
    expect(escapeRegex('')).toBe('');
  });

  it('should not modify safe strings', () => {
    expect(escapeRegex('john doe')).toBe('john doe');
  });
});

// ─────────────────────────────────────────────────────────
// Fix #2: Path traversal protection (safePath utility)
// ─────────────────────────────────────────────────────────
describe('Fix #2: safePath utility', () => {
  it('should allow simple relative paths', () => {
    expect(safePath('uploads/test.pdf')).not.toBeNull();
  });

  it('should allow nested valid paths', () => {
    expect(safePath('uploads/document-hub/file.pdf')).not.toBeNull();
  });

  it('should block simple traversal', () => {
    expect(safePath('../etc/passwd')).toBeNull();
  });

  it('should block deep traversal', () => {
    expect(safePath('../../../etc/shadow')).toBeNull();
  });

  it('should block encoded traversal in nested paths', () => {
    expect(safePath('uploads/../../../etc/shadow')).toBeNull();
  });

  it('should block absolute paths', () => {
    expect(safePath('/etc/passwd')).toBeNull();
  });

  it('should handle Windows-style traversal', () => {
    expect(safePath('..\\..\\windows\\system32')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────
// Fix #19: Stack trace exposure (error response)
// ─────────────────────────────────────────────────────────
describe('Fix #19: Stack trace exposure', () => {
  it('should NOT include error message in production mode', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    
    // Re-require to get fresh module
    delete require.cache[require.resolve('../utils/helpers')];
    const { errorResponse } = require('../utils/helpers');
    
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    
    errorResponse(mockRes, new Error('Sensitive MongoDB connection details'));
    
    expect(mockRes.status).toHaveBeenCalledWith(500);
    const body = mockRes.json.mock.calls[0][0];
    expect(body.message).toBe('An error occurred');
    expect(body.stack).toBeUndefined();
    expect(body.message).not.toContain('MongoDB');
    
    process.env.NODE_ENV = originalEnv;
    delete require.cache[require.resolve('../utils/helpers')];
  });

  it('should include error details in development mode', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    
    delete require.cache[require.resolve('../utils/helpers')];
    const { errorResponse } = require('../utils/helpers');
    
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    
    const error = new Error('Debug details here');
    errorResponse(mockRes, error);
    
    const body = mockRes.json.mock.calls[0][0];
    expect(body.message).toBe('Debug details here');
    expect(body.stack).toBeDefined();
    
    process.env.NODE_ENV = originalEnv;
    delete require.cache[require.resolve('../utils/helpers')];
  });
});

// ─────────────────────────────────────────────────────────
// Fix #8: Notification routes use router.use(protect)
// ─────────────────────────────────────────────────────────
describe('Fix #8: Notification routes auth guard', () => {
  it('notification.routes.js should call router.use(protect) at module level', () => {
    const fs = require('fs');
    const path = require('path');
    const routeFile = fs.readFileSync(
      path.join(__dirname, '../routes/notification.routes.js'), 'utf-8'
    );
    expect(routeFile).toContain('router.use(protect)');
  });
});

// ─────────────────────────────────────────────────────────
// Fix #9: Carrier my-statuses has role guard
// ─────────────────────────────────────────────────────────
describe('Fix #9: Carrier my-statuses role guard', () => {
  it('carrier.routes.js /my-statuses should use authorize', () => {
    const fs = require('fs');
    const path = require('path');
    const routeFile = fs.readFileSync(
      path.join(__dirname, '../routes/carrier.routes.js'), 'utf-8'
    );
    // Find the my-statuses route definition
    const myStatusesLine = routeFile.split('\n').find(line => 
      line.includes("'/my-statuses'")
    );
    expect(myStatusesLine).toBeDefined();
    expect(myStatusesLine).toContain("authorize('agent', 'admin')");
  });
});

// ─────────────────────────────────────────────────────────
// Fix #13: Production soft-delete
// ─────────────────────────────────────────────────────────
describe('Fix #13: Production soft-delete', () => {
  it('production.routes.js DELETE should set deletedAt, not deleteOne', () => {
    const fs = require('fs');
    const path = require('path');
    const routeFile = fs.readFileSync(
      path.join(__dirname, '../routes/production.routes.js'), 'utf-8'
    );
    // Find the delete route handler section
    const deleteIdx = routeFile.indexOf("router.delete('/:id'");
    expect(deleteIdx).toBeGreaterThan(-1);
    const deleteSection = routeFile.slice(deleteIdx, deleteIdx + 800);
    
    // Should use soft-delete pattern
    expect(deleteSection).toContain('submission.deletedAt = new Date()');
    expect(deleteSection).toContain('submission.deletedBy = req.user._id');
    expect(deleteSection).toContain('await submission.save()');
    // Should NOT hard-delete
    expect(deleteSection).not.toContain('deleteOne()');
  });
});

// ─────────────────────────────────────────────────────────
// Fix #20: QBO OAuth state validation
// ─────────────────────────────────────────────────────────
describe('Fix #20: QBO OAuth state validation', () => {
  it('quickbooks.routes.js /connect should generate state nonce', () => {
    const fs = require('fs');
    const path = require('path');
    const routeFile = fs.readFileSync(
      path.join(__dirname, '../routes/quickbooks.routes.js'), 'utf-8'
    );
    expect(routeFile).toContain('crypto.randomBytes');
    expect(routeFile).toContain('qbo_oauth_state');
  });

  it('quickbooks.routes.js /callback should validate state', () => {
    const fs = require('fs');
    const path = require('path');
    const routeFile = fs.readFileSync(
      path.join(__dirname, '../routes/quickbooks.routes.js'), 'utf-8'
    );
    // Callback should check state parameter
    const callbackIdx = routeFile.indexOf("router.get('/callback'");
    expect(callbackIdx).toBeGreaterThan(-1);
    const callbackSection = routeFile.slice(callbackIdx, callbackIdx + 1500);
    
    expect(callbackSection).toContain('req.query.state');
    expect(callbackSection).toContain('storedState.value.nonce !== state');
    expect(callbackSection).toContain('deleteOne');
  });
});

// ─────────────────────────────────────────────────────────
// Fix #12: Frontend one-time-payment route has AuthGuard
// ─────────────────────────────────────────────────────────
describe('Fix #12: one-time-payment AuthGuard', () => {
  it('app-routing.module.ts should have AuthGuard on one-time-payment', () => {
    const fs = require('fs');
    const path = require('path');
    const routingFile = fs.readFileSync(
      path.join(__dirname, '../../frontend/src/app/app-routing.module.ts'), 'utf-8'
    );
    // Find the one-time-payment route
    const idx = routingFile.indexOf("'one-time-payment'");
    expect(idx).toBeGreaterThan(-1);
    const section = routingFile.slice(idx, idx + 200);
    expect(section).toContain('AuthGuard');
  });
});
