const express = require('express');
const router = express.Router();
const multer = require('multer');
const APAApplication = require('../models/APAApplication');
const Notification = require('../models/Notification');
const OnboardingDocument = require('../models/OnboardingDocument');
const OnboardingDocType = require('../models/OnboardingDocType');
const User = require('../models/User');
const SystemConfig = require('../models/SystemConfig');
const { protect, authorize } = require('../middleware/auth.middleware');
const { sendResponse, errorResponse } = require('../utils/helpers');
const { sendNotificationEmail } = require('../utils/neuzmail');
const {
  getActiveTemplateId,
  updateTemplateDocument,
  createTemplateFromPDF,
  getTemplateInfo
} = require('../utils/docusign');

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
    const { status, search, page = 1, limit = 20 } = req.query;
    
    const query = {};
    
    // Filter by status
    if (status && status !== 'all') {
      query.status = status;
    }
    
    // Search by name or email
    if (search) {
      query.$or = [
        { 'personalInfo.legalFirstName': { $regex: search, $options: 'i' } },
        { 'personalInfo.legalLastName': { $regex: search, $options: 'i' } },
        { 'personalInfo.email': { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (page - 1) * limit;
    
    const applications = await APAApplication.find(query)
      .select('-personalInfo.ssn') // Exclude SSN from list view
      .sort({ submittedAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);
    
    const total = await APAApplication.countDocuments(query);
    
    // Get status counts
    const statusCounts = await APAApplication.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    sendResponse(res, 200, {
      applications,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
        limit: parseInt(limit)
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

// @route   PUT /api/admin/apa-applications/:id/approve
// @desc    Approve APA application
// @access  Admin only
router.put('/apa-applications/:id([a-fA-F0-9]{24})/approve', async (req, res) => {
  try {
    const { adminNotes } = req.body;
    
    const application = await APAApplication.findById(req.params.id);
    
    if (!application) {
      return errorResponse(res, new Error('Application not found'), 404);
    }
    
    if (application.status === 'active') {
      return errorResponse(res, new Error('Application is already approved and active'), 400);
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
    
    if (!reason) {
      return errorResponse(res, new Error('Rejection reason is required'), 400);
    }
    
    const application = await APAApplication.findById(req.params.id);
    
    if (!application) {
      return errorResponse(res, new Error('Application not found'), 404);
    }
    
    application.status = 'rejected';
    application.rejectionReason = reason;
    application.adminNotes = adminNotes || '';
    application.reviewedAt = new Date();
    application.reviewedBy = req.user._id;
    await application.save();

    if (application.userId) {
      Notification.createNotification({
        userId: application.userId,
        type: 'apa_rejected',
        title: 'APA Application Rejected',
        message: `Your APA application was rejected. Reason: ${reason}`,
        link: '/profile'
      }, false).catch(() => {});
    }

    // Send rejection email to applicant
    const rejApplicantEmail = application.personalInfo?.email;
    const rejApplicantName = application.personalInfo?.legalFirstName || 'Applicant';
    if (rejApplicantEmail) {
      sendNotificationEmail({
        toEmail: rejApplicantEmail,
        title: 'APA Application Update',
        message: `Dear ${rejApplicantName}, your APA application was not approved. Reason: ${reason}. If you have questions or would like to re-apply, please contact our support team.`,
        link: '/profile',
        actionLabel: 'View Profile'
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
    const total = await APAApplication.countDocuments();
    const pending = await APAApplication.countDocuments({ status: 'pending_signature' });
    const pendingPayment = await APAApplication.countDocuments({ status: 'pending_payment' });
    const active = await APAApplication.countDocuments({ status: 'active' });
    const rejected = await APAApplication.countDocuments({ status: 'rejected' });
    
    // Applications by month
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentApplications = await APAApplication.countDocuments({
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

    const baseUrl = process.env.API_URL || `${req.protocol}://${req.get('host')}`;
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

        // If record already has an externalLink, leave it alone
        if (existing?.externalLink) { skipped++; continue; }

        await OnboardingDocument.findOneAndUpdate(
          { agent: agentUserId, docType: apaDocType._id },
          {
            $set: {
              agent: agentUserId,
              docType: apaDocType._id,
              filePath: docRelPath,
              externalLink: docRelPath ? `${baseUrl}/${docRelPath}` : null,
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
    const isCustom = !!(await SystemConfig.findOne({ key: 'docusign_template_id' }).lean());

    let templateInfo = null;
    try {
      templateInfo = await getTemplateInfo(templateId);
    } catch (e) {
      // DocuSign may be unavailable — still return config
      console.error('Failed to fetch DocuSign template info:', e.message);
    }

    const uploadHistory = await SystemConfig.findOne({ key: 'apa_template_history' }).lean();

    sendResponse(res, 200, {
      templateId,
      isCustom,
      envTemplateId: process.env.DOCUSIGN_TEMPLATE_ID,
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
      // Create a brand new DocuSign template and set it as active
      result = await createTemplateFromPDF(req.file.buffer, req.file.originalname);

      // Store new template ID in SystemConfig
      await SystemConfig.findOneAndUpdate(
        { key: 'docusign_template_id' },
        {
          $set: {
            key: 'docusign_template_id',
            value: result.templateId,
            category: 'docusign',
            description: 'Active DocuSign template ID for APA agreement',
            isEditable: true,
            updatedBy: req.user._id
          }
        },
        { upsert: true, new: true }
      );
    } else {
      // Replace the document in the existing template
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
          category: 'docusign',
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
        ? `New APA template created and activated (ID: ${result.templateId})`
        : `APA template document replaced successfully`,
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
    await SystemConfig.deleteOne({ key: 'docusign_template_id' });

    sendResponse(res, 200, {
      success: true,
      templateId: process.env.DOCUSIGN_TEMPLATE_ID,
      message: 'Reverted to default APA template from environment configuration.'
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

module.exports = router;
