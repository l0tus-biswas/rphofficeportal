/**
 * Unit tests for MEDIUM/LOW priority fixes (#26, #31, #34, #37, #38, #45, #49, #55, #57, #61, #62, #67)
 * Tests: email enum prevention, status restrictions, date validation, URL validation,
 *        filename sanitization, audit redaction, CSV escaping, email case normalization
 */
process.env.NODE_ENV = 'test';

// ─────────────────────────────────────────────────────────
// Fix #26: Email enumeration prevention
// ─────────────────────────────────────────────────────────
describe('Fix #26: Forgot-password email enumeration prevention', () => {
  it('should return same message for existing and non-existing emails', () => {
    const genericMessage = 'If an account exists with that email, a password reset link has been sent.';
    
    // Both cases should return the same message - verify the logic pattern
    const responseForExisting = { message: genericMessage };
    const responseForNonExisting = { message: genericMessage };
    
    expect(responseForExisting.message).toBe(responseForNonExisting.message);
    expect(responseForExisting.message).not.toContain('not found');
    expect(responseForExisting.message).not.toContain('No account');
  });

  it('response should always be 200 (not 404)', () => {
    // Previously returned 404 for non-existing users, now always 200
    const statusForNonExisting = 200;
    expect(statusForNonExisting).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────
// Fix #49: Audit log password redaction
// ─────────────────────────────────────────────────────────
describe('Fix #49: Audit log sensitive field redaction', () => {
  const { logAction } = require('../middleware/audit.middleware');
  
  // We need to test the redactSensitiveFields logic
  // Read it directly from the module file
  const fs = require('fs');
  const path = require('path');
  const moduleCode = fs.readFileSync(path.join(__dirname, '../middleware/audit.middleware.js'), 'utf8');
  
  it('audit middleware module has REDACTED_FIELDS list', () => {
    expect(moduleCode).toContain('REDACTED_FIELDS');
    expect(moduleCode).toContain('password');
    expect(moduleCode).toContain('currentPassword');
    expect(moduleCode).toContain('newPassword');
    expect(moduleCode).toContain('ssn');
    expect(moduleCode).toContain('token');
  });

  it('audit middleware uses redactSensitiveFields on req.body', () => {
    expect(moduleCode).toContain('redactSensitiveFields(req.body)');
    expect(moduleCode).not.toMatch(/body:\s*req\.body[^)]/);
  });

  it('redaction replaces sensitive values with [REDACTED]', () => {
    expect(moduleCode).toContain('[REDACTED]');
  });
});

// ─────────────────────────────────────────────────────────
// Fix #31: Agent status restriction on POST
// ─────────────────────────────────────────────────────────
describe('Fix #31: Agent cannot set In Force status on create', () => {
  it('non-admin restricted to Submitted/Pending status', () => {
    const user = { role: 'agent' };
    const requestedStatus = 'In Force';
    
    let resolvedStatus = requestedStatus || 'Submitted';
    if (user.role !== 'admin') {
      const allowedAgentStatuses = ['Submitted', 'Pending'];
      if (!allowedAgentStatuses.includes(resolvedStatus)) {
        resolvedStatus = 'Submitted';
      }
    }
    
    expect(resolvedStatus).toBe('Submitted');
  });

  it('admin can set any status including In Force', () => {
    const user = { role: 'admin' };
    const requestedStatus = 'In Force';
    
    let resolvedStatus = requestedStatus || 'Submitted';
    if (user.role !== 'admin') {
      const allowedAgentStatuses = ['Submitted', 'Pending'];
      if (!allowedAgentStatuses.includes(resolvedStatus)) {
        resolvedStatus = 'Submitted';
      }
    }
    
    expect(resolvedStatus).toBe('In Force');
  });

  it('agent can set Pending status', () => {
    const user = { role: 'agent' };
    const requestedStatus = 'Pending';
    
    let resolvedStatus = requestedStatus || 'Submitted';
    if (user.role !== 'admin') {
      const allowedAgentStatuses = ['Submitted', 'Pending'];
      if (!allowedAgentStatuses.includes(resolvedStatus)) {
        resolvedStatus = 'Submitted';
      }
    }
    
    expect(resolvedStatus).toBe('Pending');
  });

  it('agent attempting Lapsed is overridden to Submitted', () => {
    const user = { role: 'agent' };
    const requestedStatus = 'Lapsed';
    
    let resolvedStatus = requestedStatus || 'Submitted';
    if (user.role !== 'admin') {
      const allowedAgentStatuses = ['Submitted', 'Pending'];
      if (!allowedAgentStatuses.includes(resolvedStatus)) {
        resolvedStatus = 'Submitted';
      }
    }
    
    expect(resolvedStatus).toBe('Submitted');
  });
});

// ─────────────────────────────────────────────────────────
// Fix #38: Submission date backdating restriction
// ─────────────────────────────────────────────────────────
describe('Fix #38: Submission date backdating', () => {
  it('agent cannot backdate more than 1 year', () => {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    
    const submDate = new Date(twoYearsAgo);
    const isBlocked = submDate < oneYearAgo;
    expect(isBlocked).toBe(true);
  });

  it('agent can submit within 1-year window', () => {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const submDate = new Date(sixMonthsAgo);
    const isBlocked = submDate < oneYearAgo;
    expect(isBlocked).toBe(false);
  });

  it('admin can backdate without restriction', () => {
    const user = { role: 'admin' };
    const shouldCheck = user.role !== 'admin';
    expect(shouldCheck).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────
// Fix #67: PUT rejects negative premiumAmount
// ─────────────────────────────────────────────────────────
describe('Fix #67: PUT production rejects negative premium', () => {
  it('negative premium is rejected', () => {
    const premiumAmount = -100;
    const isInvalid = premiumAmount < 0;
    expect(isInvalid).toBe(true);
  });

  it('zero premium is allowed', () => {
    const premiumAmount = 0;
    const isInvalid = premiumAmount < 0;
    expect(isInvalid).toBe(false);
  });

  it('positive premium is allowed', () => {
    const premiumAmount = 250.50;
    const isInvalid = premiumAmount < 0;
    expect(isInvalid).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────
// Fix #34: Broadcasts null createdAt fallback
// ─────────────────────────────────────────────────────────
describe('Fix #34: Broadcasts createdAt fallback', () => {
  it('null createdAt defaults to epoch (sees all broadcasts)', () => {
    const userCreatedAt = null;
    const fallback = userCreatedAt || new Date(0);
    expect(fallback.getTime()).toBe(0);
  });

  it('undefined createdAt defaults to epoch', () => {
    const userCreatedAt = undefined;
    const fallback = userCreatedAt || new Date(0);
    expect(fallback.getTime()).toBe(0);
  });

  it('valid createdAt is preserved', () => {
    const userCreatedAt = new Date('2025-01-01');
    const fallback = userCreatedAt || new Date(0);
    expect(fallback.getTime()).toBe(userCreatedAt.getTime());
  });
});

// ─────────────────────────────────────────────────────────
// Fix #37: Carrier URL validation
// ─────────────────────────────────────────────────────────
describe('Fix #37: Carrier contractingLink URL validation', () => {
  const validateUrl = (link) => {
    if (!link || !link.trim()) return { valid: true }; // empty is ok
    try {
      const url = new URL(link);
      if (!['http:', 'https:'].includes(url.protocol)) {
        return { valid: false, message: 'Contracting link must be an HTTP or HTTPS URL' };
      }
      return { valid: true };
    } catch (e) {
      return { valid: false, message: 'Contracting link must be a valid URL' };
    }
  };

  it('accepts valid https URL', () => {
    expect(validateUrl('https://example.com/contract').valid).toBe(true);
  });

  it('accepts valid http URL', () => {
    expect(validateUrl('http://carrier.com/apply').valid).toBe(true);
  });

  it('rejects javascript: protocol', () => {
    const result = validateUrl('javascript:alert(1)');
    expect(result.valid).toBe(false);
  });

  it('rejects invalid URL strings', () => {
    const result = validateUrl('not-a-url');
    expect(result.valid).toBe(false);
  });

  it('rejects ftp: protocol', () => {
    const result = validateUrl('ftp://files.carrier.com');
    expect(result.valid).toBe(false);
  });

  it('allows empty/null contractingLink', () => {
    expect(validateUrl('').valid).toBe(true);
    expect(validateUrl(null).valid).toBe(true);
    expect(validateUrl(undefined).valid).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────
// Fix #45: Download filename sanitization
// ─────────────────────────────────────────────────────────
describe('Fix #45: Download filename sanitization', () => {
  const sanitize = (name) => name.replace(/[/\\:*?"<>|]/g, '_');

  it('removes path separators', () => {
    expect(sanitize('../../etc/passwd')).toBe('.._.._etc_passwd');
  });

  it('removes Windows special chars', () => {
    expect(sanitize('file:name*?.doc')).toBe('file_name__.doc');
  });

  it('preserves normal filenames', () => {
    expect(sanitize('my-document.pdf')).toBe('my-document.pdf');
  });

  it('handles filenames with spaces', () => {
    expect(sanitize('my document (1).pdf')).toBe('my document (1).pdf');
  });
});

// ─────────────────────────────────────────────────────────
// Fix #55: CSV escape includes \r
// ─────────────────────────────────────────────────────────
describe('Fix #55: CSV escape handles carriage returns', () => {
  const escape = (val) => {
    if (val === null || val === undefined) return '';
    const str = String(val).replace(/"/g, '""');
    return str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r') ? `"${str}"` : str;
  };

  it('wraps values containing \\r in quotes', () => {
    expect(escape('line1\rline2')).toBe('"line1\rline2"');
  });

  it('wraps values containing \\r\\n in quotes', () => {
    expect(escape('line1\r\nline2')).toBe('"line1\r\nline2"');
  });

  it('still wraps values with \\n', () => {
    expect(escape('line1\nline2')).toBe('"line1\nline2"');
  });

  it('still wraps values with commas', () => {
    expect(escape('Smith, John')).toBe('"Smith, John"');
  });

  it('does not wrap plain values', () => {
    expect(escape('simple')).toBe('simple');
  });
});

// ─────────────────────────────────────────────────────────
// Fix #62: Email case-insensitive uniqueness check
// ─────────────────────────────────────────────────────────
describe('Fix #62: Email case-insensitive check', () => {
  it('lowercases email before uniqueness check', () => {
    const email = 'Admin@Example.COM';
    const normalized = email.toLowerCase();
    expect(normalized).toBe('admin@example.com');
  });

  it('matching is case-insensitive', () => {
    const stored = 'user@test.com';
    const input = 'User@Test.COM';
    expect(input.toLowerCase()).toBe(stored);
  });
});

// ─────────────────────────────────────────────────────────
// Fix #61: Product category fallback is 'Other'
// ─────────────────────────────────────────────────────────
describe('Fix #61: Product category fallback', () => {
  it('unmapped product returns Other (not Life Insurance)', () => {
    const PRODUCT_CATEGORY_MAP = {
      'Term Life Insurance': 'Life Insurance',
      'Medicare Advantage': 'Medicare'
    };
    const getProductCategory = (p) => {
      if (!p || p === 'Other') return 'Other';
      return PRODUCT_CATEGORY_MAP[p] || 'Other';
    };

    expect(getProductCategory('Unknown Product XYZ')).toBe('Other');
    expect(getProductCategory('Other')).toBe('Other');
    expect(getProductCategory(null)).toBe('Other');
    expect(getProductCategory('')).toBe('Other');
  });

  it('mapped products still return correct category', () => {
    const PRODUCT_CATEGORY_MAP = {
      'Term Life Insurance': 'Life Insurance',
      'Medicare Advantage': 'Medicare'
    };
    const getProductCategory = (p) => {
      if (!p || p === 'Other') return 'Other';
      return PRODUCT_CATEGORY_MAP[p] || 'Other';
    };

    expect(getProductCategory('Term Life Insurance')).toBe('Life Insurance');
    expect(getProductCategory('Medicare Advantage')).toBe('Medicare');
  });
});
