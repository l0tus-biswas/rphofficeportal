const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const PromotionLevel = require('../models/PromotionLevel');
const ProductionSubmission = require('../models/ProductionSubmission');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { protect: authenticate, authorize } = require('../middleware/auth.middleware');
const { sendResponse, errorResponse, getDownlineIds } = require('../utils/helpers');

// ============================================================================
// Qualifying product categories for promotion calculations
// Only Life Insurance and Supplemental Insurance count toward promotions.
// ACA/Medicare/Retirement do NOT count toward promotion tracking.
// ============================================================================
const QUALIFYING_CATEGORIES = ['Life Insurance', 'Supplemental Insurance'];

// ============================================================================
// Helper: get all promotion levels sorted by rank
// ============================================================================
async function getSortedLevels() {
  return PromotionLevel.find({ isActive: true }).sort({ rank: 1 }).lean();
}

// ============================================================================
// Helper: compute premium for a set of agent IDs since a date or rolling window
// If sinceDate is provided, use it; otherwise fall back to rolling windowDays
// Supports per-agent transfer filtering via transferDates map
// ============================================================================
async function sumQualifyingPremium(agentIds, windowDays, sinceDate, transferDates) {
  if (!agentIds || agentIds.length === 0) return 0;

  const baseCutoff = sinceDate ? new Date(sinceDate) : new Date();
  if (!sinceDate) {
    baseCutoff.setDate(baseCutoff.getDate() - windowDays);
  }

  // Use inForceDate for promotion tracking (falls back to submissionDate via $ifNull)
  const dateExpr = { $ifNull: ['$inForceDate', '$submissionDate'] };

  // If no transfer dates, use single aggregation with global cutoff
  if (!transferDates || transferDates.size === 0) {
    const result = await ProductionSubmission.aggregate([
      {
        $match: {
          agent: { $in: agentIds.map(id => new mongoose.Types.ObjectId(id)) },
          status: 'In Force',
          productCategory: { $in: QUALIFYING_CATEGORIES },
          deletedAt: null
        }
      },
      {
        $addFields: { _promotionDate: dateExpr }
      },
      {
        $match: { _promotionDate: { $gte: baseCutoff } }
      },
      { $group: { _id: null, total: { $sum: '$premiumAmount' } } }
    ]);
    return result.length > 0 ? result[0].total : 0;
  }

  // With transfer dates: separate agents into transferred (with later cutoff) and non-transferred
  const nonTransferredIds = [];
  const transferredGroups = []; // { ids: [], cutoff: Date }

  for (const id of agentIds) {
    const idStr = id.toString();
    const transferDate = transferDates.get(idStr);
    if (transferDate && new Date(transferDate) > baseCutoff) {
      // This agent was transferred after baseCutoff; only count production since transfer
      transferredGroups.push({ id: new mongoose.Types.ObjectId(id), cutoff: new Date(transferDate) });
    } else {
      nonTransferredIds.push(new mongoose.Types.ObjectId(id));
    }
  }

  let total = 0;

  // Sum non-transferred agents with global cutoff
  if (nonTransferredIds.length > 0) {
    const result = await ProductionSubmission.aggregate([
      {
        $match: {
          agent: { $in: nonTransferredIds },
          status: 'In Force',
          productCategory: { $in: QUALIFYING_CATEGORIES },
          deletedAt: null
        }
      },
      { $addFields: { _promotionDate: dateExpr } },
      { $match: { _promotionDate: { $gte: baseCutoff } } },
      { $group: { _id: null, total: { $sum: '$premiumAmount' } } }
    ]);
    if (result.length > 0) total += result[0].total;
  }

  // Sum transferred agents with their individual cutoffs (using inForceDate)
  if (transferredGroups.length > 0) {
    // For transferred agents, we need to filter per-agent by their transfer cutoff
    // using the promotion date (inForceDate or submissionDate)
    for (const g of transferredGroups) {
      const agentResult = await ProductionSubmission.aggregate([
        {
          $match: {
            agent: g.id,
            status: 'In Force',
            productCategory: { $in: QUALIFYING_CATEGORIES },
            deletedAt: null
          }
        },
        { $addFields: { _promotionDate: dateExpr } },
        { $match: { _promotionDate: { $gte: g.cutoff } } },
        { $group: { _id: null, total: { $sum: '$premiumAmount' } } }
      ]);
      if (agentResult.length > 0) total += agentResult[0].total;
    }
  }

  return total;
}

