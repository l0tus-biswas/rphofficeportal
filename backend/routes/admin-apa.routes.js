const express = require('express');
const router = express.Router();
const APAApplication = require('../models/APAApplication');
const Notification = require('../models/Notification');
const OnboardingDocument = require('../models/OnboardingDocument');
const OnboardingDocType = require('../models/OnboardingDocType');
const User = require('../models/User');
const SystemConfig = require('../models/SystemConfig');
const { protect, authorize } = require('../middleware/auth.middleware');
const { sendResponse, errorResponse } = require('../utils/helpers');
const { sendNotificationEmail } = require('../utils/neuzmail');

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

module.exports = router;
