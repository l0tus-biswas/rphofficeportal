const express = require('express');
const path = require('path');
const fs = require('fs');

const router = express.Router();

const Onboarding = require('../models/Onboarding');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth.middleware');
const { onboardingUpload, ONBOARDING_FIELDS } = require('../middleware/onboardingUpload.middleware');
const { sendResponse, errorResponse, paginate } = require('../utils/helpers');
const { ONBOARDING_ROOT } = require('../utils/storage');

const { STEP_STATUSES, OVERALL_STATUSES } = Onboarding;

const STEP_LABELS = {
  stateLicense: 'State License',
  driversLicense: "Driver's License",
  fingerprintBackground: 'Fingerprint Background Check',
  cmsCertificate: 'Medicare (CMS) Certificate',
  directDeposit: 'Direct Deposit Form'
};

router.use(protect);

const removeOldFileIfExists = async (userId, fileName) => {
  if (!fileName) {
    return;
  }

  const filePath = path.join(ONBOARDING_ROOT, userId.toString(), fileName);
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`Failed to remove old onboarding file ${filePath}:`, error.message);
    }
  }
};

const syncUserWithOnboarding = async (userId, onboarding) => {
  const update = {
    onboarding: onboarding._id,
    onboardingStatus: onboarding.status,
    onboardingSubmittedAt: onboarding.submittedAt
  };

  update.onboardingApprovedAt = onboarding.status === 'approved'
    ? (onboarding.reviewedAt || new Date())
    : null;

  await User.findByIdAndUpdate(userId, update, { new: false });
};

const isValidStep = (step) => ONBOARDING_FIELDS.includes(step);

const serveStepFile = async (res, onboarding, userId, stepKey) => {
  const stepData = onboarding?.steps?.[stepKey];
  if (!stepData || !stepData.fileName) {
    return sendResponse(res, 404, {
      message: `${STEP_LABELS[stepKey]} has not been uploaded yet.`
    });
  }

  const filePath = path.join(ONBOARDING_ROOT, userId.toString(), stepData.fileName);
  if (!fs.existsSync(filePath)) {
    return sendResponse(res, 404, {
      message: 'Uploaded file could not be found. Please re-upload.'
    });
  }

  return res.download(filePath, stepData.originalName || stepData.fileName);
};

const handleUploadForUser = async (req, res, targetUserId) => {
  try {
    const files = req.files || {};
    const uploadedFields = Object.keys(files).filter(field => files[field]?.length);

    if (!uploadedFields.length) {
      return sendResponse(res, 400, {
        message: 'Please include at least one PDF document.'
      });
    }

    let onboarding = await Onboarding.findOne({ user: targetUserId });
    if (!onboarding) {
      onboarding = await Onboarding.create({ user: targetUserId });
    }

    const updatedSteps = [];
    for (const field of uploadedFields) {
      if (!isValidStep(field)) {
        continue;
      }

      const file = files[field][0];
      const stepDoc = onboarding.steps[field] || (onboarding.steps[field] = {});
      await removeOldFileIfExists(targetUserId, stepDoc.fileName);

      stepDoc.fileName = file.filename;
      stepDoc.originalName = file.originalname;
      stepDoc.mimeType = file.mimetype;
      stepDoc.size = file.size;
      stepDoc.uploadedAt = new Date();
      stepDoc.status = 'pending';
      stepDoc.adminComment = '';
      stepDoc.history = Array.isArray(stepDoc.history) ? stepDoc.history : [];
      stepDoc.history.push({
        status: 'pending',
        comment: 'Document uploaded',
        updatedBy: req.user._id,
        updatedAt: new Date()
      });

      updatedSteps.push(field);
    }

    if (!updatedSteps.length) {
      return sendResponse(res, 400, {
        message: 'No valid onboarding documents were provided.'
      });
    }

    onboarding.submittedAt = new Date();
    onboarding.reviewedAt = null;
    onboarding.reviewedBy = null;
    onboarding.lastUpdatedBy = req.user._id;
    onboarding.lastUpdatedAt = new Date();
    onboarding.updateOverallStatus();

    await onboarding.save();
    await syncUserWithOnboarding(targetUserId, onboarding);

    // Notify the user whose onboarding documents were uploaded
    Notification.createNotification({
      userId: targetUserId,
      type: 'onboarding_submitted',
      title: 'Onboarding Documents Uploaded',
      message: `${updatedSteps.length} onboarding document(s) uploaded and are now pending review.`,
      link: '/onboarding'
    }, false).catch(() => {});

    return sendResponse(res, 200, {
      message: 'Documents uploaded successfully.',
      updatedSteps,
      onboarding
    });
  } catch (error) {
    return errorResponse(res, error);
  }
};