// ============================================================================
// Helper: count distinct producing agents since a date or rolling window
// Only counts LICENSED agents (LicensingProgress.isLicensed === true)
// Supports per-agent transfer filtering via transferDates map
// ============================================================================
async function countProducingAgents(agentIds, windowDays, sinceDate, transferDates) {
  if (!agentIds || agentIds.length === 0) return 0;

  const baseCutoff = sinceDate ? new Date(sinceDate) : new Date();
  if (!sinceDate) {
    baseCutoff.setDate(baseCutoff.getDate() - windowDays);
  }

  // Use inForceDate for promotion tracking (falls back to submissionDate via $ifNull)
  const dateExpr = { $ifNull: ['$inForceDate', '$submissionDate'] };

  // Get licensed agent IDs first
  const LicensingProgress = require('../models/LicensingProgress');
  const licensedRecords = await LicensingProgress.find({
    agent: { $in: agentIds.map(id => new mongoose.Types.ObjectId(id)) },
    isLicensed: true
  }).select('agent').lean();
  const licensedIds = licensedRecords.map(r => r.agent);

  if (licensedIds.length === 0) return 0;

  // If no transfer dates, use single aggregation
  if (!transferDates || transferDates.size === 0) {
    const result = await ProductionSubmission.aggregate([
      {
        $match: {
          agent: { $in: licensedIds },
          status: 'In Force',
          productCategory: { $in: QUALIFYING_CATEGORIES },
          deletedAt: null
        }
      },
      { $addFields: { _promotionDate: dateExpr } },
      { $match: { _promotionDate: { $gte: baseCutoff } } },
      { $group: { _id: '$agent' } }
    ]);
    return result.length;
  }

  // With transfer dates: build per-agent cutoff conditions using inForceDate
  const nonTransferredIds = [];
  const transferredGroups = [];

  for (const id of licensedIds) {
    const idStr = id.toString();
    const transferDate = transferDates.get(idStr);
    if (transferDate && new Date(transferDate) > baseCutoff) {
      transferredGroups.push({ id, cutoff: new Date(transferDate) });
    } else {
      nonTransferredIds.push(id);
    }
  }

  let distinctAgents = new Set();

  // Non-transferred agents with global cutoff
  if (nonTransferredIds.length > 0) {
    const result = await ProductionSubmission.aggregate([
      {
        $match: {
          agent: { $in: nonTransferredIds },
          status: 'In Force',
          productCategory: { $in: QUALIFYING_CATEGORIES },
          deletedAt: null
        }
      },
      { $addFields: { _promotionDate: dateExpr } },
      { $match: { _promotionDate: { $gte: baseCutoff } } },
      { $group: { _id: '$agent' } }
    ]);
    result.forEach(r => distinctAgents.add(r._id.toString()));
  }

  // Transferred agents with their individual cutoffs
  for (const g of transferredGroups) {
    const result = await ProductionSubmission.aggregate([
      {
        $match: {
          agent: g.id,
          status: 'In Force',
          productCategory: { $in: QUALIFYING_CATEGORIES },
          deletedAt: null
        }
      },
      { $addFields: { _promotionDate: dateExpr } },
      { $match: { _promotionDate: { $gte: g.cutoff } } },
      { $group: { _id: '$agent' } }
    ]);
    result.forEach(r => distinctAgents.add(r._id.toString()));
  }

  return distinctAgents.size;
}

// ============================================================================
// Fast-Track: default multiplier (used if level doesn't specify one)
// ============================================================================
const DEFAULT_SKIP_MULTIPLIER = 1.4;
const DEFAULT_LEG_CAP_PERCENT = 50;

