const express = require('express');
const router = express.Router();
const ExamFXProgress = require('../models/ExamFXProgress');
const User = require('../models/User');
const Notification = require('../models/Notification');
const LicensingProgress = require('../models/LicensingProgress');
const examfxService = require('../utils/examfx.service');
const { protect: authenticate, authorize } = require('../middleware/auth.middleware');

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

    const records = await ExamFXProgress.find(query)
      .populate('agent', 'name email')
      .lean();

    const summary = {
      totalAgents: records.length,
      notEnrolled: records.filter(r => r.enrollmentStatus === 'not_enrolled').length,
      enrolled: records.filter(r => ['enrolled', 'active'].includes(r.enrollmentStatus)).length,
      completed: records.filter(r => r.enrollmentStatus === 'completed').length,
      expired: records.filter(r => r.enrollmentStatus === 'expired').length,
      averageProgress: records.length > 0
        ? Math.round(records.reduce((sum, r) => sum + (r.overallPercentComplete || 0), 0) / records.length)
        : 0,
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
