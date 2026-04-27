/**
 * ExamFX API Service
 * 
 * Handles communication with the ExamFX platform API.
 * 
 * ExamFX does not have a publicly documented REST API, so this service 
 * is built to support multiple integration strategies:
 * 
 * 1. REST API (if credentials/docs are provided by ExamFX)
 * 2. Webhook receiver (ExamFX pushes progress updates)
 * 3. Manual sync (admin manually updates progress)
 * 
 * Environment variables required:
 *   EXAMFX_API_URL      - Base URL of ExamFX API (e.g., https://api.examfx.com/v1)
 *   EXAMFX_API_KEY       - API key for authentication
 *   EXAMFX_API_SECRET    - API secret for authentication
 *   EXAMFX_WEBHOOK_SECRET - Secret to validate incoming webhook payloads
 *   EXAMFX_ORG_ID        - Organization/company ID in ExamFX
 */

const crypto = require('crypto');

class ExamFXService {
  constructor() {
    this.apiUrl = process.env.EXAMFX_API_URL || '';
    this.apiKey = process.env.EXAMFX_API_KEY || '';
    this.apiSecret = process.env.EXAMFX_API_SECRET || '';
    this.webhookSecret = process.env.EXAMFX_WEBHOOK_SECRET || '';
    this.orgId = process.env.EXAMFX_ORG_ID || '';
  }

  /**
   * Check if API credentials are configured
   */
  isConfigured() {
    return !!(this.apiUrl && this.apiKey && this.apiSecret);
  }

  /**
   * Get authorization headers for ExamFX API
   */
  _getHeaders() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'X-API-Secret': this.apiSecret,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  /**
   * Make an authenticated request to ExamFX API
   */
  async _request(method, endpoint, body = null) {
    if (!this.isConfigured()) {
      throw new Error('ExamFX API is not configured. Set EXAMFX_API_URL, EXAMFX_API_KEY, and EXAMFX_API_SECRET environment variables.');
    }

    const url = `${this.apiUrl}${endpoint}`;
    const options = {
      method,
      headers: this._getHeaders()
    };

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ExamFX API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  /**
   * Get all students/users enrolled under the organization
   */
  async getEnrolledStudents() {
    return this._request('GET', `/organizations/${this.orgId}/students`);
  }

  /**
   * Get a specific student's progress by their ExamFX user ID
   */
  async getStudentProgress(examfxUserId) {
    return this._request('GET', `/students/${examfxUserId}/progress`);
  }

  /**
   * Get a specific student's course details
   */
  async getStudentCourses(examfxUserId) {
    return this._request('GET', `/students/${examfxUserId}/courses`);
  }

  /**
   * Look up a student by email
   */
  async findStudentByEmail(email) {
    return this._request('GET', `/organizations/${this.orgId}/students?email=${encodeURIComponent(email)}`);
  }

  /**
   * Get practice exam results for a student
   */
  async getStudentExamResults(examfxUserId) {
    return this._request('GET', `/students/${examfxUserId}/exams`);
  }

  /**
   * Validate a webhook signature from ExamFX
   */
  validateWebhookSignature(payload, signature) {
    if (!this.webhookSecret) {
      console.warn('EXAMFX_WEBHOOK_SECRET not set — skipping signature validation');
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(typeof payload === 'string' ? payload : JSON.stringify(payload))
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature || '', 'utf8'),
      Buffer.from(expectedSignature, 'utf8')
    );
  }

  /**
   * Normalize ExamFX API response to our internal format.
   * Adapt this mapping once actual ExamFX API response shape is known.
   */
  normalizeStudentProgress(apiResponse) {
    // This is a best-guess mapping. Update once real API docs are available.
    return {
      examfxUserId: apiResponse.id || apiResponse.studentId || apiResponse.userId,
      examfxEmail: apiResponse.email,
      enrollmentStatus: this._mapEnrollmentStatus(apiResponse.status),
      enrollmentDate: apiResponse.enrollmentDate || apiResponse.createdAt,
      overallPercentComplete: apiResponse.overallProgress || apiResponse.percentComplete || 0,
      courses: (apiResponse.courses || []).map(course => ({
        courseId: course.id || course.courseId,
        courseName: course.name || course.courseName || course.title,
        status: this._mapCourseStatus(course.status),
        percentComplete: course.progress || course.percentComplete || 0,
        startedDate: course.startDate || course.startedAt,
        completedDate: course.completionDate || course.completedAt,
        lastAccessedDate: course.lastAccessDate || course.lastAccessedAt,
        score: course.score ?? null,
        passingScore: course.passingScore ?? null,
        passed: course.passed ?? (course.score >= course.passingScore),
        timeSpentMinutes: course.timeSpent || course.timeSpentMinutes || 0,
        modules: (course.modules || course.chapters || []).map(mod => ({
          moduleId: mod.id || mod.moduleId,
          moduleName: mod.name || mod.moduleName || mod.title,
          status: this._mapCourseStatus(mod.status),
          percentComplete: mod.progress || mod.percentComplete || 0,
          completedDate: mod.completionDate || mod.completedAt
        }))
      })),
      practiceExams: (apiResponse.practiceExams || apiResponse.exams || []).map(exam => ({
        examName: exam.name || exam.examName || exam.title,
        dateTaken: exam.dateTaken || exam.date || exam.completedAt,
        score: exam.score,
        passingScore: exam.passingScore,
        passed: exam.passed ?? (exam.score >= exam.passingScore),
        timeSpentMinutes: exam.timeSpent || exam.timeSpentMinutes || 0
      }))
    };
  }

  _mapEnrollmentStatus(status) {
    if (!status) return 'not_enrolled';
    const s = String(status).toLowerCase();
    if (['active', 'enrolled', 'in_progress'].includes(s)) return 'active';
    if (['completed', 'graduated', 'finished'].includes(s)) return 'completed';
    if (['expired', 'inactive', 'suspended'].includes(s)) return 'expired';
    if (['enrolled', 'registered'].includes(s)) return 'enrolled';
    return 'not_enrolled';
  }

  _mapCourseStatus(status) {
    if (!status) return 'not_started';
    const s = String(status).toLowerCase();
    if (['completed', 'passed', 'finished'].includes(s)) return 'completed';
    if (['in_progress', 'active', 'started'].includes(s)) return 'in_progress';
    if (['failed', 'not_passed'].includes(s)) return 'failed';
    return 'not_started';
  }
}

module.exports = new ExamFXService();