// ============================================================================
// Helper: compute premium per direct leg (first-level children) for 50% cap
// ============================================================================
async function getPremiumByLeg(userId, windowDays, sinceDate) {
  const User = require('../models/User');
  const user = await User.findById(userId).select('children').lean();
  if (!user || !user.children || user.children.length === 0) return [];

  const legPremiums = [];
  for (const childId of user.children) {
    // Get all descendants under this child (leg)
    const legIds = [childId];
    const queue = [childId];
    while (queue.length > 0) {
      const current = queue.shift();
      const u = await User.findById(current).select('children').lean();
      if (u && u.children) {
        for (const cid of u.children) {
          legIds.push(cid);
          queue.push(cid);
        }
      }
    }
    const premium = await sumQualifyingPremium(legIds, windowDays, sinceDate);
    legPremiums.push({ legId: childId, premium });
  }

  // Also include personal production as a "leg"
  const personalPremium = await sumQualifyingPremium([userId], windowDays, sinceDate);
  if (personalPremium > 0) {
    legPremiums.push({ legId: userId, premium: personalPremium, isPersonal: true });
  }

  return legPremiums;
}

// ============================================================================
// Helper: check if builder fast-track leg cap is satisfied
// No more than legCapPercent% of team premium may come from one leg
// ============================================================================
function checkBuilderLegCap(legPremiums, totalPremium, legCapPercent) {
  if (totalPremium <= 0) return true;
  const cap = (legCapPercent || DEFAULT_LEG_CAP_PERCENT) / 100;
  for (const leg of legPremiums) {
    if (leg.premium / totalPremium > cap) return false;
  }
  return true;
}

// ============================================================================
// Helper: build a Map of downlineId → transferredAt for agents that were
// transferred into the current tree. Used to ensure only post-transfer
// production counts toward the new upline's builder track.
// ============================================================================
async function getTransferDatesForDownline(downlineIds) {
  if (!downlineIds || downlineIds.length === 0) return new Map();

  const transferred = await User.find({
    _id: { $in: downlineIds },
    transferredAt: { $ne: null }
  }).select('_id transferredAt').lean();

  const map = new Map();
  for (const agent of transferred) {
    map.set(agent._id.toString(), agent.transferredAt);
  }
  return map;
}

// ============================================================================
// Helper: walk up the referredBy chain to get all upline ancestor IDs
// Used to propagate promotion checks up the hierarchy
// ============================================================================
async function getUplineChainIds(userId, maxDepth = 10) {
  const chain = [];
  let currentId = userId;
  let depth = 0;
  while (depth < maxDepth) {
    const u = await User.findById(currentId).select('referredBy').lean();
    if (!u || !u.referredBy) break;
    chain.push(u.referredBy);
    currentId = u.referredBy;
    depth++;
  }
  return chain;
}

// ============================================================================
// Helper: run a promotion eligibility check for a single agent and notify admins
// Called for both the submitting agent AND all upline ancestors
// ============================================================================
async function checkAndNotifyPromotion(agentId) {
  try {
    const agent = await User.findById(agentId).select('level name promotedAt').lean();
    if (!agent) return;

    const levels = await PromotionLevel.find({ isActive: true }).sort({ rank: 1 }).lean();
    if (!levels.length) return;

    const userLevelLower = (agent.level || '').toLowerCase();
    const currentIdx = levels.findIndex(l => l.name.toLowerCase() === userLevelLower);
    if (currentIdx < 0 || currentIdx >= levels.length - 1) return;

    const next = levels[currentIdx + 1];
    const promotedAt = agent.promotedAt || null;

    // Check Producer track (personal production)
    const producerPremium = await sumQualifyingPremium([agentId], next.producerWindowDays, promotedAt);
    const producerMet = producerPremium >= next.producerPremiumThreshold;

    // Check Builder track (downline production)
    const downlineIds = await getDownlineIds(agentId);
    if (downlineIds.length > 0 || producerMet) {
      const transferDates = await getTransferDatesForDownline(downlineIds);
      const builderPremium = await sumQualifyingPremium(downlineIds, next.builderWindowDays, promotedAt, transferDates);
      const activeAgents = await countProducingAgents(downlineIds, next.builderWindowDays, promotedAt, transferDates);
      const builderMet = builderPremium >= next.builderPremiumThreshold &&
                         activeAgents >= next.builderAgentCountThreshold;

      if (producerMet || builderMet) {
        // Deduplicate: skip if already notified in past 7 days
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const recentNotif = await Notification.findOne({
          type: 'promotion_eligible',
          'data.agentId': String(agentId),
          'data.nextLevel': next.name,
          createdAt: { $gte: sevenDaysAgo }
        }).lean();

        if (!recentNotif) {
          const admins = await User.find({ role: 'admin' }).select('_id').lean();
          const track = producerMet ? 'producer' : 'builder';
          for (const admin of admins) {
            await Notification.createNotification({
              userId: admin._id,
              type: 'promotion_eligible',
              title: 'Agent Promotion Eligible',
              message: `${agent.name} has met the ${track} track threshold and is ready for promotion to ${next.name}.`,
              data: { agentId: String(agentId), agentName: agent.name, currentLevel: levels[currentIdx].name, nextLevel: next.name, track },
              link: '/admin/user-management'
            });
          }
        }
      }
    }
  } catch (err) {
    console.error('[Promotion Check] Error for agent', agentId, ':', err.message);
  }
}

