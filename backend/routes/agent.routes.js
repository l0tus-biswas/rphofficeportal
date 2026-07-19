const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Notification = require('../models/Notification');
const LicensingProgress = require('../models/LicensingProgress');
const APAApplication = require('../models/APAApplication');
const { protect, authorize } = require('../middleware/auth.middleware');
const { validateRequest, schemas } = require('../middleware/validation.middleware');
const { logAction } = require('../middleware/audit.middleware');
const { sendResponse, errorResponse, paginate } = require('../utils/helpers');
const AgentCarrierStatus = require('../models/AgentCarrierStatus');
const OnboardingDocument = require('../models/OnboardingDocument');
const OnboardingDocType = require('../models/OnboardingDocType');
const SystemConfig = require('../models/SystemConfig');
const ACAClientRecord = require('../models/ACAClientRecord');

// All routes require authentication as agent or admin
router.use(protect);
router.use(authorize('agent', 'admin'));

// @route   GET /api/agent/profile
// @desc    Get agent's own profile
// @access  Private (Agent/Admin)
router.get('/profile', async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password')
      .populate('referredBy', 'name email referralCode');
    
    sendResponse(res, 200, { user });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   PUT /api/agent/profile
// @desc    Update agent's own profile
// @access  Private (Agent/Admin)
router.put('/profile', validateRequest(schemas.updateProfile), logAction('UPDATE_PROFILE'), async (req, res) => {
  try {
    const { name, phone, address, city, state, zipCode, dateOfBirth, timezone } = req.body;
    
    const user = await User.findById(req.user._id);
    
    if (name) user.name = name;
    if (phone) user.phone = phone;
    if (address) user.address = address;
    if (city) user.city = city;
    if (state) user.state = state;
    if (zipCode) user.zipCode = zipCode;
    if (dateOfBirth) user.dateOfBirth = dateOfBirth;
    if (timezone !== undefined) user.timezone = timezone || null;
    
    user.updatedBy = req.user._id;
    await user.save();

    Notification.createNotification({
      userId: req.user._id,
      type: 'profile_updated',
      title: 'Profile Updated',
      message: 'Your profile information was updated successfully.',
      link: '/profile'
    }, false).catch(() => {});
    
    sendResponse(res, 200, {
      message: 'Profile updated successfully',
      user: await User.findById(user._id).select('-password')
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/agent/change-password
// @desc    Change password
// @access  Private (Agent/Admin)
router.post('/change-password', validateRequest(schemas.changePassword), logAction('CHANGE_PASSWORD'), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    const user = await User.findById(req.user._id).select('+password');
    
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return sendResponse(res, 400, { message: 'Current password is incorrect' });
    }
    
    user.password = newPassword;
    await user.save();

    Notification.createNotification({
      userId: req.user._id,
      type: 'password_changed',
      title: 'Password Changed',
      message: 'Your password was changed successfully. If you did not do this, contact support immediately.',
      link: '/profile'
    }, false).catch(() => {});
    
    sendResponse(res, 200, {
      message: 'Password changed successfully'
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/agent/recruits
// @desc    Get first-level recruits (direct referrals only) with filters and stats
// @access  Private (Agent/Admin)
router.get('/recruits', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status; // 'active', 'inactive', or 'all'
    const search = req.query.search;
    const sortBy = req.query.sortBy || '-createdAt'; // '-createdAt', 'name', etc.
    
    // Build filter
    const filter = { referredBy: req.user._id, deletedAt: null };

    if (status === 'active') {
      filter.isActive = true;
    } else if (status === 'inactive') {
      filter.isActive = false;
    }
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }
    
    const query = User.find(filter)
      .select('-password')
      .populate('referredBy', 'name email')
      .sort(sortBy);
    
    const recruits = await paginate(query, page, limit);
    const total = await User.countDocuments(filter);
    
    // Get stats
    const totalRecruits = await User.countDocuments({ referredBy: req.user._id, deletedAt: null });
    const activeCount = await User.countDocuments({ referredBy: req.user._id, deletedAt: null, isActive: true });
    const inactiveCount = await User.countDocuments({ referredBy: req.user._id, deletedAt: null, isActive: false });
    
    sendResponse(res, 200, {
      recruits,
      stats: {
        total: totalRecruits,
        active: activeCount,
        inactive: inactiveCount,
        filtered: total
      },
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

// @route   GET /api/agent/downline
// @desc    Get agent's complete downline tree (genealogy) with stats
// @access  Private (Agent/Admin)
router.get('/downline', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const downlineTree = await user.getDownlineTree();
    
    // Calculate downline stats by level
    const calculateLevelStats = (node, level = 1, stats = {}) => {
      if (!node) return stats;
      
      if (!stats[level]) {
        stats[level] = { total: 0, active: 0, inactive: 0 };
      }
      
      stats[level].total++;
      if (node.isActive) {
        stats[level].active++;
      } else {
        stats[level].inactive++;
      }
      
      if (node.children && node.children.length > 0) {
        node.children.forEach(child => {
          calculateLevelStats(child, level + 1, stats);
        });
      }
      
      return stats;
    };
    
    const levelStats = downlineTree ? calculateLevelStats(downlineTree) : {};
    const totalMembers = Object.values(levelStats).reduce((sum, level) => sum + level.total, 0);
    const totalActive = Object.values(levelStats).reduce((sum, level) => sum + level.active, 0);
    
    sendResponse(res, 200, {
      downline: downlineTree,
      stats: {
        totalMembers,
        totalActive,
        totalInactive: totalMembers - totalActive,
        levels: Object.keys(levelStats).length,
        levelStats
      }
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/agent/stats
// @desc    Get agent's statistics
// @access  Private (Agent/Admin)
router.get('/stats', async (req, res) => {
  try {
    const directRecruits = await User.countDocuments({ referredBy: req.user._id, deletedAt: null });

    // Get all descendants count (recursive)
    const getDescendantsCount = async (userId) => {
      const children = await User.find({ referredBy: userId, deletedAt: null }).select('_id');
      let count = children.length;

      for (const child of children) {
        count += await getDescendantsCount(child._id);
      }

      return count;
    };

    const totalDownline = await getDescendantsCount(req.user._id);

    const activeRecruits = await User.countDocuments({
      referredBy: req.user._id,
      deletedAt: null,
      isActive: true
    });

    // ACA Top 5 Leaderboards (global)
    let topPersonalACA = [];
    let topTeamACA = [];
    try {
      const globalLatestBatchDoc = await ACAClientRecord.findOne({}, { uploadBatch: 1 }).sort({ uploadedAt: -1 }).lean();
      if (globalLatestBatchDoc) {
        const globalBatch = globalLatestBatchDoc.uploadBatch;
        topPersonalACA = await ACAClientRecord.aggregate([
          { $match: { uploadBatch: globalBatch } },
          { $sort: { clientCount: -1 } },
          { $limit: 5 },
          { $lookup: { from: 'users', localField: 'agent', foreignField: '_id', as: 'agentInfo' } },
          { $unwind: { path: '$agentInfo', preserveNullAndEmptyArrays: true } },
          { $project: { agentName: { $ifNull: ['$agentInfo.name', '$agentName'] }, clientCount: 1 } }
        ]);

        const allGlobalRecords = await ACAClientRecord.find({ uploadBatch: globalBatch }).lean();
        const allAgentsForTeam = await User.find({ role: 'agent' }).select('_id name referredBy').lean();
        const childrenMap = {};
        allAgentsForTeam.forEach(u => {
          const pid = u.referredBy?.toString();
          if (pid) {
            if (!childrenMap[pid]) childrenMap[pid] = [];
            childrenMap[pid].push(u._id.toString());
          }
        });
        const recordMap = {};
        allGlobalRecords.forEach(r => { recordMap[r.agent.toString()] = r.clientCount; });
        function sumTree(id) {
          let total = recordMap[id] || 0;
          (childrenMap[id] || []).forEach(cid => { total += sumTree(cid); });
          return total;
        }
        const teamTotals = allAgentsForTeam.map(u => ({
          agentName: u.name, teamClientCount: sumTree(u._id.toString())
        }));
        teamTotals.sort((a, b) => b.teamClientCount - a.teamClientCount);
        topTeamACA = teamTotals.slice(0, 5);
      }
    } catch (e) { /* ACA data optional */ }
    
    sendResponse(res, 200, {
      stats: {
        directRecruits,
        totalDownline,
        activeRecruits,
        inactiveRecruits: directRecruits - activeRecruits,
        topPersonalACA,
        topTeamACA
      }
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/agent/referral-link
// @desc    Get agent's referral link
// @access  Private (Agent/Admin)
router.get('/referral-link', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user.referralCode) {
      user.referralCode = user.generateReferralCode();
      await user.save();
    }
    
    const referralLink = `${process.env.APP_URL}/apply?ref=${user.referralCode}`;
    
    sendResponse(res, 200, {
      referralCode: user.referralCode,
      referralLink
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/agent/dashboard/checklist
// @desc    Get personalised Next Steps checklist for dashboard
// @access  Private (Agent/Admin)
router.get('/dashboard/checklist', async (req, res) => {
  try {
    // Check LicensingProgress record (authoritative source for licensing status)
    const lp = await LicensingProgress.findOne({ agent: req.user._id }).select('isLicensed checklist.preLicenseCourse.completed checklist.stateAppointment.approved').lean();
    let isLicensed = lp ? lp.isLicensed : false;

    // If all checklist steps complete (stateAppointment approved), treat as licensed
    if (!isLicensed && lp?.checklist?.stateAppointment?.approved) {
      isLicensed = true;
    }

    // Also check APA Application's licensingStatus (agent self-reported)
    if (!isLicensed) {
      const apa = await APAApplication.findOne({ user: req.user._id }).select('licensingStatus.currentlyLicensed licensingStatus.licenseTypes').lean();
      if (apa?.licensingStatus?.currentlyLicensed || (apa?.licensingStatus?.licenseTypes?.length > 0)) {
        isLicensed = true;
      }
    }

    // Also check user metadata for currentlyLicensed (fallback for imported/migrated agents)
    if (!isLicensed && req.user.metadata) {
      const metaLicensed = req.user.metadata.get ? req.user.metadata.get('currentlyLicensed') : req.user.metadata?.currentlyLicensed;
      if (metaLicensed === 'true' || metaLicensed === true) {
        isLicensed = true;
      }
    }

    // Fetch QuickBooks invite URL from SystemConfig
    let quickbooksUrl = null;
    try {
      const cfg = await SystemConfig.findOne({ key: 'quickbooksInviteUrl' });
      if (cfg && cfg.value && cfg.value !== '#') quickbooksUrl = cfg.value;
    } catch (e) { /* ignore */ }

    if (!isLicensed) {
      // Show dynamic progress based on actual licensing checklist
      const hasStartedStudy = lp && lp.checklist ? lp.checklist.preLicenseCourse?.completed : false;
      return sendResponse(res, 200, {
        checklist: [
          { label: 'Study on ExamFX', completed: !!hasStartedStudy, link: 'https://www.examfx.com' },
          { label: 'Get your insurance license', completed: false, link: '/licensing' }
        ]
      });
    }

    // For licensed agents: check onboarding documents
    const docTypeNames = ['W-9', "E&O Insurance", 'CMS Certificate'];
    const docTypes = await OnboardingDocType.find({ name: { $in: docTypeNames }, isActive: true }).select('_id name');
    const docTypeMap = {};
    docTypes.forEach(dt => { docTypeMap[dt.name] = dt._id; });

    // Fetch uploaded (non-deleted) documents for the agent for these doc types
    const uploadedDocs = await OnboardingDocument.find({
      agent: req.user._id,
      docType: { $in: Object.values(docTypeMap) },
      deletedAt: null
    }).select('docType');

    const uploadedDocTypeIds = new Set(uploadedDocs.map(d => d.docType.toString()));

    const hasCarrierRequest = await AgentCarrierStatus.exists({ agent: req.user._id });

    const checklist = [
      {
        label: 'Complete W-9 / Direct Deposit via QuickBooks',
        completed: !!req.user.qboVendorId,
        link: quickbooksUrl
      },
      {
        label: 'Upload E&O Insurance',
        completed: docTypeMap['E&O Insurance'] ? uploadedDocTypeIds.has(docTypeMap['E&O Insurance'].toString()) : false,
        link: '/onboarding-hub'
      },
      {
        label: 'Upload CMS Certificate',
        completed: docTypeMap['CMS Certificate'] ? uploadedDocTypeIds.has(docTypeMap['CMS Certificate'].toString()) : false,
        link: '/onboarding-hub'
      },
      {
        label: 'Request Carrier Appointments',
        completed: !!hasCarrierRequest,
        link: '/carriers'
      },
      {
        label: 'Check onboarding docs tab',
        completed: false,
        link: '/onboarding-hub'
      }
    ];

    sendResponse(res, 200, { checklist });
  } catch (error) {
    errorResponse(res, error);
  }
});

// ───────────────────────────────────────────────────────────────────
// §17  My Team — Unified recruits + downline with filters & search
// ───────────────────────────────────────────────────────────────────

// @route   GET /api/agent/my-team
// @desc    Unified view: full downline tree + flat list with filters
// @access  Private (Agent/Admin)
router.get('/my-team', async (req, res) => {
  try {
    const {
      view = 'tree',        // 'tree' or 'list'
      search,               // search by name/email
      status,               // 'active' | 'inactive'
      licensed,             // 'licensed' | 'unlicensed' | 'all'
      datePreset,           // '30d' | '60d' | '90d' | '6m' | '12m'
      dateFrom,             // ISO date string
      dateTo,               // ISO date string
      page: pageStr = '1',
      limit: limitStr = '50',
      sortBy = '-createdAt'
    } = req.query;

    const page = parseInt(pageStr) || 1;
    const limit = Math.min(parseInt(limitStr) || 50, 200);

    // 1. Get ALL descendant users via BFS (full hierarchy)
    const allDescendants = await getAllDescendantsFlat(req.user._id);

    // 2. Get licensing data for all descendants
    const descendantIds = allDescendants.map(u => u._id);
    const licensingRecords = await LicensingProgress.find({ agent: { $in: descendantIds } })
      .select('agent isLicensed')
      .lean();
    const licensingMap = {};
    licensingRecords.forEach(r => {
      licensingMap[r.agent.toString()] = r.isLicensed;
    });

    // 3. Enrich with licensing status + level in tree
    const enriched = allDescendants.map(u => ({
      ...u,
      isLicensed: licensingMap[u._id.toString()] || false,
      recruitedByName: u._recruitedByName || null,
      recruitedAt: u.createdAt
    }));

    // 4. Apply filters
    let filtered = enriched;

    // Search
    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filtered = filtered.filter(u => regex.test(u.name) || regex.test(u.email));
    }

    // Status
    if (status === 'active') {
      filtered = filtered.filter(u => u.isActive);
    } else if (status === 'inactive') {
      filtered = filtered.filter(u => !u.isActive);
    }

    // Licensed
    if (licensed === 'licensed') {
      filtered = filtered.filter(u => u.isLicensed);
    } else if (licensed === 'unlicensed') {
      filtered = filtered.filter(u => !u.isLicensed);
    }

    // Date range
    let fromDate = null, toDate = null;
    if (datePreset) {
      const now = new Date();
      const presetMap = {
        '30d': 30, '60d': 60, '90d': 90,
        '6m': 180, '12m': 365
      };
      const days = presetMap[datePreset];
      if (days) {
        fromDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      }
    } else {
      if (dateFrom) fromDate = new Date(dateFrom);
      if (dateTo) toDate = new Date(dateTo);
    }
    if (fromDate) filtered = filtered.filter(u => new Date(u.createdAt) >= fromDate);
    if (toDate) filtered = filtered.filter(u => new Date(u.createdAt) <= toDate);

    // Sort
    const sortField = sortBy.replace(/^-/, '');
    const sortDir = sortBy.startsWith('-') ? -1 : 1;
    filtered.sort((a, b) => {
      const av = a[sortField], bv = b[sortField];
      if (av < bv) return -1 * sortDir;
      if (av > bv) return 1 * sortDir;
      return 0;
    });

    // Stats
    const stats = {
      totalMembers: enriched.length,
      totalActive: enriched.filter(u => u.isActive).length,
      totalInactive: enriched.filter(u => !u.isActive).length,
      totalLicensed: enriched.filter(u => u.isLicensed).length,
      totalUnlicensed: enriched.filter(u => !u.isLicensed).length,
      directRecruits: enriched.filter(u => u.treeLevel === 1).length,
      filtered: filtered.length
    };

    // Level breakdown
    const levelStats = {};
    enriched.forEach(u => {
      const lvl = u.treeLevel || 1;
      if (!levelStats[lvl]) levelStats[lvl] = { total: 0, active: 0, inactive: 0, licensed: 0 };
      levelStats[lvl].total++;
      if (u.isActive) levelStats[lvl].active++;
      else levelStats[lvl].inactive++;
      if (u.isLicensed) levelStats[lvl].licensed++;
    });
    stats.levelStats = levelStats;

    if (view === 'tree') {
      // Build tree structure from flat list (unfiltered — tree shows all, filters highlight)
      const tree = buildTreeFromFlat(req.user._id, enriched);
      sendResponse(res, 200, { tree, stats, view: 'tree' });
    } else {
      // Paginated flat list
      const total = filtered.length;
      const paginated = filtered.slice((page - 1) * limit, page * limit);
      sendResponse(res, 200, {
        members: paginated,
        stats,
        view: 'list',
        pagination: { page, limit, total, pages: Math.ceil(total / limit) }
      });
    }
  } catch (error) {
    errorResponse(res, error);
  }
});

// Helper: BFS to get all descendants as flat array with tree level
async function getAllDescendantsFlat(rootUserId) {
  const allUsers = [];
  const queue = [{ parentId: rootUserId, level: 1 }];
  const visited = new Set();

  while (queue.length > 0) {
    const batch = [...queue];
    queue.length = 0;

    const parentIds = batch.map(b => b.parentId);
    const levelMap = {};
    batch.forEach(b => { levelMap[b.parentId.toString()] = b.level; });

    const children = await User.find({
      referredBy: { $in: parentIds },
      _id: { $nin: Array.from(visited) },
      deletedAt: null
    })
    .select('_id name email role isActive createdAt referredBy referralCode')
    .populate('referredBy', 'name')
    .lean();

    children.forEach(child => {
      const childIdStr = child._id.toString();
      if (!visited.has(childIdStr)) {
        visited.add(childIdStr);
        const parentLevel = levelMap[child.referredBy?._id?.toString() || child.referredBy?.toString()] || 1;
        allUsers.push({
          ...child,
          _recruitedByName: child.referredBy?.name || null,
          referredBy: child.referredBy?._id || child.referredBy,
          treeLevel: parentLevel
        });
        queue.push({ parentId: child._id, level: parentLevel + 1 });
      }
    });
  }

  return allUsers;
}

// Helper: Build tree structure from flat descendants list
function buildTreeFromFlat(rootUserId, flatList) {
  const rootIdStr = rootUserId.toString();
  const childrenMap = {};

  flatList.forEach(user => {
    const parentId = (user.referredBy?._id || user.referredBy || '').toString();
    if (!childrenMap[parentId]) childrenMap[parentId] = [];
    childrenMap[parentId].push(user);
  });

  const buildNode = (userId) => {
    const children = (childrenMap[userId.toString()] || []).map(child => ({
      ...child,
      children: buildNode(child._id)
    }));
    return children;
  };

  return buildNode(rootUserId);
}

// @route   GET /api/agent/welcome-message
// @desc    Get the welcome message for new users (if not yet dismissed)
// @access  Private
router.get('/welcome-message', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    // Get the welcome message config
    const config = await SystemConfig.findOne({ key: 'welcome_message' });
    if (!config || !config.value || !config.value.enabled) {
      return sendResponse(res, 200, { show: false });
    }

    const { displayMode, startDate, endDate, lastConfiguredAt } = config.value;

    // First login only mode: only show to users created AFTER the message was configured
    // and who haven't dismissed it yet
    if (displayMode === 'first_login') {
      if (user.welcomeMessageSeenAt) {
        return sendResponse(res, 200, { show: false });
      }
      // Only show to users who registered after the welcome message was set up
      if (lastConfiguredAt && user.createdAt && new Date(user.createdAt) < new Date(lastConfiguredAt)) {
        return sendResponse(res, 200, { show: false });
      }
    }

    // Date range mode: only show within the specified dates, and respect dismiss
    if (displayMode === 'date_range') {
      const now = new Date();
      if (startDate && new Date(startDate) > now) return sendResponse(res, 200, { show: false });
      if (endDate && new Date(endDate) < now) return sendResponse(res, 200, { show: false });
      if (user.welcomeMessageSeenAt) return sendResponse(res, 200, { show: false });
    }

    // Until dismissed mode (default): show until user explicitly dismisses
    if (displayMode === 'until_dismissed' || !displayMode) {
      if (user.welcomeMessageSeenAt) {
        return sendResponse(res, 200, { show: false });
      }
    }

    sendResponse(res, 200, {
      show: true,
      title: config.value.title || 'Welcome to RHP Office!',
      message: config.value.message || '',
      videoUrl: config.value.videoUrl || null,
      imageUrl: config.value.imageUrl || null,
      pdfUrl: config.value.pdfUrl || null
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/agent/welcome-message/dismiss
// @desc    Mark the welcome message as seen
// @access  Private
router.post('/welcome-message/dismiss', async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { welcomeMessageSeenAt: new Date() });
    sendResponse(res, 200, { message: 'Welcome message dismissed' });
  } catch (error) {
    errorResponse(res, error);
  }
});

module.exports = router;
