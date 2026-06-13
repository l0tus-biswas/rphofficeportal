/**
 * Unit Tests: utils/examfx.service.js
 * Tests ExamFX service instance (singleton)
 */

describe('Utils: ExamFXService', () => {
  let service;

  beforeEach(() => {
    jest.resetModules();
    process.env.EXAMFX_API_URL = 'https://api.examfx.com/v1';
    process.env.EXAMFX_API_KEY = 'test-api-key';
    process.env.EXAMFX_API_SECRET = 'test-api-secret';
    process.env.EXAMFX_WEBHOOK_SECRET = 'test-webhook-secret';
    process.env.EXAMFX_ORG_ID = 'org123';
    service = require('../../utils/examfx.service');
  });

  describe('initialization', () => {
    it('should initialize with environment variables', () => {
      expect(service.apiUrl).toBe('https://api.examfx.com/v1');
      expect(service.apiKey).toBe('test-api-key');
      expect(service.apiSecret).toBe('test-api-secret');
      expect(service.webhookSecret).toBe('test-webhook-secret');
      expect(service.orgId).toBe('org123');
    });

    it('should default to empty strings when env vars missing', () => {
      delete process.env.EXAMFX_API_URL;
      delete process.env.EXAMFX_API_KEY;
      delete process.env.EXAMFX_API_SECRET;
      jest.resetModules();
      const svc = require('../../utils/examfx.service');
      expect(svc.apiUrl).toBe('');
      expect(svc.apiKey).toBe('');
      expect(svc.apiSecret).toBe('');
    });
  });

  describe('isConfigured', () => {
    it('should return true when all credentials are set', () => {
      expect(service.isConfigured()).toBe(true);
    });

    it('should return false when apiUrl is missing', () => {
      delete process.env.EXAMFX_API_URL;
      jest.resetModules();
      const svc = require('../../utils/examfx.service');
      expect(svc.isConfigured()).toBe(false);
    });

    it('should return false when apiKey is missing', () => {
      delete process.env.EXAMFX_API_KEY;
      jest.resetModules();
      const svc = require('../../utils/examfx.service');
      expect(svc.isConfigured()).toBe(false);
    });
  });

  describe('_getHeaders', () => {
    it('should return proper authorization headers', () => {
      const headers = service._getHeaders();
      expect(headers['Authorization']).toBe('Bearer test-api-key');
      expect(headers['X-API-Secret']).toBe('test-api-secret');
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Accept']).toBe('application/json');
    });
  });

  describe('_request', () => {
    it('should throw when not configured', async () => {
      delete process.env.EXAMFX_API_URL;
      jest.resetModules();
      const svc = require('../../utils/examfx.service');
      await expect(svc._request('GET', '/test')).rejects.toThrow('not configured');
    });

    it('should make fetch call with correct URL and headers', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: 'test' })
      });
      const result = await service._request('GET', '/students');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.examfx.com/v1/students',
        expect.objectContaining({ method: 'GET' })
      );
      expect(result).toEqual({ data: 'test' });
      delete global.fetch;
    });

    it('should include body for POST requests', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true })
      });
      await service._request('POST', '/enroll', { studentId: '123' });
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ studentId: '123' })
        })
      );
      delete global.fetch;
    });

    it('should throw on non-ok response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not Found')
      });
      await expect(service._request('GET', '/missing')).rejects.toThrow('ExamFX API error (404)');
      delete global.fetch;
    });
  });

  describe('validateWebhookSignature', () => {
    it('should validate correct HMAC signature', () => {
      const crypto = require('crypto');
      const payload = JSON.stringify({ event: 'progress_updated' });
      const expectedSig = crypto.createHmac('sha256', 'test-webhook-secret').update(payload).digest('hex');
      expect(service.validateWebhookSignature(payload, expectedSig)).toBe(true);
    });

    it('should reject invalid signature (throws on different length)', () => {
      const payload = JSON.stringify({ event: 'test' });
      // timingSafeEqual throws RangeError when buffer lengths differ
      let threw = false;
      try {
        service.validateWebhookSignature(payload, 'invalid-sig');
      } catch (e) {
        threw = true;
        expect(e.name).toBe('RangeError');
        expect(e.message).toMatch(/same byte length/i);
      }
      expect(threw).toBe(true);
    });

    it('should return false when webhook secret is not set', () => {
      delete process.env.EXAMFX_WEBHOOK_SECRET;
      jest.resetModules();
      const svc = require('../../utils/examfx.service');
      expect(svc.validateWebhookSignature('payload', 'sig')).toBe(false);
    });
  });

  describe('normalizeStudentProgress', () => {
    it('should normalize a basic API response', () => {
      const result = service.normalizeStudentProgress({
        id: 'student1',
        email: 'student@test.com',
        status: 'active',
        overallProgress: 75,
        courses: [],
        practiceExams: []
      });
      expect(result.examfxUserId).toBe('student1');
      expect(result.examfxEmail).toBe('student@test.com');
      expect(result.enrollmentStatus).toBe('active');
      expect(result.overallPercentComplete).toBe(75);
    });

    it('should normalize courses with modules', () => {
      const result = service.normalizeStudentProgress({
        id: 's1',
        email: 'test@test.com',
        status: 'active',
        courses: [{
          id: 'c1',
          name: 'Life Insurance',
          status: 'in_progress',
          progress: 50,
          modules: [{ id: 'm1', name: 'Module 1', status: 'completed', progress: 100 }]
        }],
        practiceExams: []
      });
      expect(result.courses).toHaveLength(1);
      expect(result.courses[0].courseName).toBe('Life Insurance');
      expect(result.courses[0].modules).toHaveLength(1);
    });

    it('should handle empty response', () => {
      const result = service.normalizeStudentProgress({});
      expect(result.overallPercentComplete).toBe(0);
      expect(result.courses).toEqual([]);
      expect(result.practiceExams).toEqual([]);
    });
  });

  describe('_mapEnrollmentStatus', () => {
    it('should map active statuses', () => {
      expect(service._mapEnrollmentStatus('active')).toBe('active');
      expect(service._mapEnrollmentStatus('enrolled')).toBe('active');
      expect(service._mapEnrollmentStatus('in_progress')).toBe('active');
    });

    it('should map completed statuses', () => {
      expect(service._mapEnrollmentStatus('completed')).toBe('completed');
      expect(service._mapEnrollmentStatus('graduated')).toBe('completed');
    });

    it('should map expired statuses', () => {
      expect(service._mapEnrollmentStatus('expired')).toBe('expired');
      expect(service._mapEnrollmentStatus('inactive')).toBe('expired');
    });

    it('should default to not_enrolled', () => {
      expect(service._mapEnrollmentStatus(null)).toBe('not_enrolled');
      expect(service._mapEnrollmentStatus('unknown')).toBe('not_enrolled');
    });
  });

  describe('_mapCourseStatus', () => {
    it('should map completed statuses', () => {
      expect(service._mapCourseStatus('completed')).toBe('completed');
      expect(service._mapCourseStatus('passed')).toBe('completed');
    });

    it('should map in_progress statuses', () => {
      expect(service._mapCourseStatus('in_progress')).toBe('in_progress');
      expect(service._mapCourseStatus('active')).toBe('in_progress');
    });

    it('should map failed statuses', () => {
      expect(service._mapCourseStatus('failed')).toBe('failed');
      expect(service._mapCourseStatus('not_passed')).toBe('failed');
    });

    it('should default to not_started', () => {
      expect(service._mapCourseStatus(null)).toBe('not_started');
      expect(service._mapCourseStatus('unknown')).toBe('not_started');
    });
  });
});