// ============================================================================
// @route   GET /api/promotion/tracker
// @desc    Dashboard promotion tracker — Producer + Builder tracks
// @access  Authenticated (any agent or admin)
// ============================================================================
router.get('/tracker', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).select('level promotedAt').lean();
    if (!user) return errorResponse(res, new Error('User not found'), 404);

    const windowParam = parseInt(req.query.window, 10);
    const levels = await getSortedLevels();
    if (!levels.length) {
      return sendResponse(res, 200, { hasData: false, message: 'Promotion levels not configured.' });
    }

    // Find current level (case-insensitive so DB names like 'Associate' match user.level 'associate')
    const userLevelLower = (user.level || '').toLowerCase();
    const currentIdx = levels.findIndex(l => l.name.toLowerCase() === userLevelLower);
    // If level not found in DB, fall back to index 0 (lowest level)
    const resolvedIdx = currentIdx >= 0 ? currentIdx : 0;
    const current = levels[resolvedIdx];
    const isMaxLevel = resolvedIdx >= levels.length - 1;
    const next = isMaxLevel ? null : levels[resolvedIdx + 1];

    // Use promotedAt as production reset point; fall back to rolling window if no promotion date
    const promotedAt = user.promotedAt || null;

    // ---- Producer Track ----
    const producerWindow = windowParam || (next ? next.producerWindowDays : current.producerWindowDays);
    const producerPremium = await sumQualifyingPremium([userId], producerWindow, promotedAt);
    const producerTarget = next ? next.producerPremiumThreshold : current.producerPremiumThreshold;
    const producerProgress = producerTarget > 0
      ? Math.min(Math.round((producerPremium / producerTarget) * 100), 100)
      : 100;

    // ---- Builder Track ----
    const downlineIds = await getDownlineIds(userId);
    const builderWindow = windowParam || (next ? next.builderWindowDays : current.builderWindowDays);
    // Get transfer dates for downline agents to ensure only post-transfer production counts
    const transferDates = await getTransferDatesForDownline(downlineIds);
    const builderPremium = await sumQualifyingPremium(downlineIds, builderWindow, promotedAt, transferDates);
    const builderTarget = next ? next.builderPremiumThreshold : current.builderPremiumThreshold;
    const builderProgress = builderTarget > 0
      ? Math.min(Math.round((builderPremium / builderTarget) * 100), 100)
      : 100;

    const activeAgents = await countProducingAgents(downlineIds, builderWindow, promotedAt, transferDates);
    const targetAgentCount = next ? next.builderAgentCountThreshold : current.builderAgentCountThreshold;
    const agentProgress = targetAgentCount > 0
      ? Math.min(Math.round((activeAgents / targetAgentCount) * 100), 100)
      : 100;

    // Combined builder progress = BOTH conditions must be met
    const builderOverallProgress = Math.min(builderProgress, agentProgress);

    // ---- Promotion eligibility ----
    const producerMet = next ? (producerPremium >= next.producerPremiumThreshold) : false;
    const builderMet  = next ? (
      builderPremium >= next.builderPremiumThreshold &&
      activeAgents   >= next.builderAgentCountThreshold
    ) : false;
    const promotionReady = producerMet || builderMet;

    // ---- Fast-Track Skip Logic ----
    // Producer: skip one level if premium >= multiplier × the skip-target level's threshold
    // Builder: skip one level if team premium >= multiplier × skip-target's threshold (with leg cap)
    let fastTrack = { eligible: false };
    const skipTargetIdx = resolvedIdx + 2; // skip one level ahead
    if (!isMaxLevel && skipTargetIdx < levels.length) {
      const skipTarget = levels[skipTargetIdx];
      if (skipTarget.canSkipTo || next.canSkipTo) {
        // Use per-level config or defaults
        const skipLevel = skipTarget.canSkipTo ? skipTarget : next;
        const multiplier = skipLevel.skipMultiplier || DEFAULT_SKIP_MULTIPLIER;
        const legCapPercent = skipLevel.skipLegCapPercent || DEFAULT_LEG_CAP_PERCENT;

        const producerSkipThreshold = skipTarget.producerPremiumThreshold * multiplier;
        const builderSkipThreshold = skipTarget.builderPremiumThreshold * multiplier;

        const producerFastTrack = producerPremium >= producerSkipThreshold;

        // Builder fast-track: multiplier × team premium AND leg cap
        let builderFastTrack = false;
        if (builderPremium >= builderSkipThreshold) {
          const legPremiums = await getPremiumByLeg(userId, builderWindow, promotedAt);
          const totalTeamPremium = builderPremium + (await sumQualifyingPremium([userId], builderWindow, promotedAt));
          builderFastTrack = checkBuilderLegCap(legPremiums, totalTeamPremium, legCapPercent);
        }

        if (producerFastTrack || builderFastTrack) {
          fastTrack = {
            eligible: true,
            skipToLevel: {
              name: skipTarget.name,
              rank: skipTarget.rank,
              commissionPercent: skipTarget.commissionPercent
            },
            track: producerFastTrack ? 'producer' : 'builder',
            producerSkipThreshold,
            builderSkipThreshold
          };
        }
      }
    }

    // Auto-notify admins when eligible (deduplicate: skip if already notified in past 7 days)
    const effectiveNextName = fastTrack.eligible ? fastTrack.skipToLevel.name : (next ? next.name : null);
    if ((promotionReady || fastTrack.eligible) && effectiveNextName) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const recentNotif = await Notification.findOne({
        type: 'promotion_eligible',
        'data.agentId': String(userId),
        'data.nextLevel': effectiveNextName,
        createdAt: { $gte: sevenDaysAgo }
      }).lean();
      if (!recentNotif) {
        const fullUser = await User.findById(userId).select('name').lean();
        const admins = await User.find({ role: 'admin' }).select('_id').lean();
        const track = producerMet ? 'producer' : 'builder';
        const skipNote = fastTrack.eligible ? ' (Fast-Track Skip)' : '';
        for (const admin of admins) {
          await Notification.createNotification({
            userId:  admin._id,
            type:    'promotion_eligible',
            title:   `Agent Promotion Eligible${skipNote}`,
            message: `${fullUser.name} has met the ${track} track threshold and is ready to be promoted to ${effectiveNextName}${skipNote}.`,
            data:    { agentId: String(userId), agentName: fullUser.name, currentLevel: current.name, nextLevel: effectiveNextName, track, fastTrack: fastTrack.eligible },
            link:    '/admin/user-management'
          });
        }
      }
    }

    return sendResponse(res, 200, {
      hasData: true,
      // Current / next level info
      currentLevel: {
        name: current.name,
        rank: current.rank,
        commissionPercent: current.commissionPercent
      },
      nextLevel: next ? {
        name: next.name,
        rank: next.rank,
        commissionPercent: next.commissionPercent
      } : null,
      isMaxLevel,

      // Promotion eligibility flags
      promotionReady,
      producerMet,
      builderMet,

      // Producer track
      producer: {
        premium: producerPremium,
        targetPremium: producerTarget,
        progressPercent: producerProgress,
        windowDays: producerWindow
      },

      // Builder track
      builder: {
        premium: builderPremium,
        targetPremium: builderTarget,
        premiumProgress: builderProgress,
        activeAgents,
        targetAgentCount,
        agentProgress,
        overallProgress: builderOverallProgress,
        windowDays: builderWindow
      },

      // Downline stats
      totalDownline: downlineIds.length,

      // Skip-level info (if applicable to next level)
      skipInfo: next && next.canSkipTo ? {
        canSkip: true,
        requirements: next.skipRequirements
      } : { canSkip: false },

      // Fast-track skip info
      fastTrack
    });
  } catch (err) {
    return errorResponse(res, err);
  }
});

