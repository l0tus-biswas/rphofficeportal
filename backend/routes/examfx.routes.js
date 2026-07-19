const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { parse } = require('csv-parse/sync');
const ExamFXProgress = require('../models/ExamFXProgress');
const User = require('../models/User');
const Notification = require('../models/Notification');
const LicensingProgress = require('../models/LicensingProgress');
const examfxService = require('../utils/examfx.service');
const { protect: authenticate, authorize } = require('../middleware/auth.middleware');

// ─── Multer for CSV upload ───
const csvUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.mimetype === 'text/csv' || ext === '.csv') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

// ─── CSV parsing helpers ───
function parsePercent(val) {
  if (val == null || val === '') return null;
  const s = String(val).replace('%', '').trim();
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function parseTotalHours(val) {
  if (!val || val === '') return 0;
  const s = String(val).trim();
  let minutes = 0;
  const hrMatch = s.match(/([\d.]+)\s*hr/i);
  const minMatch = s.match(/([\d.]+)\s*min/i);
  if (hrMatch) minutes += parseFloat(hrMatch[1]) * 60;
  if (minMatch) minutes += parseFloat(minMatch[1]);
  return Math.round(minutes);
}

function parseCsvDate(val) {
  if (!val || val === '') return null;
  const s = String(val).trim();
  // MM-DD-YYYY format
  const parts = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (parts) {
    const d = new Date(`${parts[3]}-${parts[1]}-${parts[2]}T00:00:00`);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function parseNumber(val) {
  if (val == null || val === '') return null;
  const n = parseInt(String(val).trim(), 10);
  return isNaN(n) ? null : n;
}

function csvStatusToEnrollment(csvStatus) {
  if (!csvStatus) return 'not_enrolled';
  const s = csvStatus.trim().toLowerCase();
  if (s === 'active') return 'active';
  if (s === 'completed' || s === 'complete') return 'completed';
  if (s === 'expired') return 'expired';
  if (s === 'enrolled' || s === 'registered') return 'enrolled';
  return 'enrolled';
}

function csvStatusToCourseStatus(csvStatus, chapterProgress) {
  if (!csvStatus) return 'not_started';
  const s = csvStatus.trim().toLowerCase();
  if (s === 'completed' || s === 'complete') return 'completed';
  if (s === 'expired') return 'failed';
  const pct = parsePercent(chapterProgress);
  if (pct != null && pct > 0) return 'in_progress';
  return 'not_started';
}

function generateCourseId(courseName) {
  return (courseName || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
}

// ─────────────────────────────────────────────
// GET /api/examfx/config-status
// Check if ExamFX API is configured (admin only)
// ─────────────────────────────────────────────
router.get('/config-status', authenticate, authorize('admin'), async (req, res) => {
  try {
    res.json({
      configured: examfxService.isConfigured(),
      hasWebhookSecret: !!process.env.EXAMFX_WEBHOOK_SECRET,
      apiUrl: process.env.EXAMFX_API_URL ? '(set)' : '(not set)',
      orgId: process.env.EXAMFX_ORG_ID ? '(set)' : '(not set)'
    });
  } catch (error) {
    console.error('Error checking ExamFX config:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/examfx
// Get all ExamFX progress records
// Admin: all agents | Agent: own + downline
// ─────────────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      // Admin sees everyone
      const records = await ExamFXProgress.find()
        .populate('agent', 'name email phone referredBy')
        .populate('lastUpdatedBy', 'name')
        .sort({ updatedAt: -1 });

      return res.json(records);
    }

    // Agent: get own record + direct downline records
    const downlineIds = await _getDownlineIds(req.user._id);
    const allIds = [req.user._id, ...downlineIds];

    const records = await ExamFXProgress.find({ agent: { $in: allIds } })
      .populate('agent', 'name email phone referredBy')
      .populate('lastUpdatedBy', 'name')
      .sort({ updatedAt: -1 });

    res.json(records);
  } catch (error) {
    console.error('Error fetching ExamFX progress:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/examfx/summary
// Get a dashboard-friendly summary (admin or upline)
// ─────────────────────────────────────────────
router.get('/summary', authenticate, async (req, res) => {
  try {
    let query = {};

    if (req.user.role !== 'admin') {
      // Agent: only their downline
      const downlineIds = await _getDownlineIds(req.user._id);
      query = { agent: { $in: [req.user._id, ...downlineIds] } };
    }

    // Populated `agent` can be null if the referenced user was hard-deleted
    // without the ExamFXProgress record being cleaned up (e.g. by an older
    // purge run) — drop those orphaned records rather than crashing on them.
    const records = (await ExamFXProgress.find(query)
      .populate('agent', 'name email')
      .lean()).filter(r => r.agent);

    // Compute the most recent sync/import/update across all records
    let lastSynced = null;
    for (const r of records) {
      const candidates = [r.lastCsvImportDate, r.lastSyncDate, r.updatedAt].filter(Boolean);
      for (const d of candidates) {
        if (!lastSynced || new Date(d) > new Date(lastSynced)) lastSynced = d;
      }
    }

    const summary = {
      totalAgents: records.length,
      notEnrolled: records.filter(r => r.enrollmentStatus === 'not_enrolled').length,
      enrolled: records.filter(r => ['enrolled', 'active'].includes(r.enrollmentStatus)).length,
      completed: records.filter(r => r.enrollmentStatus === 'completed').length,
      expired: records.filter(r => r.enrollmentStatus === 'expired').length,
      averageProgress: records.length > 0
        ? Math.round(records.reduce((sum, r) => sum + (r.overallPercentComplete || 0), 0) / records.length)
        : 0,
      lastSynced,
      agents: records.map(r => ({
        agentId: r.agent._id,
        agentName: r.agent.name,
        agentEmail: r.agent.email,
        enrollmentStatus: r.enrollmentStatus,
        overallPercentComplete: r.overallPercentComplete,
        courseCount: r.courses.length,
        coursesCompleted: r.courses.filter(c => c.status === 'completed').length,
        lastSyncDate: r.lastSyncDate
      }))
    };

    res.json(summary);
  } catch (error) {
    console.error('Error fetching ExamFX summary:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/examfx/import-history
// Get CSV import history (admin only)
// ─────────────────────────────────────────────
router.get('/import-history', authenticate, authorize('admin'), async (req, res) => {
  try {
    // Populated `agent` can be null if the referenced user was hard-deleted
    // without the ExamFXProgress record being cleaned up — drop those
    // orphaned records rather than crashing on them.
    const records = (await ExamFXProgress.find({ lastCsvImportDate: { $ne: null } })
      .populate('agent', 'name email')
      .populate('csvImportedBy', 'name email')
      .select('agent lastCsvImportDate csvImportedBy enrollmentStatus overallPercentComplete courses updatedAt')
      .sort({ lastCsvImportDate: -1 })
      .lean()).filter(r => r.agent);

    // Group by import date (rounded to minute to group same upload batch)
    const batches = {};
    records.forEach(r => {
      const key = new Date(r.lastCsvImportDate).toISOString().slice(0, 16); // group by minute
      if (!batches[key]) {
        batches[key] = {
          importDate: r.lastCsvImportDate,
          importedBy: r.csvImportedBy,
          agents: []
        };
      }
      batches[key].agents.push({
        agentId: r.agent._id,
        agentName: r.agent.name,
        agentEmail: r.agent.email,
        enrollmentStatus: r.enrollmentStatus,
        overallPercentComplete: r.overallPercentComplete,
        courseCount: r.courses.length
      });
    });

    const history = Object.values(batches).sort((a, b) => new Date(b.importDate) - new Date(a.importDate));
    res.json(history);
  } catch (error) {
    console.error('Error fetching import history:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/examfx/:agentId
// Get specific agent's ExamFX progress
// ─────────────────────────────────────────────
router.get('/:agentId', authenticate, async (req, res) => {
  try {
    // Access control: admin, self, or upline
    if (req.user.role !== 'admin' && req.user._id.toString() !== req.params.agentId) {
      const isUpline = await _isUplineOf(req.user._id, req.params.agentId);
      if (!isUpline) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    let record = await ExamFXProgress.findOne({ agent: req.params.agentId })
      .populate('agent', 'name email phone')
      .populate('lastUpdatedBy', 'name');

    if (!record) {
      // Auto-create a blank record if agent exists
      const agent = await User.findById(req.params.agentId);
      if (!agent || agent.role !== 'agent') {
        return res.status(404).json({ message: 'Agent not found' });
      }

      record = new ExamFXProgress({
        agent: req.params.agentId,
        examfxEmail: agent.email,
        lastUpdatedBy: req.user._id
      });
      await record.save();

      record = await ExamFXProgress.findById(record._id)
        .populate('agent', 'name email phone')
        .populate('lastUpdatedBy', 'name');
    }

    res.json(record);
  } catch (error) {
    console.error('Error fetching ExamFX progress:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ─────────────────────────────────────────────
// PUT /api/examfx/:agentId
// Admin: manually update an agent's ExamFX progress
// ─────────────────────────────────────────────
router.put('/:agentId', authenticate, authorize('admin'), async (req, res) => {
  try {
    const agent = await User.findById(req.params.agentId);
    if (!agent || agent.role !== 'agent') {
      return res.status(404).json({ message: 'Agent not found' });
    }

    let record = await ExamFXProgress.findOne({ agent: req.params.agentId });

    if (!record) {
      record = new ExamFXProgress({
        agent: req.params.agentId,
        examfxEmail: agent.email
      });
    }

    // Allow updating these fields
    const allowedFields = [
      'examfxUserId', 'examfxEmail', 'enrollmentStatus', 'enrollmentDate',
      'overallPercentComplete', 'courses', 'practiceExams', 'adminNotes'
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        record[field] = req.body[field];
      }
    }

    record.manualOverride = true;
    record.lastUpdatedBy = req.user._id;
    await record.save();

    // If enrollment status changed to 'completed', auto-update licensing checklist
    if (req.body.enrollmentStatus === 'completed') {
      await _syncToLicensingChecklist(req.params.agentId, record, req.user._id);
    }

    await record.populate('agent', 'name email phone');
    await record.populate('lastUpdatedBy', 'name');

    res.json(record);
  } catch (error) {
    console.error('Error updating ExamFX progress:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ─────────────────────────────────────────────
// POST /api/examfx/:agentId/link
// Admin: link an agent to their ExamFX account
// ─────────────────────────────────────────────
router.post('/:agentId/link', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { examfxUserId, examfxEmail } = req.body;

    if (!examfxUserId && !examfxEmail) {
      return res.status(400).json({ message: 'Provide examfxUserId or examfxEmail' });
    }

    const agent = await User.findById(req.params.agentId);
    if (!agent || agent.role !== 'agent') {
      return res.status(404).json({ message: 'Agent not found' });
    }

    let record = await ExamFXProgress.findOne({ agent: req.params.agentId });

    if (!record) {
      record = new ExamFXProgress({ agent: req.params.agentId });
    }

    if (examfxUserId) record.examfxUserId = examfxUserId;
    if (examfxEmail) record.examfxEmail = examfxEmail;
    record.lastUpdatedBy = req.user._id;

    await record.save();
    await record.populate('agent', 'name email phone');

    res.json({ message: 'ExamFX account linked successfully', record });
  } catch (error) {
    console.error('Error linking ExamFX account:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ─────────────────────────────────────────────
// POST /api/examfx/:agentId/sync
// Admin: trigger a manual sync from ExamFX API for one agent
// ─────────────────────────────────────────────
router.post('/:agentId/sync', authenticate, authorize('admin'), async (req, res) => {
  try {
    if (!examfxService.isConfigured()) {
      return res.status(503).json({
        message: 'ExamFX API is not configured. Set EXAMFX_API_URL, EXAMFX_API_KEY, and EXAMFX_API_SECRET in your environment.'
      });
    }

    let record = await ExamFXProgress.findOne({ agent: req.params.agentId });
    if (!record || !record.examfxUserId) {
      return res.status(400).json({
        message: 'Agent has no linked ExamFX account. Link their ExamFX user ID first.'
      });
    }

    try {
      const apiData = await examfxService.getStudentProgress(record.examfxUserId);
      const normalized = examfxService.normalizeStudentProgress(apiData);

      // Update record with fresh data
      record.enrollmentStatus = normalized.enrollmentStatus;
      record.overallPercentComplete = normalized.overallPercentComplete;
      record.courses = normalized.courses;
      record.practiceExams = normalized.practiceExams;
      if (normalized.enrollmentDate) record.enrollmentDate = normalized.enrollmentDate;
      record.lastSyncDate = new Date();
      record.lastSyncStatus = 'success';
      record.lastSyncError = null;
      record.lastUpdatedBy = req.user._id;

      await record.save();

      // Auto-update licensing checklist if completed
      if (normalized.enrollmentStatus === 'completed' || record.overallPercentComplete === 100) {
        await _syncToLicensingChecklist(req.params.agentId, record, req.user._id);
      }

      await record.populate('agent', 'name email phone');
      res.json({ message: 'Sync successful', record });
    } catch (syncErr) {
      record.lastSyncDate = new Date();
      record.lastSyncStatus = 'failed';
      record.lastSyncError = syncErr.message;
      await record.save();

      res.status(502).json({
        message: 'Failed to sync with ExamFX API',
        error: syncErr.message
      });
    }
  } catch (error) {
    console.error('Error syncing ExamFX:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ─────────────────────────────────────────────
// POST /api/examfx/sync/all
// Admin: trigger a bulk sync for all linked agents
// ─────────────────────────────────────────────
router.post('/sync/all', authenticate, authorize('admin'), async (req, res) => {
  try {
    if (!examfxService.isConfigured()) {
      return res.status(503).json({
        message: 'ExamFX API is not configured.'
      });
    }

    const records = await ExamFXProgress.find({
      examfxUserId: { $ne: null, $exists: true }
    });

    const results = { success: 0, failed: 0, errors: [] };

    for (const record of records) {
      try {
        const apiData = await examfxService.getStudentProgress(record.examfxUserId);
        const normalized = examfxService.normalizeStudentProgress(apiData);

        record.enrollmentStatus = normalized.enrollmentStatus;
        record.overallPercentComplete = normalized.overallPercentComplete;
        record.courses = normalized.courses;
        record.practiceExams = normalized.practiceExams;
        if (normalized.enrollmentDate) record.enrollmentDate = normalized.enrollmentDate;
        record.lastSyncDate = new Date();
        record.lastSyncStatus = 'success';
        record.lastSyncError = null;

        await record.save();

        if (normalized.enrollmentStatus === 'completed' || record.overallPercentComplete === 100) {
          await _syncToLicensingChecklist(record.agent, record, req.user._id);
        }

        results.success++;
      } catch (syncErr) {
        record.lastSyncDate = new Date();
        record.lastSyncStatus = 'failed';
        record.lastSyncError = syncErr.message;
        await record.save();

        results.failed++;
        results.errors.push({
          agentId: record.agent,
          examfxUserId: record.examfxUserId,
          error: syncErr.message
        });
      }
    }

    res.json({
      message: `Bulk sync complete: ${results.success} succeeded, ${results.failed} failed`,
      results
    });
  } catch (error) {
    console.error('Error in bulk sync:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ─────────────────────────────────────────────
// POST /api/examfx/webhook
// ExamFX sends progress updates here (no auth middleware)
// ─────────────────────────────────────────────
router.post('/webhook', async (req, res) => {
  try {
    // Validate webhook signature
    const signature = req.headers['x-examfx-signature'] || req.headers['x-webhook-signature'];
    if (process.env.EXAMFX_WEBHOOK_SECRET) {
      if (!signature || !examfxService.validateWebhookSignature(req.body, signature)) {
        return res.status(401).json({ message: 'Invalid webhook signature' });
      }
    }

    const { event, data } = req.body;

    if (!event || !data) {
      return res.status(400).json({ message: 'Missing event or data' });
    }

    console.log(`[ExamFX Webhook] Event: ${event}`);

    // Find the agent record by ExamFX user ID or email
    let record = null;
    if (data.studentId || data.userId) {
      record = await ExamFXProgress.findOne({
        examfxUserId: data.studentId || data.userId
      });
    }
    if (!record && data.email) {
      record = await ExamFXProgress.findOne({ examfxEmail: data.email });
    }

    if (!record) {
      console.warn(`[ExamFX Webhook] No matching agent found for event: ${event}`);
      // Still return 200 to acknowledge receipt
      return res.status(200).json({ message: 'Acknowledged, no matching agent found' });
    }

    // Process based on event type
    switch (event) {
      case 'student.progress_updated':
      case 'progress.updated': {
        const normalized = examfxService.normalizeStudentProgress(data);
        record.enrollmentStatus = normalized.enrollmentStatus || record.enrollmentStatus;
        record.overallPercentComplete = normalized.overallPercentComplete;
        if (normalized.courses.length > 0) record.courses = normalized.courses;
        if (normalized.practiceExams.length > 0) record.practiceExams = normalized.practiceExams;
        record.lastSyncDate = new Date();
        record.lastSyncStatus = 'success';
        break;
      }
      case 'student.enrolled':
      case 'enrollment.created': {
        record.enrollmentStatus = 'enrolled';
        record.enrollmentDate = data.enrollmentDate || new Date();
        record.lastSyncDate = new Date();
        record.lastSyncStatus = 'success';
        break;
      }
      case 'course.completed':
      case 'student.course_completed': {
        // Update the specific course
        if (data.courseId) {
          const courseIdx = record.courses.findIndex(c => c.courseId === data.courseId);
          if (courseIdx >= 0) {
            record.courses[courseIdx].status = 'completed';
            record.courses[courseIdx].percentComplete = 100;
            record.courses[courseIdx].completedDate = data.completedDate || new Date();
            record.courses[courseIdx].score = data.score ?? record.courses[courseIdx].score;
            record.courses[courseIdx].passed = data.passed ?? true;
          } else {
            record.courses.push({
              courseId: data.courseId,
              courseName: data.courseName || data.courseId,
              status: 'completed',
              percentComplete: 100,
              completedDate: data.completedDate || new Date(),
              score: data.score ?? null,
              passed: data.passed ?? true
            });
          }
        }
        record.overallPercentComplete = data.overallProgress || record.overallPercentComplete;
        record.lastSyncDate = new Date();
        record.lastSyncStatus = 'success';
        break;
      }
      case 'exam.completed':
      case 'student.exam_completed': {
        record.practiceExams.push({
          examName: data.examName || data.courseId || 'Practice Exam',
          dateTaken: data.dateTaken || new Date(),
          score: data.score,
          passingScore: data.passingScore,
          passed: data.passed ?? (data.score >= data.passingScore),
          timeSpentMinutes: data.timeSpent || 0
        });
        record.lastSyncDate = new Date();
        record.lastSyncStatus = 'success';
        break;
      }
      case 'student.completed':
      case 'program.completed': {
        record.enrollmentStatus = 'completed';
        record.overallPercentComplete = 100;
        record.lastSyncDate = new Date();
        record.lastSyncStatus = 'success';

        // Notify the agent
        Notification.createNotification({
          userId: record.agent,
          type: 'license_submitted',
          title: 'ExamFX Course Completed!',
          message: 'Congratulations! You have completed your ExamFX pre-license course. Your licensing progress has been updated.',
          link: '/licensing'
        }, true).catch(() => {});

        // Notify upline chain
        Notification.notifyUplineChain(
          record.agent,
          'license_submitted',
          'Recruit Completed ExamFX Course',
          '{agentName} has completed their ExamFX pre-license course.',
          { link: '/examfx-progress' }
        ).catch(() => {});

        // Auto-update licensing checklist
        await _syncToLicensingChecklist(record.agent, record, null);
        break;
      }
      default:
        console.log(`[ExamFX Webhook] Unhandled event type: ${event}`);
    }

    await record.save();

    res.status(200).json({ message: 'Webhook processed successfully' });
  } catch (error) {
    console.error('[ExamFX Webhook] Error:', error);
    res.status(500).json({ message: 'Internal error processing webhook' });
  }
});

// ─────────────────────────────────────────────
// POST /api/examfx/upload-csv
// Admin: upload ExamFX CSV export to sync progress
// ─────────────────────────────────────────────
router.post('/upload-csv', authenticate, authorize('admin'), csvUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No CSV file provided. Send file in field "file".' });
    }

    // Parse CSV
    let rows;
    try {
      rows = parse(req.file.buffer.toString('utf-8'), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_quotes: true,
        relax_column_count: true
      });
    } catch (parseErr) {
      return res.status(400).json({ message: 'Failed to parse CSV file', error: parseErr.message });
    }

    if (rows.length === 0) {
      return res.status(400).json({ message: 'CSV file is empty or has no data rows.' });
    }

    // Validate required columns
    const firstRow = rows[0];
    const headers = Object.keys(firstRow);
    const requiredCols = ['Email', 'Course'];
    const missingCols = requiredCols.filter(c => !headers.some(h => h.trim().toLowerCase() === c.toLowerCase()));
    if (missingCols.length > 0) {
      return res.status(400).json({
        message: `CSV missing required columns: ${missingCols.join(', ')}`,
        foundColumns: headers
      });
    }

    // Normalize headers for lookup
    function getCol(row, ...names) {
      for (const name of names) {
        for (const key of Object.keys(row)) {
          if (key.trim().toLowerCase() === name.toLowerCase()) {
            return row[key];
          }
        }
      }
      return null;
    }

    // Pre-fetch all agents for email matching
    const allAgents = await User.find({ role: 'agent', deletedAt: null })
      .select('_id name email phone')
      .lean();
    const emailMap = {};
    for (const agent of allAgents) {
      if (agent.email) emailMap[agent.email.toLowerCase().trim()] = agent;
    }

    const results = {
      totalRows: rows.length,
      matched: 0,
      created: 0,
      updated: 0,
      unmatched: [],
      matchedDetails: [],
      errors: [],
      completedAgents: []
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowIndex = i + 2; // +2 for header row + 1-based

      try {
        const email = (getCol(row, 'Email') || '').trim().toLowerCase();
        const candidateName = getCol(row, 'Candidate') || '';
        const courseName = getCol(row, 'Course') || '';

        if (!email) {
          results.errors.push({ rowIndex, candidate: candidateName, reason: 'Missing email' });
          continue;
        }

        // Match agent by email
        const agent = emailMap[email];
        if (!agent) {
          results.unmatched.push({
            rowIndex,
            candidate: candidateName,
            email,
            course: courseName,
            reason: 'No matching agent found by email'
          });
          continue;
        }

        // Parse CSV fields
        const csvStatus = getCol(row, 'Status') || '';
        const chapterProgress = getCol(row, 'Chapter Progress');
        const progressPct = parsePercent(chapterProgress) || 0;
        const courseId = generateCourseId(courseName);

        const courseData = {
          courseId,
          courseName,
          status: csvStatusToCourseStatus(csvStatus, chapterProgress),
          percentComplete: progressPct,
          startedDate: parseCsvDate(getCol(row, 'First Activity Date')),
          lastAccessedDate: parseCsvDate(getCol(row, 'Last Activity Date')),
          score: parsePercent(getCol(row, 'Overall Chapter Quiz Average')),
          passed: (getCol(row, 'Certificate Status') || '').trim().toLowerCase() === 'valid',
          timeSpentMinutes: parseTotalHours(getCol(row, 'Total Hours')),
          scoreTrend: parsePercent(getCol(row, 'Score Trend')),
          activeAlerts: parseNumber(getCol(row, 'Active Alerts')),
          courseExpirationDate: parseCsvDate(getCol(row, 'Course Expiration Date')),
          licensingExamDate: parseCsvDate(getCol(row, 'Licensing Exam Date')),
          quizStats: {
            chapterQuizCount: parseNumber(getCol(row, 'Chapter Quiz Count')),
            chapterQuizzesPassed: parseNumber(getCol(row, 'Chapter Quizzes Passed')),
            quizPassRate: parsePercent(getCol(row, '% of Quizzes Passed')),
            overallQuizAverage: parsePercent(getCol(row, 'Overall Chapter Quiz Average'))
          },
          practiceExamScores: {
            examMode: {
              best: parsePercent(getCol(row, 'Best Practice Exam: Exam Mode')),
              average: parsePercent(getCol(row, 'Average Practice Exam: Exam Mode')),
              latest: parsePercent(getCol(row, 'Latest Practice Exam: Exam Mode')),
              attempts: parseNumber(getCol(row, 'Attempt Count Practice Exam: Exam Mode'))
            },
            learningMode: {
              best: parsePercent(getCol(row, 'Best Practice Exam: Learning Mode')),
              average: parsePercent(getCol(row, 'Average Practice Exam: Learning Mode')),
              latest: parsePercent(getCol(row, 'Latest Practice Exam: Learning Mode')),
              attempts: parseNumber(getCol(row, 'Attempt Count Practice Exam: Learning Mode'))
            }
          },
          readinessExamScores: {
            best: parsePercent(getCol(row, 'Best Readiness Exam')),
            average: parsePercent(getCol(row, 'Average Readiness Exam')),
            latest: parsePercent(getCol(row, 'Latest Readiness Exam')),
            attempts: parseNumber(getCol(row, 'Attempt Count Readiness Exam'))
          },
          certificateExam: {
            status: (getCol(row, 'Certificate Status') || '').trim() || null,
            best: parsePercent(getCol(row, 'Best Certificate Exam')),
            average: parsePercent(getCol(row, 'Average Certificate Exam')),
            latest: parsePercent(getCol(row, 'Latest Certificate Exam')),
            attempts: parseNumber(getCol(row, 'Attempt Count Certificate Exam'))
          }
        };

        // Find or create ExamFXProgress record
        let record = await ExamFXProgress.findOne({ agent: agent._id });
        const isNew = !record;

        if (!record) {
          record = new ExamFXProgress({
            agent: agent._id,
            examfxEmail: email
          });
          results.created++;
        } else {
          results.updated++;
        }

        // Update enrollment fields
        record.examfxEmail = email;
        record.enrollmentStatus = csvStatusToEnrollment(csvStatus);
        record.enrollmentDate = parseCsvDate(getCol(row, 'Registration')) || record.enrollmentDate;

        // Upsert the course entry (by courseId)
        const existingIdx = record.courses.findIndex(c => c.courseId === courseId);
        if (existingIdx >= 0) {
          // Preserve modules from existing entry, update everything else
          const existingModules = record.courses[existingIdx].modules;
          record.courses[existingIdx] = { ...courseData, modules: existingModules };
        } else {
          record.courses.push({ ...courseData, modules: [] });
        }

        // Recalculate overall progress (average across courses)
        if (record.courses.length > 0) {
          record.overallPercentComplete = Math.round(
            record.courses.reduce((sum, c) => sum + (c.percentComplete || 0), 0) / record.courses.length
          );
        }

        // Update sync metadata
        record.lastSyncDate = new Date();
        record.lastSyncStatus = 'success';
        record.lastSyncError = null;
        record.lastCsvImportDate = new Date();
        record.csvImportedBy = req.user._id;
        record.lastUpdatedBy = req.user._id;

        await record.save();

        results.matched++;
        results.matchedDetails.push({
          agentId: agent._id,
          agentName: agent.name,
          agentEmail: agent.email,
          course: courseName,
          progress: progressPct,
          enrollmentStatus: record.enrollmentStatus,
          certificateStatus: courseData.certificateExam.status
        });

        // If certificate is valid → auto-update licensing checklist
        if (courseData.passed) {
          results.completedAgents.push({ agentId: agent._id, agentName: agent.name, course: courseName });
          await _syncToLicensingChecklist(agent._id, record, req.user._id);
        }
      } catch (rowErr) {
        results.errors.push({
          rowIndex,
          candidate: getCol(row, 'Candidate') || '',
          reason: rowErr.message
        });
      }
    }

    res.json({
      message: `CSV import complete: ${results.matched} agents matched, ${results.unmatched.length} unmatched`,
      ...results
    });
  } catch (error) {
    console.error('Error processing ExamFX CSV upload:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ─────────────────────────────────────────────
// DELETE /api/examfx/:agentId
// Admin: remove an agent's ExamFX record
// ─────────────────────────────────────────────
router.delete('/:agentId', authenticate, authorize('admin'), async (req, res) => {
  try {
    const result = await ExamFXProgress.findOneAndDelete({ agent: req.params.agentId });
    if (!result) {
      return res.status(404).json({ message: 'No ExamFX record found for this agent' });
    }
    res.json({ message: 'ExamFX record deleted' });
  } catch (error) {
    console.error('Error deleting ExamFX record:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ═════════════════════════════════════════════
// HELPER FUNCTIONS
// ═════════════════════════════════════════════

/**
 * Get IDs of an agent's direct downline (recruits)
 */
async function _getDownlineIds(agentId) {
  const downline = await User.find({ referredBy: agentId, role: 'agent' }).select('_id').lean();
  return downline.map(d => d._id);
}

/**
 * Check if userA is in the upline chain of userB
 */
async function _isUplineOf(uplineId, agentId) {
  let current = await User.findById(agentId).select('referredBy').lean();
  let depth = 0;
  const maxDepth = 10; // prevent infinite loops

  while (current && current.referredBy && depth < maxDepth) {
    if (current.referredBy.toString() === uplineId.toString()) {
      return true;
    }
    current = await User.findById(current.referredBy).select('referredBy').lean();
    depth++;
  }
  return false;
}

/**
 * Auto-update the LicensingProgress checklist when ExamFX course is completed
 */
async function _syncToLicensingChecklist(agentId, examfxRecord, updatedBy) {
  try {
    let licensing = await LicensingProgress.findOne({ agent: agentId });

    if (!licensing) {
      // Create licensing record if it doesn't exist
      const agent = await User.findById(agentId);
      if (!agent) return;

      const enrollmentDate = agent.createdAt || new Date();
      const licensingDeadline = new Date(enrollmentDate);
      licensingDeadline.setDate(licensingDeadline.getDate() + 60);

      licensing = new LicensingProgress({
        agent: agentId,
        enrollmentDate,
        licensingDeadline
      });
    }

    // Mark pre-license course as completed
    if (!licensing.checklist.preLicenseCourse.completed) {
      licensing.checklist.preLicenseCourse.completed = true;
      licensing.checklist.preLicenseCourse.completedDate = new Date();
      licensing.checklist.preLicenseCourse.notes =
        `Auto-updated from ExamFX. Overall progress: ${examfxRecord.overallPercentComplete}%`;
      if (updatedBy) licensing.lastUpdatedBy = updatedBy;
      await licensing.save();
    }
  } catch (error) {
    console.error('Error syncing ExamFX to licensing checklist:', error);
  }
}

module.exports = router;
