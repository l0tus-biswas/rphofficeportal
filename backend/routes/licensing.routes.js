const express = require('express');
const router = express.Router();
const LicensingProgress = require('../models/LicensingProgress');
const User = require('../models/User');
const Notification = require('../models/Notification');
const APAApplication = require('../models/APAApplication');
const { protect: authenticate, authorize } = require('../middleware/auth.middleware');
const { isAgentLicensed } = require('../utils/licensing');
const { isUplineOf, getDownlineIds } = require('../utils/hierarchy');
const { syncAgentToQBO } = require('../utils/quickbooksSync');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/licensing');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `licensing-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|jpg|jpeg|png|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only PDF, JPG, PNG, DOC, and DOCX files are allowed'));
  }
});

// isAgentLicensed is the single source of truth for licensed status — imported
// from utils/licensing so the admin list, agent profile, dashboard, and the
// QuickBooks sync gate never disagree.

// Allows an admin OR anyone in the target agent's upline chain (their direct
// recruiter, that recruiter's recruiter, etc., at any depth) to manage a
// checklist — not just the agent's own admin. Uplines help their downline get
// licensed, so they need write access to that agent's checklist without
// needing full admin rights over the rest of the app.
async function requireAdminOrUpline(req, res, next) {
  try {
    if (req.user.role === 'admin') return next();
    const allowed = await isUplineOf(req.user._id, req.params.agentId);
    if (!allowed) {
      return res.status(403).json({ message: "Not authorized to manage this agent's licensing" });
    }
    next();
  } catch (error) {
    console.error('Error checking upline authorization:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
}

// Builds the same "agent + progress (real or default)" shape used by the
// admin list, restricted to a specific set of agent ids when provided (used
// for an upline's self+downline list) or unrestricted (the admin view of
// every agent). Kept as one function so the two callers can never drift out
// of sync on how a missing LicensingProgress record gets defaulted.
async function buildLicensingList(restrictToIds = null) {
  const userFilter = { role: 'agent', isActive: true };
  if (restrictToIds) userFilter._id = { $in: restrictToIds };

  const agents = await User.find(userFilter)
    .select('name email phone metadata createdAt')
    .sort({ name: 1 });
  const agentIds = agents.map(a => a._id);

  const progressRecords = await LicensingProgress.find({ agent: { $in: agentIds } })
    .populate('lastUpdatedBy', 'name');
  const progressMap = {};
  progressRecords.forEach(record => {
    progressMap[record.agent.toString()] = record;
  });

  // APA links to the user via either `user` or `userId` depending on vintage,
  // so match and index on both to avoid missing records.
  const apaRecords = await APAApplication.find({
    $or: [{ user: { $in: agentIds } }, { userId: { $in: agentIds } }]
  }).select('user userId licensingStatus.currentlyLicensed licensingStatus.licenseTypes').lean();
  const apaMap = {};
  apaRecords.forEach(rec => {
    const key = (rec.user || rec.userId);
    if (key) apaMap[key.toString()] = rec;
  });

  return agents.map(agent => {
    const progress = progressMap[agent._id.toString()];
    const apa = apaMap[agent._id.toString()];
    const licensed = isAgentLicensed(progress, apa, agent.metadata);

    if (progress) {
      const obj = progress.toObject();
      obj.isLicensed = licensed;
      if (licensed) obj.completionPercentage = 100;
      if (!progress.checklist?.stateAppointment?.approved) {
        obj.licenseObtainedDate = null;
      }
      obj.agent = {
        _id: agent._id,
        name: agent.name,
        email: agent.email,
        phone: agent.phone
      };
      return obj;
    }

    const enrollmentDate = agent.createdAt || new Date();
    const licensingDeadline = new Date(enrollmentDate);
    licensingDeadline.setDate(licensingDeadline.getDate() + 30);

    const now = new Date();
    const diffTime = licensingDeadline - now;
    const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return {
      agent: {
        _id: agent._id,
        name: agent.name,
        email: agent.email,
        phone: agent.phone
      },
      enrollmentDate: enrollmentDate,
      licensingDeadline: licensingDeadline,
      daysRemaining: licensed ? 0 : (daysRemaining > 0 ? daysRemaining : 0),
      isLicensed: licensed,
      completionPercentage: licensed ? 100 : 0,
      checklist: {
        preLicenseCourse: { completed: false },
        stateExam: { scheduled: false, attempts: 0, scheduleHistory: [] },
        fingerprinting: { scheduled: false, attempts: 0, scheduleHistory: [] },
        diceApplication: { submitted: false },
        stateAppointment: { approved: false }
      },
      documents: [],
      adminNotes: ''
    };
  });
}

// @route   GET /api/licensing
// @desc    Get all licensing progress (admin) or own progress (agent) --
//          unchanged from before the upline feature; see GET /downline
//          below for a non-admin's downline list.
// @access  Private
router.get('/', authenticate, async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      const result = await buildLicensingList();
      const filteredResult = req.query.isLicensed !== undefined
        ? result.filter(r => r.isLicensed === (req.query.isLicensed === 'true'))
        : result;
      return res.json(filteredResult);
    }

    // For agents, only show own licensing progress
    const licensingProgress = await LicensingProgress.find({ agent: req.user._id })
      .populate('agent', 'name email phone')
      .populate('lastUpdatedBy', 'name')
      .sort({ enrollmentDate: -1 });

    res.json(licensingProgress);
  } catch (error) {
    console.error('Error fetching licensing progress:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/licensing/downline
// @desc    List of this agent's downline (recruits, their recruits, etc.,
//          any depth) with their licensing progress -- never includes the
//          requester themselves. Empty array if they have no downline.
//          A separate endpoint (rather than folding into GET / above) so
//          the frontend never has to guess, from array contents alone,
//          whether it got "my own record" or "a list to manage".
// @access  Private (any authenticated agent)
router.get('/downline', authenticate, async (req, res) => {
  try {
    const downlineIds = await getDownlineIds(req.user._id);
    if (downlineIds.length === 0) return res.json([]);

    const result = await buildLicensingList(downlineIds);
    const filteredResult = req.query.isLicensed !== undefined
      ? result.filter(r => r.isLicensed === (req.query.isLicensed === 'true'))
      : result;

    res.json(filteredResult);
  } catch (error) {
    console.error('Error fetching downline licensing progress:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/licensing/countdown/all
// @desc    Get countdown status for all unlicensed agents
// @access  Admin only
router.get('/countdown/all', authenticate, authorize('admin'), async (req, res) => {
  try {
    const unlicensedAgents = await LicensingProgress.find({ isLicensed: false })
      .populate('agent', 'name email')
      .select('agent enrollmentDate licensingDeadline daysRemaining')
      .sort({ licensingDeadline: 1 });

    res.json(unlicensedAgents);
  } catch (error) {
    console.error('Error fetching countdown data:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/licensing/:agentId
// @desc    Get specific agent's licensing progress
// @access  Private
router.get('/:agentId', authenticate, async (req, res) => {
  try {
    // Agents can view their own; admins and this agent's uplines (their
    // recruiter, that recruiter's recruiter, etc., any depth) can view anyone's.
    const isSelf = req.user._id.toString() === req.params.agentId;
    if (req.user.role !== 'admin' && !isSelf && !(await isUplineOf(req.user._id, req.params.agentId))) {
      return res.status(403).json({ message: 'Access denied' });
    }

    let licensingProgress = await LicensingProgress.findOne({ agent: req.params.agentId })
      .populate('agent', 'name email phone')
      .populate('lastUpdatedBy', 'name')
      .populate('checklist.preLicenseCourse.documents.uploadedBy', 'name')
      .populate('checklist.stateExam.documents.uploadedBy', 'name')
      .populate('checklist.fingerprinting.documents.uploadedBy', 'name')
      .populate('checklist.diceApplication.documents.uploadedBy', 'name')
      .populate('checklist.stateAppointment.documents.uploadedBy', 'name');
    
    if (!licensingProgress) {
      // Auto-create licensing progress if user exists
      const agent = await User.findById(req.params.agentId);
      if (!agent) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      // Create with default 30-day deadline (matches every other auto-create path)
      const enrollmentDate = agent.createdAt || new Date();
      const licensingDeadline = new Date(enrollmentDate);
      licensingDeadline.setDate(licensingDeadline.getDate() + 30);
      
      licensingProgress = new LicensingProgress({
        agent: req.params.agentId,
        enrollmentDate,
        licensingDeadline,
        lastUpdatedBy: req.user._id
      });
      
      await licensingProgress.save();
      
      // Populate after save
      licensingProgress = await LicensingProgress.findById(licensingProgress._id)
        .populate('agent', 'name email phone')
        .populate('lastUpdatedBy', 'name');
    }
    
    // Get license types from APAApplication if it exists. APA links to the user
    // through either `user` or `userId` depending on when it was created, so
    // match on both to avoid missing the record.
    const apaApplication = await APAApplication.findOne({
      $or: [{ user: req.params.agentId }, { userId: req.params.agentId }]
    });
    let licenseTypes = apaApplication?.licensingStatus?.licenseTypes || [];
    let isCurrentlyLicensed = apaApplication?.licensingStatus?.currentlyLicensed || false;

    // Also check the agent's metadata for license information
    const agent = await User.findById(req.params.agentId);
    if (licenseTypes.length === 0 && agent?.metadata) {
      // Check if license info is stored in metadata
      const metadataLicenseTypes = agent.metadata.get('licenseTypes');
      if (metadataLicenseTypes) {
        try {
          licenseTypes = JSON.parse(metadataLicenseTypes);
        } catch (e) {
          // If it's already an array or string, use it directly
          licenseTypes = Array.isArray(metadataLicenseTypes) ? metadataLicenseTypes : [metadataLicenseTypes];
        }
      }
      
      const metadataCurrentlyLicensed = agent.metadata.get('currentlyLicensed');
      if (metadataCurrentlyLicensed) {
        isCurrentlyLicensed = metadataCurrentlyLicensed === 'true' || metadataCurrentlyLicensed === true;
      }
    }
    
    console.log(`License info for user ${req.params.agentId}:`);
    console.log('- Currently Licensed:', isCurrentlyLicensed);
    console.log('- License Types:', licenseTypes);
    
    // Add license types to the response
    const responseData = licensingProgress.toObject();
    // Only include license types if user said they're currently licensed
    responseData.licenseTypes = isCurrentlyLicensed ? licenseTypes : [];

    // Reconcile licensed status against the single source of truth so this
    // detail view never disagrees with the dashboard / admin list. When an
    // agent counts as licensed, surface 100% completion even if individual
    // checklist boxes were never recorded — otherwise the page shows
    // "Licensed!" alongside a contradictory "X pending" / sub-100% bar.
    const licensed = isAgentLicensed(licensingProgress, apaApplication, agent?.metadata);
    responseData.isLicensed = licensed;
    if (licensed) responseData.completionPercentage = 100;

    // licenseObtainedDate means "completed RHP's internal pipeline". Don't
    // surface a stale value when the final step isn't approved — a null date is
    // how the UI distinguishes a self-reported/existing license from one earned
    // through the checklist.
    if (!licensingProgress.checklist?.stateAppointment?.approved) {
      responseData.licenseObtainedDate = null;
    }

    res.json(responseData);
  } catch (error) {
    console.error('Error fetching licensing progress:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/licensing/:agentId
// @desc    Create licensing progress for an agent
// @access  Admin only
router.post('/:agentId', authenticate, authorize('admin'), async (req, res) => {
  try {
    // Check if agent exists
    const agent = await User.findById(req.params.agentId);
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }
    
    // Check if licensing progress already exists
    const existing = await LicensingProgress.findOne({ agent: req.params.agentId });
    if (existing) {
      return res.status(400).json({ message: 'Licensing progress already exists for this agent' });
    }
    
    const enrollmentDate = req.body.enrollmentDate || Date.now();
    const licensingDeadline = new Date(enrollmentDate);
    licensingDeadline.setDate(licensingDeadline.getDate() + 30);
    
    const licensingProgress = new LicensingProgress({
      agent: req.params.agentId,
      enrollmentDate: enrollmentDate,
      licensingDeadline: licensingDeadline,
      lastUpdatedBy: req.user._id
    });
    
    await licensingProgress.save();
    await licensingProgress.populate('agent', 'name email phone');
    
    res.status(201).json(licensingProgress);
  } catch (error) {
    console.error('Error creating licensing progress:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/licensing/:agentId/checklist
// @desc    Update checklist items
// @access  Admin, or any upline of this agent
router.put('/:agentId/checklist', authenticate, requireAdminOrUpline, async (req, res) => {
  try {
    // Check if agent exists
    const agent = await User.findById(req.params.agentId);
    if (!agent || agent.role !== 'agent') {
      return res.status(404).json({ message: 'Agent not found' });
    }
    
    // Find or create licensing progress
    let licensingProgress = await LicensingProgress.findOne({ agent: req.params.agentId });
    
    if (!licensingProgress) {
      // Auto-create if doesn't exist
      const enrollmentDate = agent.createdAt || Date.now();
      const licensingDeadline = new Date(enrollmentDate);
      licensingDeadline.setDate(licensingDeadline.getDate() + 30);
      
      licensingProgress = new LicensingProgress({
        agent: req.params.agentId,
        enrollmentDate: enrollmentDate,
        licensingDeadline: licensingDeadline,
        lastUpdatedBy: req.user._id
      });
    }
    
    // Track whether the agent was already licensed before this update so we can
    // trigger the QuickBooks sync only on the transition into "licensed".
    const wasLicensed = !!licensingProgress.isLicensed;

    const { checklistItem, data, action } = req.body;

    // Reschedule action: record a new scheduled attempt in the history,
    // bump the attempt counter, and update the current date. Lets admins
    // clearly track agents who schedule the state exam / fingerprinting
    // more than once.
    if (action === 'addReschedule' && checklistItem &&
        (checklistItem === 'stateExam' || checklistItem === 'fingerprinting')) {
      const item = licensingProgress.checklist[checklistItem];
      const entry = {
        date: data?.date || Date.now(),
        outcome: data?.outcome || 'Scheduled',
        notes: data?.notes || '',
        recordedAt: Date.now(),
        recordedBy: req.user._id
      };
      if (!Array.isArray(item.scheduleHistory)) item.scheduleHistory = [];
      item.scheduleHistory.push(entry);
      // Derived from the history array so it can never drift out of sync
      item.attempts = item.scheduleHistory.length;
      item.scheduled = true;
      if (checklistItem === 'stateExam') item.scheduledDate = entry.date;
      if (checklistItem === 'fingerprinting') item.appointmentDate = entry.date;

      licensingProgress.lastUpdatedBy = req.user._id;
      await licensingProgress.save();
      await licensingProgress.populate('agent', 'name email phone');
      return res.json(licensingProgress);
    }

    // Update specific checklist item
    if (checklistItem && licensingProgress.checklist[checklistItem]) {
      // attempts is derived from scheduleHistory.length — never let a client
      // value override it, so the counter can't drift out of sync with the
      // recorded history.
      if ((checklistItem === 'stateExam' || checklistItem === 'fingerprinting') && data && 'attempts' in data) {
        delete data.attempts;
      }

      Object.assign(licensingProgress.checklist[checklistItem], data);

      if (checklistItem === 'stateExam' || checklistItem === 'fingerprinting') {
        licensingProgress.checklist[checklistItem].attempts =
          (licensingProgress.checklist[checklistItem].scheduleHistory || []).length;
      }

      // If marking as completed/scheduled/approved, set date
      if (checklistItem === 'preLicenseCourse' && data.completed) {
        licensingProgress.checklist[checklistItem].completedDate = data.completedDate || Date.now();
      }
      if (checklistItem === 'stateExam' && data.scheduled) {
        licensingProgress.checklist[checklistItem].scheduledDate = data.scheduledDate || Date.now();
      }
      if (checklistItem === 'fingerprinting' && data.scheduled) {
        licensingProgress.checklist[checklistItem].appointmentDate = data.appointmentDate || Date.now();
      }
      if (checklistItem === 'diceApplication' && data.submitted) {
        licensingProgress.checklist[checklistItem].submittedDate = data.submittedDate || Date.now();
      }
      if (checklistItem === 'stateAppointment') {
        // Tie the obtained date to the actual final step. Unchecking it clears
        // the date so an admin can correct a mistaken approval.
        if (data.approved) {
          licensingProgress.checklist[checklistItem].approvedDate = data.approvedDate || Date.now();
        } else if (data.approved === false) {
          licensingProgress.checklist[checklistItem].approvedDate = null;
        }
      }
    }

    // Recompute licensed status from the underlying EVIDENCE so the stored flag
    // always reflects reality: licensed when the final step is approved, or when
    // the agent has a self-reported/existing license (APA / metadata). We pass a
    // null progress to isAgentLicensed so it ignores the (possibly stale) stored
    // flag and evaluates only the external signals — otherwise the recompute
    // would be circular and unchecking the final step could never revert it.
    const apaForLicense = await APAApplication.findOne({
      $or: [{ user: req.params.agentId }, { userId: req.params.agentId }]
    }).select('licensingStatus').lean();
    const licensedExternally = isAgentLicensed(null, apaForLicense, agent.metadata);
    licensingProgress.isLicensed = !!licensingProgress.checklist.stateAppointment.approved || licensedExternally;

    // licenseObtainedDate tracks completion of RHP's pipeline specifically
    // (the final state-appointment step), independent of an externally/
    // self-reported license — so a null date signals "licensed without
    // completing the internal checklist".
    if (licensingProgress.checklist.stateAppointment.approved) {
      if (!licensingProgress.licenseObtainedDate) {
        licensingProgress.licenseObtainedDate = licensingProgress.checklist.stateAppointment.approvedDate || Date.now();
      }
    } else {
      licensingProgress.licenseObtainedDate = null;
    }

    // Fire the "now licensed" notifications only on the false → true transition.
    if (!wasLicensed && licensingProgress.isLicensed) {
      Notification.createNotification({
        userId: req.params.agentId,
        type: 'license_approved',
        title: 'You Are Now Licensed!',
        message: 'Congratulations! Your licensing process is complete. You are now a fully licensed agent.',
        link: '/licensing'
      }, true).catch(() => {});

      try {
        const admins = await User.find({ role: 'admin' }).select('_id').lean();
        for (const admin of admins) {
          Notification.createNotification({
            userId: admin._id,
            type: 'license_approved',
            title: 'Agent Licensed',
            message: `${agent.name} (${agent.email}) has completed all licensing requirements and is now a licensed agent.`,
            link: '/admin/licensing',
            data: { agentId: req.params.agentId }
          }, false).catch(() => {});
        }
      } catch (notifErr) {
        console.error('Failed to notify admins of licensing:', notifErr);
      }
    }

    licensingProgress.lastUpdatedBy = req.user._id;
    await licensingProgress.save();
    await licensingProgress.populate('agent', 'name email phone');

    // Agent just became licensed → this is when W-9 / direct-deposit collection
    // becomes relevant, so sync them to QuickBooks now (and never before) as a
    // 1099 contractor (Vendor). Best-effort and non-blocking: if QuickBooks
    // isn't connected the sync is skipped, and any failure must not fail the
    // licensing update.
    if (!wasLicensed && licensingProgress.isLicensed) {
      syncAgentToQBO(req.params.agentId, req.user._id)
        .then(result => {
          if (result.status === 'created') {
            console.log(`[QBO] Auto-synced newly licensed agent ${req.params.agentId} (contractor ${result.qboVendorId})`);
          } else if (result.status === 'already_exists') {
            console.log(`[QBO] Newly licensed agent ${req.params.agentId} already existed in QuickBooks (linked)`);
          } else {
            console.log(`[QBO] Auto-sync on licensure skipped for ${req.params.agentId}: ${result.status}`);
          }
        })
        .catch(err => console.error('[QBO] Auto-sync on licensure failed:', err.message));
    }

    res.json(licensingProgress);
  } catch (error) {
    console.error('Error updating checklist:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/licensing/:agentId/checklist/:checklistItem/history/:historyId
// @desc    Edit a single attempt/reschedule entry (state exam or fingerprinting)
// @access  Admin, or any upline of this agent
router.put('/:agentId/checklist/:checklistItem/history/:historyId', authenticate, requireAdminOrUpline, async (req, res) => {
  try {
    const { checklistItem, historyId } = req.params;
    if (!['stateExam', 'fingerprinting'].includes(checklistItem)) {
      return res.status(400).json({ message: 'Invalid checklist item' });
    }

    const agent = await User.findById(req.params.agentId);
    if (!agent || agent.role !== 'agent') {
      return res.status(404).json({ message: 'Agent not found' });
    }

    const licensingProgress = await LicensingProgress.findOne({ agent: req.params.agentId });
    if (!licensingProgress) return res.status(404).json({ message: 'Licensing progress not found' });

    const item = licensingProgress.checklist[checklistItem];
    const entry = item.scheduleHistory.id(historyId);
    if (!entry) return res.status(404).json({ message: 'Attempt not found' });

    const { date, outcome, notes } = req.body;
    if (date !== undefined) entry.date = date;
    if (outcome !== undefined) entry.outcome = outcome;
    if (notes !== undefined) entry.notes = notes;

    // Keep the "current" scheduled/appointment date in sync with the most
    // recent entry so the checklist summary doesn't show a stale date.
    const latest = item.scheduleHistory[item.scheduleHistory.length - 1];
    if (checklistItem === 'stateExam') item.scheduledDate = latest.date;
    if (checklistItem === 'fingerprinting') item.appointmentDate = latest.date;

    licensingProgress.lastUpdatedBy = req.user._id;
    await licensingProgress.save();
    await licensingProgress.populate('agent', 'name email phone');
    res.json(licensingProgress);
  } catch (error) {
    console.error('Error updating attempt history entry:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/licensing/:agentId/checklist/:checklistItem/history/:historyId
// @desc    Delete a single attempt/reschedule entry; keeps `attempts` in sync
//          with the remaining history so the two values never disagree.
// @access  Admin, or any upline of this agent
router.delete('/:agentId/checklist/:checklistItem/history/:historyId', authenticate, requireAdminOrUpline, async (req, res) => {
  try {
    const { checklistItem, historyId } = req.params;
    if (!['stateExam', 'fingerprinting'].includes(checklistItem)) {
      return res.status(400).json({ message: 'Invalid checklist item' });
    }

    const agent = await User.findById(req.params.agentId);
    if (!agent || agent.role !== 'agent') {
      return res.status(404).json({ message: 'Agent not found' });
    }

    const licensingProgress = await LicensingProgress.findOne({ agent: req.params.agentId });
    if (!licensingProgress) return res.status(404).json({ message: 'Licensing progress not found' });

    const item = licensingProgress.checklist[checklistItem];
    const entry = item.scheduleHistory.id(historyId);
    if (!entry) return res.status(404).json({ message: 'Attempt not found' });

    item.scheduleHistory.pull(historyId);
    item.attempts = item.scheduleHistory.length;

    // Reflect the new latest entry (if any) as the current date; clear if none left.
    const latest = item.scheduleHistory[item.scheduleHistory.length - 1];
    if (checklistItem === 'stateExam') item.scheduledDate = latest ? latest.date : null;
    if (checklistItem === 'fingerprinting') item.appointmentDate = latest ? latest.date : null;
    if (item.scheduleHistory.length === 0) item.scheduled = false;

    licensingProgress.lastUpdatedBy = req.user._id;
    await licensingProgress.save();
    await licensingProgress.populate('agent', 'name email phone');
    res.json(licensingProgress);
  } catch (error) {
    console.error('Error deleting attempt history entry:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/licensing/:agentId/upload/:checklistItem
// @desc    Upload document for checklist item
// @access  Admin, or any upline of this agent
router.post('/:agentId/upload/:checklistItem',
  authenticate,
  requireAdminOrUpline,
  upload.single('document'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }
      
      // Check if agent exists
      const agent = await User.findById(req.params.agentId);
      if (!agent || agent.role !== 'agent') {
        return res.status(404).json({ message: 'Agent not found' });
      }
      
      // Find or create licensing progress
      let licensingProgress = await LicensingProgress.findOne({ agent: req.params.agentId });
      
      if (!licensingProgress) {
        // Auto-create if doesn't exist
        const enrollmentDate = agent.createdAt || Date.now();
        const licensingDeadline = new Date(enrollmentDate);
        licensingDeadline.setDate(licensingDeadline.getDate() + 30);
        
        licensingProgress = new LicensingProgress({
          agent: req.params.agentId,
          enrollmentDate: enrollmentDate,
          licensingDeadline: licensingDeadline,
          lastUpdatedBy: req.user._id
        });
      }
      
      const checklistItem = req.params.checklistItem;
      
      if (!licensingProgress.checklist[checklistItem]) {
        return res.status(400).json({ message: 'Invalid checklist item' });
      }
      
      // Add document to checklist item
      const document = {
        filename: req.file.originalname,
        url: `/uploads/licensing/${req.file.filename}`,
        uploadedAt: Date.now(),
        uploadedBy: req.user._id
      };
      
      licensingProgress.checklist[checklistItem].documents.push(document);
      licensingProgress.lastUpdatedBy = req.user._id;
      
      await licensingProgress.save();
      await licensingProgress.populate('agent', 'name email phone');
      
      res.json({
        message: 'Document uploaded successfully',
        document,
        licensingProgress
      });
    } catch (error) {
      console.error('Error uploading document:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// @route   PUT /api/licensing/:agentId/notes
// @desc    Update admin notes
// @access  Admin, or any upline of this agent
router.put('/:agentId/notes', authenticate, requireAdminOrUpline, async (req, res) => {
  try {
    // Check if agent exists
    const agent = await User.findById(req.params.agentId);
    if (!agent || agent.role !== 'agent') {
      return res.status(404).json({ message: 'Agent not found' });
    }
    
    // Find or create licensing progress
    let licensingProgress = await LicensingProgress.findOne({ agent: req.params.agentId });
    
    if (!licensingProgress) {
      // Auto-create if doesn't exist
      const enrollmentDate = agent.createdAt || Date.now();
      const licensingDeadline = new Date(enrollmentDate);
      licensingDeadline.setDate(licensingDeadline.getDate() + 30);
      
      licensingProgress = new LicensingProgress({
        agent: req.params.agentId,
        enrollmentDate: enrollmentDate,
        licensingDeadline: licensingDeadline,
        lastUpdatedBy: req.user._id
      });
    }
    
    licensingProgress.adminNotes = req.body.adminNotes;
    licensingProgress.lastUpdatedBy = req.user._id;
    
    await licensingProgress.save();
    await licensingProgress.populate('agent', 'name email phone');
    
    res.json(licensingProgress);
  } catch (error) {
    console.error('Error updating admin notes:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