// ============================================================================
// @route   GET /api/promotion/levels
// @desc    Get all promotion levels (public for authenticated users)
// @access  Authenticated
// ============================================================================
router.get('/levels', authenticate, async (req, res) => {
  try {
    const levels = await getSortedLevels();
    return sendResponse(res, 200, { levels });
  } catch (err) {
    return errorResponse(res, err);
  }
});

// ============================================================================
// @route   GET /api/promotion/admin/levels
// @desc    Admin — get all promotion levels (including inactive)
// @access  Admin only
// ============================================================================
router.get('/admin/levels', authenticate, authorize('admin'), async (req, res) => {
  try {
    const levels = await PromotionLevel.find().sort({ rank: 1 }).lean();
    return sendResponse(res, 200, { levels });
  } catch (err) {
    return errorResponse(res, err);
  }
});

// ============================================================================
// @route   PUT /api/promotion/admin/levels/reorder
// @desc    Admin — reorder promotion levels (bulk rank update)
// @access  Admin only
// ============================================================================
router.put('/admin/levels/reorder', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { order } = req.body; // Array of { id, rank }
    if (!Array.isArray(order) || order.length === 0) {
      return sendResponse(res, 400, { message: 'Order array is required' });
    }

    // Two-pass reorder to avoid unique constraint conflicts on rank:
    // Pass 1: set all ranks to negative temporary values
    const tempOps = order.map((item, i) => ({
      updateOne: {
        filter: { _id: item.id },
        update: { $set: { rank: -(i + 1) } }
      }
    }));
    await PromotionLevel.bulkWrite(tempOps);

    // Pass 2: set final positive rank values
    const finalOps = order.map(item => ({
      updateOne: {
        filter: { _id: item.id },
        update: { $set: { rank: item.rank } }
      }
    }));
    await PromotionLevel.bulkWrite(finalOps);

    const levels = await PromotionLevel.find().sort({ rank: 1 }).lean();

    return sendResponse(res, 200, { levels, message: 'Levels reordered.' });
  } catch (err) {
    return errorResponse(res, err);
  }
});

