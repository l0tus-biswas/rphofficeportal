const express = require('express');
const router = express.Router();
const multer = require('../utils/multer');
const APAApplication = require('../models/APAApplication');
const Notification = require('../models/Notification');
const OnboardingDocument = require('../models/OnboardingDocument');
const OnboardingDocType = require('../models/OnboardingDocType');
const User = require('../models/User');
const SystemConfig = require('../models/SystemConfig');
const { protect, authorize } = require('../middleware/auth.middleware');
const { sendResponse, errorResponse } = require('../utils/helpers');
const { sendNotificationEmail } = require('../utils/neuzmail');
const { shapeVersionHistory } = require('../utils/apaSigning');
const {
  getActiveTemplateId,
  updateTemplateDocument,
  createTemplateFromPDF,
  getTemplateInfo
} = require('../utils/zohosign'); // migrated from docusign.js — see note in apa.routes.js

// Multer for APA template PDF upload (in-memory, 20MB limit)
const templateUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  },
  limits: { fileSize: 20 * 1024 * 1024 }
});

// All routes require admin authentication
router.use(protect);
router.use(authorize('admin'));

// @route   GET /api/admin/apa-applications
// @desc    Get all APA applications with filtering
// @access  Admin only
router.get('/apa-applications', async (req, res) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 20));
    
    // Applications of deleted users stay hidden (soft-delete cascades deletedAt)
    const query = { deletedAt: null };
    
    // Filter by status
    if (status && status !== 'all') {
      query.status = status;
    }
    
    // Search by name or email
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { 'personalInfo.legalFirstName': { $regex: escaped, $options: 'i' } },
        { 'personalInfo.legalLastName': { $regex: escaped, $options: 'i' } },
        { 'personalInfo.email': { $regex: escaped, $options: 'i' } }
      ];
    }
    
    const skip = (page - 1) * limit;
    
    const applications = await APAApplication.find(query)
      .select('-personalInfo.ssn') // Exclude SSN from list view
      .sort({ submittedAt: -1 })
      .limit(limit)
      .skip(skip);
    
    const total = await APAApplication.countDocuments(query);
    
    // Get status counts
    const statusCounts = await APAApplication.aggregate([
      { $match: { deletedAt: null } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    sendResponse(res, 200, {
      applications,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit
      },
      statusCounts: statusCounts.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {})
    });
    
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/admin/apa-applications/:id
// @desc    Get single APA application with full details
// @access  Admin only
router.get('/apa-applications/:id([a-fA-F0-9]{24})', async (req, res) => {
  try {
    const application = await APAApplication.findById(req.params.id);
    
    if (!application) {
      return errorResponse(res, new Error('Application not found'), 404);
    }

    // Build full document URL if signed document exists
    const appData = application.toObject();
    if (appData.docusign?.documentUrl) {
      const baseUrl = process.env.API_URL || `${req.protocol}://${req.get('host')}`;
      appData.docusign.documentUrl = `${baseUrl}${appData.docusign.documentUrl}`;
    }
    
    sendResponse(res, 200, { application: appData });
    
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/admin/apa-applications/:id/versions
// @desc    Version history (current + superseded snapshots) of an application
// @access  Admin only
router.get('/apa-applications/:id([a-fA-F0-9]{24})/versions', async (req, res) => {
  try {
    const application = await APAApplication.findById(req.params.id);
    if (!application) {
      return errorResponse(res, new Error('Application not found'), 404);
    }
    const baseUrl = process.env.API_URL || `${req.protocol}://${req.get('host')}`;
    sendResponse(res, 200, shapeVersionHistory(application, baseUrl));
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   PUT /api/admin/apa-applications/:id/approve
// @desc    Approve APA application
// @access  Admin only
router.put('/apa-applications/:id([a-fA-F0-9]{24})/approve', async (req, res) => {
  try {
    const { adminNotes } = req.body;
    if (adminNotes != null && typeof adminNotes !== 'string') {
      return errorResponse(res, new Error('adminNotes must be a string'), 400);
    }
    
    const application = await APAApplication.findById(req.params.id);
    
    if (!application) {
      return errorResponse(res, new Error('Application not found'), 404);
    }
    
    if (application.status === 'active') {
      return errorResponse(res, new Error('Application is already approved and active'), 400);
    }
    if (application.status === 'pending_resignature') {
      return errorResponse(res, new Error('The agent has not signed the updated application yet'), 400);
    }

    application.status = 'active';
    application.adminNotes = adminNotes || '';
    application.reviewedAt = new Date();
    application.reviewedBy = req.user._id;
    await application.save();

    if (application.userId) {
      Notification.createNotification({
        userId: application.userId,
        type: 'apa_approved',
        title: 'APA Application Approved',
        message: 'Congratulations! Your APA application has been approved and is now active.',
        link: '/profile'
      }, false).catch(() => {});
    }

    // Send approval email to applicant
    const applicantEmail = application.personalInfo?.email;
    const applicantName = application.personalInfo?.legalFirstName || 'Applicant';
    if (applicantEmail) {
      sendNotificationEmail({
        toEmail: applicantEmail,
        title: 'APA Application Approved',
        message: `Congratulations ${applicantName}! Your APA application has been approved and is now active. You can log in to your account to view your status and get started.`,
        link: '/dashboard',
        actionLabel: 'Go to Dashboard'
      }).catch(err => console.error('[APA Approve] Email error:', err.message));
    }
    
    sendResponse(res, 200, {
      success: true,
      message: 'Application approved successfully',
      application
    });
    
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   PUT /api/admin/apa-applications/:id/reject
// @desc    Reject APA application
// @access  Admin only
router.put('/apa-applications/:id([a-fA-F0-9]{24})/reject', async (req, res) => {
  try {
    const { reason, adminNotes } = req.body;
    
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return errorResponse(res, new Error('Rejection reason is required'), 400);
    }
    if (adminNotes != null && typeof adminNotes !== 'string') {
      return errorResponse(res, new Error('adminNotes must be a string'), 400);
    }
    
    const application = await APAApplication.findById(req.params.id);
    
    if (!application) {
      return errorResponse(res, new Error('Application not found'), 404);
    }
    
    if (application.status === 'rejected') {
      return errorResponse(res, new Error('Application is already rejected'), 400);
    }
    
    if (application.status === 'pending_resignature') {
      return errorResponse(res, new Error('The agent is still signing an updated application'), 400);
    }

    application.status = 'rejected';
    application.rejectionReason = reason.trim();
    application.adminNotes = adminNotes || '';
    application.reviewedAt = new Date();
    application.reviewedBy = req.user._id;
    await application.save();

    if (application.userId) {
      Notification.createNotification({
        userId: application.userId,
        type: 'apa_rejected',
        title: 'APA Application Rejected',
        message: `Your APA application was rejected. Reason: ${reason}. You can edit it from your Onboarding page, sign it again and resubmit.`,
        link: '/onboarding'
      }, false).catch(() => {});
    }

    // Send rejection email to applicant
    const rejApplicantEmail = application.personalInfo?.email;
    const rejApplicantName = application.personalInfo?.legalFirstName || 'Applicant';
    if (rejApplicantEmail) {
      sendNotificationEmail({
        toEmail: rejApplicantEmail,
        title: 'APA Application Update',
        message: `Dear ${rejApplicantName}, your APA application was not approved. Reason: ${reason}. Please log in, correct your application from the Onboarding page, sign it again and resubmit it for review.`,
        link: '/onboarding',
        actionLabel: 'Edit Application'
      }).catch(err => console.error('[APA Reject] Email error:', err.message));
    }
    
    sendResponse(res, 200, {
      success: true,
      message: 'Application rejected',
      application
    });
    
  } catch (error) {
    errorResponse(res, error);
  }
});

// ---------------------------------------------------------------------------
// Agent "request to edit" workflow
// ---------------------------------------------------------------------------

const EDIT_REQUEST_STATUSES = ['pending', 'approved', 'denied', 'locked'];

function shapeEditRequest(app) {
  const user = app.userId && typeof app.userId === 'object' ? app.userId : null;
  const p = app.personalInfo || {};
  return {
    applicationId: app._id,
    agent: {
      _id: user?._id || app.userId || null,
      name: user?.name || [p.legalFirstName, p.legalLastName].filter(Boolean).join(' '),
      email: user?.email || p.email
    },
    editRequest: app.editRequest,
    editHistory: (app.editHistory || []).slice(-10).reverse()
  };
}

// @route   GET /api/admin/apa-applications/edit-requests
// @desc    List agents' APA edit requests (default: pending)
// @access  Admin only
router.get('/apa-applications/edit-requests', async (req, res) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : 'pending';
    const filter = { deletedAt: null };
    if (status === 'all') {
      filter['editRequest.status'] = { $in: EDIT_REQUEST_STATUSES };
    } else if (EDIT_REQUEST_STATUSES.includes(status)) {
      filter['editRequest.status'] = status;
    } else {
      return errorResponse(res, new Error('Invalid status filter'), 400);
    }

    const [apps, counts] = await Promise.all([
      APAApplication.find(filter)
        .select('userId personalInfo.legalFirstName personalInfo.legalLastName personalInfo.email editRequest editHistory')
        .populate('userId', 'name email')
        .sort({ 'editRequest.requestedAt': -1 })
        .limit(200),
      APAApplication.aggregate([
        { $match: { deletedAt: null, 'editRequest.status': { $in: EDIT_REQUEST_STATUSES } } },
        { $group: { _id: '$editRequest.status', count: { $sum: 1 } } }
      ])
    ]);

    sendResponse(res, 200, {
      requests: apps.map(shapeEditRequest),
      counts: counts.reduce((acc, c) => { acc[c._id] = c.count; return acc; }, {})
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/admin/apa-applications/by-agent/:userId/edit-request
// @desc    Edit-request state for one agent's application (Onboarding Review page)
// @access  Admin only
router.get('/apa-applications/by-agent/:userId([a-fA-F0-9]{24})/edit-request', async (req, res) => {
  try {
    const app = await APAApplication.findOne({ userId: req.params.userId, deletedAt: null })
      .select('userId personalInfo.legalFirstName personalInfo.legalLastName personalInfo.email editRequest editHistory')
      .populate('userId', 'name email')
      .sort({ createdAt: -1 });
    sendResponse(res, 200, { request: app ? shapeEditRequest(app) : null });
  } catch (error) {
    errorResponse(res, error);
  }
});

async function changeEditAccess(req, res, { allowedFrom, to, notify }) {
  try {
    const adminNote = req.body?.adminNote;
    if (adminNote != null && typeof adminNote !== 'string') {
      return errorResponse(res, new Error('adminNote must be a string'), 400);
    }

    const application = await APAApplication.findById(req.params.id);
    if (!application || application.deletedAt) {
      return errorResponse(res, new Error('Application not found'), 404);
    }

    const current = application.editRequest?.status || 'none';
    if (!allowedFrom.includes(current)) {
      return errorResponse(res, new Error(`Cannot change edit access from "${current}"`), 400);
    }

    application.editRequest.status = to;
    application.editRequest.reviewedAt = new Date();
    application.editRequest.reviewedBy = req.user._id;
    application.editRequest.adminNote = (adminNote || '').trim().slice(0, 1000);
    await application.save();

    const agentId = application.userId || application.user;
    if (agentId) {
      const note = application.editRequest.adminNote;
      Notification.createNotification({
        userId: agentId,
        type: notify.type,
        title: notify.title,
        message: notify.message(note),
        data: { applicationId: String(application._id), status: to },
        link: '/onboarding'
      }, true).catch(() => {});
    }

    sendResponse(res, 200, { success: true, message: notify.done, editRequest: application.editRequest });
  } catch (error) {
    errorResponse(res, error);
  }
}

// @route   PUT /api/admin/apa-applications/:id/edit-request/approve
// @desc    Unlock the application for the agent. Stays open until re-locked.
router.put('/apa-applications/:id([a-fA-F0-9]{24})/edit-request/approve', (req, res) =>
  changeEditAccess(req, res, {
    allowedFrom: ['none', 'pending', 'denied', 'locked'],
    to: 'approved',
    notify: {
      type: 'apa_edit_approved',
      title: 'APA Edit Request Approved',
      message: (note) => `You can now edit your APA application from your Onboarding page. Editing locks again once you save.${note ? ` Note from admin: ${note}` : ''}`,
      done: 'Edit access granted'
    }
  })
);

// @route   PUT /api/admin/apa-applications/:id/edit-request/deny
router.put('/apa-applications/:id([a-fA-F0-9]{24})/edit-request/deny', (req, res) =>
  changeEditAccess(req, res, {
    allowedFrom: ['pending'],
    to: 'denied',
    notify: {
      type: 'apa_edit_denied',
      title: 'APA Edit Request Denied',
      message: (note) => `Your request to edit your APA application was not approved.${note ? ` Reason: ${note}` : ''}`,
      done: 'Edit request denied'
    }
  })
);

// @route   PUT /api/admin/apa-applications/:id/edit-request/lock
// @desc    Close editing again after the agent has finished their corrections
router.put('/apa-applications/:id([a-fA-F0-9]{24})/edit-request/lock', (req, res) =>
  changeEditAccess(req, res, {
    allowedFrom: ['approved'],
    to: 'locked',
    notify: {
      type: 'apa_edit_locked',
      title: 'APA Application Locked',
      message: () => 'Editing on your APA application has been closed. Request edit access again if you need more changes.',
      done: 'Application locked'
    }
  })
);

// @route   PUT /api/admin/apa-applications/:id/notes
// @desc    Update admin notes on application
// @access  Admin only
router.put('/apa-applications/:id([a-fA-F0-9]{24})/notes', async (req, res) => {
  try {
    const { adminNotes } = req.body;
    
    const application = await APAApplication.findById(req.params.id);
    
    if (!application) {
      return errorResponse(res, new Error('Application not found'), 404);
    }
    
    if (typeof adminNotes !== 'string') {
      return errorResponse(res, new Error('adminNotes must be a string'), 400);
    }
    application.adminNotes = adminNotes;
    await application.save();
    
    sendResponse(res, 200, {
      success: true,
      message: 'Notes updated successfully',
      application
    });
    
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/admin/apa-applications/stats/overview
// @desc    Get overview statistics for APA applications
// @access  Admin only
router.get('/apa-applications/stats/overview', async (req, res) => {
  try {
    const total = await APAApplication.countDocuments({ deletedAt: null });
    const pending = await APAApplication.countDocuments({ deletedAt: null, status: 'pending_signature' });
    const pendingPayment = await APAApplication.countDocuments({ deletedAt: null, status: 'pending_payment' });
    const active = await APAApplication.countDocuments({ deletedAt: null, status: 'active' });
    const rejected = await APAApplication.countDocuments({ deletedAt: null, status: 'rejected' });
    
    // Applications by month
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentApplications = await APAApplication.countDocuments({
      deletedAt: null,
      submittedAt: { $gte: thirtyDaysAgo }
    });
    
    sendResponse(res, 200, {
      stats: {
        total,
        pending,
        pendingPayment,
        active,
        rejected,
        recentApplications
      }
    });
    
  } catch (error) {
    errorResponse(res, error);
  }
});

// ---------------------------------------------------------------------------
// @route   POST /api/admin/apa-applications/backfill-onboarding-docs
// @desc    For every completed APA that has a signed PDF but no OnboardingDocument,
//          create the missing record so agents see the link in /onboarding-hub.
//          Safe to run multiple times (uses upsert).
// @access  Admin only
// ---------------------------------------------------------------------------
router.post('/apa-applications/backfill-onboarding-docs', async (req, res) => {
  try {
    const apaDocType = await OnboardingDocType.findOne({ name: 'APA Agreement', isActive: true });
    if (!apaDocType) {
      return res.status(404).json({ message: 'OnboardingDocType "APA Agreement" not found. Run seedOnboardingDocTypes.js first.' });
    }

    // Find all completed applications that have a linked user account.
    // APAApplication stores the user in EITHER userId or user (both set on payment).
    const signedApps = await APAApplication.find({
      'docusign.status': 'completed',
      $or: [
        { userId: { $exists: true, $ne: null } },
        { user: { $exists: true, $ne: null } }
      ]
    });

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];

    for (const app of signedApps) {
      const agentUserId = app.userId || app.user;
      if (!agentUserId) { skipped++; continue; }

      const docRelPath = app.docusign?.documentUrl
        ? app.docusign.documentUrl.replace(/^\//, '')
        : null;

      try {
        const existing = await OnboardingDocument.findOne({
          agent: agentUserId,
          docType: apaDocType._id,
          deletedAt: null
        });

        // If an admin has attached a genuinely different external link (e.g.
        // a Google Drive link), leave it alone. But if externalLink was
        // previously auto-set to point at this SAME internal /uploads path
        // (a bug fixed here — it used to bypass authentication entirely),
        // treat it as unset so this record gets repaired below.
        const externalLinkIsOwnUploadPath = existing?.externalLink && docRelPath
          && existing.externalLink.endsWith(`/${docRelPath}`);
        if (existing?.externalLink && !externalLinkIsOwnUploadPath) { skipped++; continue; }

        await OnboardingDocument.findOneAndUpdate(
          { agent: agentUserId, docType: apaDocType._id },
          {
            $set: {
              agent: agentUserId,
              docType: apaDocType._id,
              filePath: docRelPath,
              // Do NOT set externalLink — this file lives in our own
              // protected /uploads storage (authenticated via filePath + the
              // onboarding-hub download route), not a genuine external
              // resource. See comment above for why this field is cleared.
              externalLink: null,
              originalFileName: `APA_Agreement_${app.personalInfo?.legalFirstName || ''}_${app.personalInfo?.legalLastName || ''}.pdf`.replace(/\s+/g, '_'),
              uploadedBy: agentUserId,
              uploadedAt: app.docusign?.signedDate || app.updatedAt || new Date(),
              deletedAt: null
            }
          },
          { upsert: true, new: true }
        );

        existing ? updated++ : created++;
      } catch (err) {
        errors.push({ appId: app._id, agentUserId, error: err.message });
      }
    }

    res.json({
      message: 'Backfill complete',
      total: signedApps.length,
      created,
      updated,
      skipped,
      errors
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// ---------------------------------------------------------------------------
// APA Auto-Approval Setting
// ---------------------------------------------------------------------------

// @route   GET /api/admin/apa-applications/settings/auto-approve
// @desc    Get current auto-approve setting
// @access  Admin only
router.get('/apa-applications/settings/auto-approve', async (req, res) => {
  try {
    const config = await SystemConfig.findOne({ key: 'apa_auto_approve' }).lean();
    sendResponse(res, 200, {
      autoApprove: config ? config.value === 'true' : false,
      description: 'When enabled, APA applications are automatically approved after payment is completed, skipping manual admin review.'
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   PUT /api/admin/apa-applications/settings/auto-approve
// @desc    Toggle auto-approve setting
// @access  Admin only
router.put('/apa-applications/settings/auto-approve', async (req, res) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return errorResponse(res, new Error('"enabled" must be a boolean'), 400);
    }

    await SystemConfig.findOneAndUpdate(
      { key: 'apa_auto_approve' },
      {
        $set: {
          key: 'apa_auto_approve',
          value: String(enabled),
          category: 'application',
          description: 'Auto-approve APA applications after payment completion',
          isEditable: true,
          updatedBy: req.user._id
        }
      },
      { upsert: true, new: true }
    );

    sendResponse(res, 200, {
      success: true,
      autoApprove: enabled,
      message: enabled
        ? 'Auto-approve enabled. New applications will be approved automatically after payment.'
        : 'Auto-approve disabled. Applications require manual admin approval.'
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// ============================================================
// APA Agreement Template Management
// ============================================================

// @route   GET /api/admin/apa-applications/settings/template
// @desc    Get current APA template info
// @access  Admin only
router.get('/apa-applications/settings/template', async (req, res) => {
  try {
    const templateId = await getActiveTemplateId();
    const isCustom = !!(await SystemConfig.findOne({ key: 'zoho_sign_template_id' }).lean());

    let templateInfo = null;
    try {
      templateInfo = await getTemplateInfo(templateId);
    } catch (e) {
      // Zoho Sign may be unavailable — still return config
      console.error('Failed to fetch Zoho Sign template info:', e.message);
    }

    const uploadHistory = await SystemConfig.findOne({ key: 'apa_template_history' }).lean();

    sendResponse(res, 200, {
      templateId,
      isCustom,
      envTemplateId: process.env.ZOHO_SIGN_TEMPLATE_ID,
      templateInfo,
      uploadHistory: uploadHistory ? JSON.parse(uploadHistory.value || '[]') : []
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/admin/apa-applications/settings/template/upload
// @desc    Upload new APA agreement PDF — replaces document in current template
// @access  Admin only
router.post('/apa-applications/settings/template/upload', templateUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return sendResponse(res, 400, { message: 'No PDF file provided.' });
    }

    const mode = req.body.mode || 'replace'; // 'replace' or 'new'
    let result;

    if (mode === 'new') {
      // Create a brand new Zoho Sign template with NO fields positioned yet —
      // an admin must open it in Zoho's embedded template editor and place
      // the ~70 fields (see backend/utils/zohosign.js TEXT_FIELD_NAMES /
      // CHECKBOX_FIELD_NAMES for the exact names to use) before it can be
      // used to send real applications.
      result = await createTemplateFromPDF(req.file.buffer, req.file.originalname);

      // Store new template ID in SystemConfig
      await SystemConfig.findOneAndUpdate(
        { key: 'zoho_sign_template_id' },
        {
          $set: {
            key: 'zoho_sign_template_id',
            value: result.templateId,
            category: 'zoho_sign',
            description: 'Active Zoho Sign template ID for APA agreement',
            isEditable: true,
            updatedBy: req.user._id
          }
        },
        { upsert: true, new: true }
      );
    } else {
      // Replace the document while preserving field placements — see the
      // detailed comment on updateTemplateDocument() in zohosign.js for how
      // this is composed from Zoho's API (there is no native "replace PDF"
      // endpoint). Also updates SystemConfig's active template ID itself.
      result = await updateTemplateDocument(req.file.buffer, req.file.originalname);
    }

    // Save upload history
    const historyConfig = await SystemConfig.findOne({ key: 'apa_template_history' }).lean();
    const history = historyConfig ? JSON.parse(historyConfig.value || '[]') : [];
    history.unshift({
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mode,
      templateId: result.templateId,
      uploadedBy: req.user.name,
      uploadedAt: new Date().toISOString()
    });
    // Keep last 20 entries
    if (history.length > 20) history.length = 20;

    await SystemConfig.findOneAndUpdate(
      { key: 'apa_template_history' },
      {
        $set: {
          key: 'apa_template_history',
          value: JSON.stringify(history),
          category: 'zoho_sign',
          description: 'APA template upload history',
          isEditable: false,
          updatedBy: req.user._id
        }
      },
      { upsert: true }
    );

    sendResponse(res, 200, {
      success: true,
      message: mode === 'new'
        ? `New APA template created (ID: ${result.templateId}) — open it in Zoho's template editor to place fields before using it.`
        : `APA template document replaced successfully${result.skippedFields?.length ? `, but ${result.skippedFields.length} field(s) were on pages that no longer exist and were dropped: ${result.skippedFields.join(', ')}` : ''}`,
      result,
      mode
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   PUT /api/admin/apa-applications/settings/template/revert
// @desc    Revert to the default (.env) template ID
// @access  Admin only
router.put('/apa-applications/settings/template/revert', async (req, res) => {
  try {
    await SystemConfig.deleteOne({ key: 'zoho_sign_template_id' });

    sendResponse(res, 200, {
      success: true,
      templateId: process.env.ZOHO_SIGN_TEMPLATE_ID,
      message: 'Reverted to default APA template from environment configuration.'
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

module.exports = router;