// Agent/Admin: get their onboarding snapshot
router.get('/me', authorize('agent', 'admin'), async (req, res) => {
  try {
    const onboarding = await Onboarding.findOne({ user: req.user._id })
      .populate('notes.createdBy', 'name role')
      .lean();

    sendResponse(res, 200, {
      onboarding,
      stepsMeta: STEP_LABELS
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// Agent/Admin: download one of their own documents
router.get('/me/files/:step', authorize('agent', 'admin'), async (req, res) => {
  try {
    const stepKey = req.params.step;
    if (!isValidStep(stepKey)) {
      return sendResponse(res, 400, { message: 'Invalid onboarding step requested.' });
    }

    const onboarding = await Onboarding.findOne({ user: req.user._id });
    if (!onboarding) {
      return sendResponse(res, 404, { message: 'Onboarding record not found.' });
    }

    return serveStepFile(res, onboarding, req.user._id, stepKey);
  } catch (error) {
    errorResponse(res, error);
  }
});

// Agent/Admin: upload or replace their documents
router.post('/me/upload', authorize('agent', 'admin'), onboardingUpload, (req, res) => {
  return handleUploadForUser(req, res, req.user._id);
});

// Admin: list onboarding records with filters
router.get('/', authorize('admin'), async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const { status, search, userId } = req.query;

    const filter = {};
    if (status && OVERALL_STATUSES.includes(status)) {
      filter.status = status;
    }
    if (userId) {
      filter.user = userId;
    }

    if (search) {
      const regex = new RegExp(search, 'i');
      const userMatches = await User.find({
        $or: [{ name: regex }, { email: regex }]
      }).select('_id');

      if (!userMatches.length) {
        return sendResponse(res, 200, {
          onboardings: [],
          pagination: {
            page,
            limit,
            total: 0,
            pages: 0
          }
        });
      }

      filter.user = { $in: userMatches.map(doc => doc._id) };
    }

    const query = Onboarding.find(filter)
      .populate('user', 'name email role onboardingStatus')
      .sort('-updatedAt');

    const onboardings = await paginate(query, page, limit);
    const total = await Onboarding.countDocuments(filter);

    sendResponse(res, 200, {
      onboardings,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// Admin: get onboarding record for a specific user
router.get('/users/:userId', authorize('admin'), async (req, res) => {
  try {
    const onboarding = await Onboarding.findOne({ user: req.params.userId })
      .populate('user', 'name email role')
      .populate('notes.createdBy', 'name role');

    if (!onboarding) {
      return sendResponse(res, 404, { message: 'Onboarding record not found.' });
    }

    sendResponse(res, 200, { onboarding });
  } catch (error) {
    errorResponse(res, error);
  }
});

// Admin: download a specific document for any user
router.get('/users/:userId/files/:step', authorize('admin'), async (req, res) => {
  try {
    const { userId, step } = req.params;
    if (!isValidStep(step)) {
      return sendResponse(res, 400, { message: 'Invalid onboarding step requested.' });
    }

    const onboarding = await Onboarding.findOne({ user: userId });
    if (!onboarding) {
      return sendResponse(res, 404, { message: 'Onboarding record not found.' });
    }

    return serveStepFile(res, onboarding, userId, step);
  } catch (error) {
    errorResponse(res, error);
  }
});

// Admin: upload on behalf of a user
router.post(
  '/users/:userId/upload',
  authorize('admin'),
  (req, res, next) => {
    req.body.userId = req.params.userId;
    next();
  },
  onboardingUpload,
  (req, res) => {
    return handleUploadForUser(req, res, req.params.userId);
  }
);

// Admin: update status for a single step
router.patch('/users/:userId/steps/:step/status', authorize('admin'), async (req, res) => {
  try {
    const { userId, step } = req.params;
    const { status, comment } = req.body;

    if (!isValidStep(step)) {
      return sendResponse(res, 400, { message: 'Invalid onboarding step.' });
    }
    if (!status || !STEP_STATUSES.includes(status)) {
      return sendResponse(res, 400, { message: 'Provide a valid step status.' });
    }

    const onboarding = await Onboarding.findOne({ user: userId });
    if (!onboarding) {
      return sendResponse(res, 404, { message: 'Onboarding record not found.' });
    }

    const stepDoc = onboarding.steps[step];
    stepDoc.status = status;
    if (typeof comment === 'string') {
      stepDoc.adminComment = comment.trim();
    }
    stepDoc.history = Array.isArray(stepDoc.history) ? stepDoc.history : [];
    stepDoc.history.push({
      status,
      comment,
      updatedBy: req.user._id,
      updatedAt: new Date()
    });

    onboarding.reviewedAt = new Date();
    onboarding.reviewedBy = req.user._id;
    onboarding.lastUpdatedAt = new Date();
    onboarding.lastUpdatedBy = req.user._id;
    onboarding.updateOverallStatus();

    await onboarding.save();
    await syncUserWithOnboarding(userId, onboarding);

    // Notify the agent about their step status change
    const stepLabel = STEP_LABELS[step] || step;
    const statusMessages = {
      approved: `Your ${stepLabel} document has been approved.`,
      rejected: `Your ${stepLabel} document was rejected. ${comment ? 'Note: ' + comment : 'Please re-upload.'}`,
      pending: `Your ${stepLabel} document is under review.`
    };
    Notification.createNotification({
      userId: onboarding.user,
      type: 'onboarding_step_updated',
      title: `Onboarding: ${stepLabel} ${status.charAt(0).toUpperCase() + status.slice(1)}`,
      message: statusMessages[status] || `Your ${stepLabel} status was updated to: ${status}`,
      link: '/onboarding'
    }, false).catch(() => {});

    sendResponse(res, 200, {
      message: `${STEP_LABELS[step]} updated successfully.`,
      onboarding
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// Admin: append a note to onboarding record
router.post('/users/:userId/notes', authorize('admin'), async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return sendResponse(res, 400, { message: 'Note message is required.' });
    }

    const onboarding = await Onboarding.findOne({ user: req.params.userId });
    if (!onboarding) {
      return sendResponse(res, 404, { message: 'Onboarding record not found.' });
    }

    onboarding.notes.push({
      message: message.trim(),
      createdBy: req.user._id,
      role: req.user.role,
      createdAt: new Date()
    });
    onboarding.lastUpdatedAt = new Date();
    onboarding.lastUpdatedBy = req.user._id;

    await onboarding.save();

    sendResponse(res, 201, {
      message: 'Note added successfully.',
      notes: onboarding.notes
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

module.exports = router;