// ============================================================================
// @route   PUT /api/promotion/admin/levels/:id
// @desc    Admin — update a promotion level's thresholds
// @access  Admin only
// ============================================================================
router.put('/admin/levels/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const allowed = [
      'name', 'commissionPercent',
      'producerPremiumThreshold', 'producerWindowDays',
      'builderPremiumThreshold', 'builderAgentCountThreshold', 'builderWindowDays',
      'canSkipTo', 'skipMultiplier', 'skipLegCapPercent', 'isActive'
    ];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates[key] = key === 'name' && typeof req.body[key] === 'string'
          ? req.body[key].trim().toLowerCase()
          : req.body[key];
      }
    }

    const level = await PromotionLevel.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true
    });
    if (!level) return errorResponse(res, new Error('Promotion level not found'), 404);

    return sendResponse(res, 200, { level, message: 'Promotion level updated.' });
  } catch (err) {
    return errorResponse(res, err);
  }
});

// ============================================================================
// @route   POST /api/promotion/admin/levels
// @desc    Admin — create a new promotion level
// @access  Admin only
// ============================================================================
router.post('/admin/levels', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { name, rank, commissionPercent, producerPremiumThreshold, producerWindowDays,
            builderPremiumThreshold, builderAgentCountThreshold, builderWindowDays,
            canSkipTo, skipMultiplier, skipLegCapPercent, isActive } = req.body;

    if (!name || !name.trim()) {
      return sendResponse(res, 400, { message: 'Level name is required' });
    }
    if (rank == null || rank < 1) {
      return sendResponse(res, 400, { message: 'Rank must be a positive number' });
    }

    // Shift existing ranks up if inserting at/after this rank
    await PromotionLevel.updateMany(
      { rank: { $gte: rank } },
      { $inc: { rank: 1 } }
    );

    const level = await PromotionLevel.create({
      name: name.trim().toLowerCase(),
      rank,
      commissionPercent: commissionPercent || 0,
      producerPremiumThreshold: producerPremiumThreshold || 0,
      producerWindowDays: producerWindowDays || 30,
      builderPremiumThreshold: builderPremiumThreshold || 0,
      builderAgentCountThreshold: builderAgentCountThreshold || 0,
      builderWindowDays: builderWindowDays || 60,
      canSkipTo: canSkipTo || false,
      skipMultiplier: skipMultiplier || 1.4,
      skipLegCapPercent: skipLegCapPercent || 50,
      isActive: isActive !== false
    });

    return sendResponse(res, 201, { level, message: 'Promotion level created.' });
  } catch (err) {
    if (err.code === 11000) {
      return sendResponse(res, 400, { message: 'A level with that name or rank already exists.' });
    }
    return errorResponse(res, err);
  }
});

// ============================================================================
// @route   DELETE /api/promotion/admin/levels/:id
// @desc    Admin — delete a promotion level (only if no agents are using it)
// @access  Admin only
// ============================================================================
router.delete('/admin/levels/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const level = await PromotionLevel.findById(req.params.id);
    if (!level) return sendResponse(res, 404, { message: 'Promotion level not found' });

    // Check if any agents are currently at this level
    const agentCount = await User.countDocuments({
      role: 'agent',
      level: { $regex: new RegExp(`^${level.name}$`, 'i') },
      deletedAt: null
    });

    if (agentCount > 0) {
      return sendResponse(res, 400, {
        message: `Cannot delete: ${agentCount} agent(s) currently at this level. Reassign them first.`
      });
    }

    const deletedRank = level.rank;
    await level.deleteOne();

    // Shift ranks down to fill the gap
    await PromotionLevel.updateMany(
      { rank: { $gt: deletedRank } },
      { $inc: { rank: -1 } }
    );

    return sendResponse(res, 200, { message: 'Promotion level deleted.' });
  } catch (err) {
    return errorResponse(res, err);
  }
});

// ============================================================================
// @route   POST /api/promotion/check-advancement
// @desc    Check if the current user qualifies for advancement (called after
//          production status updates). Creates notification if threshold met.
// @access  Authenticated
// ============================================================================
router.post('/check-advancement', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).select('level name promotedAt').lean();
    if (!user) return errorResponse(res, new Error('User not found'), 404);

    const levels = await getSortedLevels();
    const userLevelLower = (user.level || '').toLowerCase();
    const currentIdx = levels.findIndex(l => l.name.toLowerCase() === userLevelLower);
    if (currentIdx < 0) {
      return sendResponse(res, 200, { eligible: false, message: 'Current level not found in promotion config.' });
    }
    if (currentIdx >= levels.length - 1) {
      return sendResponse(res, 200, { eligible: false, message: 'Already at maximum promotion level.' });
    }

    const next = levels[currentIdx + 1];
    const promotedAt = user.promotedAt || null;

    // Check Producer track
    const producerPremium = await sumQualifyingPremium([userId], next.producerWindowDays, promotedAt);
    const producerMet = producerPremium >= next.producerPremiumThreshold;

    // Check Builder track
    const downlineIds = await getDownlineIds(userId);
    const transferDates = await getTransferDatesForDownline(downlineIds);
    const builderPremium = await sumQualifyingPremium(downlineIds, next.builderWindowDays, promotedAt, transferDates);
    const activeAgents = await countProducingAgents(downlineIds, next.builderWindowDays, promotedAt, transferDates);
    const builderMet = builderPremium >= next.builderPremiumThreshold &&
                       activeAgents >= next.builderAgentCountThreshold;

    const eligible = producerMet || builderMet;

    if (eligible) {
      // Notify admin about the potential promotion
      const admins = await User.find({ role: 'admin' }).select('_id').lean();
      for (const admin of admins) {
        await Notification.createNotification({
          userId: admin._id,
          type: 'promotion_eligible',
          title: 'Agent Promotion Eligible',
          message: `${user.name} is eligible for promotion to ${next.name} (${next.commissionPercent}%).`,
          data: {
            agentId: userId,
            agentName: user.name,
            currentLevel: user.level,
            nextLevel: next.name,
            track: producerMet ? 'producer' : 'builder'
          },
          link: '/admin/user-management'
        });
      }
    }

    return sendResponse(res, 200, {
      eligible,
      currentLevel: user.level,
      nextLevel: next.name,
      producer: { premium: producerPremium, target: next.producerPremiumThreshold, met: producerMet },
      builder: { premium: builderPremium, target: next.builderPremiumThreshold, agents: activeAgents, targetAgents: next.builderAgentCountThreshold, met: builderMet }
    });
  } catch (err) {
    return errorResponse(res, err);
  }
});

module.exports = router;
module.exports.checkAndNotifyPromotion = checkAndNotifyPromotion;
module.exports.getUplineChainIds = getUplineChainIds;
