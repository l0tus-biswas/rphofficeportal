const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const PromotionLevel = require('../models/PromotionLevel');
const ProductionSubmission = require('../models/ProductionSubmission');
const IncomePaid = require('../models/IncomePaid');
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
// Helper: sum an agent's admin-approved Income Paid entries over a
// rolling window (or since a fixed date, e.g. promotedAt) — mirrors the
// sumQualifyingPremium cutoff pattern for consistency.
// ============================================================================
async function sumApprovedIncome(agentId, windowDays, sinceDate) {
  const baseCutoff = sinceDate ? new Date(sinceDate) : new Date();
  if (!sinceDate) {
    baseCutoff.setDate(baseCutoff.getDate() - windowDays);
  }

  const result = await IncomePaid.aggregate([
    {
      $match: {
        agent: new mongoose.Types.ObjectId(agentId),
        status: 'approved',
        datePaidByCarrier: { $gte: baseCutoff }
      }
    },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  return result.length > 0 ? result[0].total : 0;
}

// ============================================================================
// Helper: count downline members currently at or above a given rank number.
// "At or above" means someone further along the ladder also satisfies a
// lower-rank team-composition requirement (e.g. a Senior Advisor counts
// toward an "1 Advisor on your team" requirement).
// ============================================================================
async function countDownlineAtOrAboveRank(downlineIds, targetRank, rankByName) {
  if (!downlineIds || downlineIds.length === 0) return 0;
  const members = await User.find({ _id: { $in: downlineIds } }).select('level').lean();
  let count = 0;
  for (const m of members) {
    const r = rankByName.get((m.level || '').toLowerCase());
    if (r != null && r >= targetRank) count++;
  }
  return count;
}

// ============================================================================
// Helper: evaluate a level's builderRequiredRanks (OR across alternatives).
// Returns { met, details } where details describes each alternative's
// current count vs. required count, for display on the tracker.
// ============================================================================
async function evaluateBuilderRankRequirement(requiredRanks, downlineIds, rankByName) {
  if (!requiredRanks || requiredRanks.length === 0) {
    return { met: true, details: [] };
  }
  const details = [];
  let met = false;
  for (const req of requiredRanks) {
    const targetRank = rankByName.get((req.rank || '').toLowerCase());
    const count = targetRank != null
      ? await countDownlineAtOrAboveRank(downlineIds, targetRank, rankByName)
      : 0;
    const alternativeMet = targetRank != null && count >= req.count;
    if (alternativeMet) met = true;
    details.push({ rank: req.rank, requiredCount: req.count, currentCount: count, met: alternativeMet });
  }
  return { met, details };
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
// Helper: evaluate both Producer and Builder tracks for an agent against a
// target level. Single source of truth used by the tracker, the manual
// check-advancement endpoint, and the auto-notify hook so all three agree.
// ============================================================================
async function evaluateTracks(agentId, next, promotedAt, rankByName) {
  // ---- Producer track: personal premium + personal income ----
  const producerPremium = await sumQualifyingPremium([agentId], next.producerWindowDays, promotedAt);
  const producerPremiumMet = next.producerPremiumThreshold > 0
    ? producerPremium >= next.producerPremiumThreshold
    : true;

  let producerIncome = 0;
  let producerIncomeMet = true;
  if (next.producerIncomeThreshold > 0) {
    producerIncome = await sumApprovedIncome(agentId, next.producerIncomeWindowDays, promotedAt);
    producerIncomeMet = producerIncome >= next.producerIncomeThreshold;
  }
  const producerMet = producerPremiumMet && producerIncomeMet;

  // ---- Builder track: team premium + team rank composition + personal income ----
  const downlineIds = await getDownlineIds(agentId);
  const transferDates = await getTransferDatesForDownline(downlineIds);
  const builderPremium = await sumQualifyingPremium(downlineIds, next.builderWindowDays, promotedAt, transferDates);
  const builderPremiumMet = next.builderPremiumThreshold > 0
    ? builderPremium >= next.builderPremiumThreshold
    : true;

  let activeAgents = 0;
  let rankMet = true;
  let rankDetails = [];
  if (next.builderRequiredRanks && next.builderRequiredRanks.length > 0) {
    const rankEval = await evaluateBuilderRankRequirement(next.builderRequiredRanks, downlineIds, rankByName);
    rankMet = rankEval.met;
    rankDetails = rankEval.details;
  } else if (next.builderAgentCountThreshold > 0) {
    activeAgents = await countProducingAgents(downlineIds, next.builderWindowDays, promotedAt, transferDates);
    rankMet = activeAgents >= next.builderAgentCountThreshold;
  }

  let builderIncome = 0;
  let builderIncomeMet = true;
  if (next.builderIncomeThreshold > 0) {
    builderIncome = await sumApprovedIncome(agentId, next.builderIncomeWindowDays, promotedAt);
    builderIncomeMet = builderIncome >= next.builderIncomeThreshold;
  }

  const builderMet = builderPremiumMet && rankMet && builderIncomeMet;

  return {
    downlineIds,
    producerMet, producerPremium, producerIncome, producerPremiumMet, producerIncomeMet,
    builderMet, builderPremium, activeAgents, builderIncome, rankDetails,
    builderPremiumMet, rankMet, builderIncomeMet
  };
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
    const rankByName = new Map(levels.map(l => [l.name.toLowerCase(), l.rank]));

    const { producerMet, builderMet } = await evaluateTracks(agentId, next, promotedAt, rankByName);

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

    const rankByName = new Map(levels.map(l => [l.name.toLowerCase(), l.rank]));
    const relevantLevel = next || current; // the level whose thresholds are being displayed

    // ---- Producer Track ----
    const producerWindow = windowParam || relevantLevel.producerWindowDays;
    const producerPremium = await sumQualifyingPremium([userId], producerWindow, promotedAt);
    const producerTarget = relevantLevel.producerPremiumThreshold;
    const producerProgress = producerTarget > 0
      ? Math.min(Math.round((producerPremium / producerTarget) * 100), 100)
      : 100;

    const producerIncomeWindow = windowParam || relevantLevel.producerIncomeWindowDays;
    const producerIncomeTarget = relevantLevel.producerIncomeThreshold || 0;
    const producerIncome = producerIncomeTarget > 0
      ? await sumApprovedIncome(userId, producerIncomeWindow, promotedAt)
      : 0;
    const producerIncomeProgress = producerIncomeTarget > 0
      ? Math.min(Math.round((producerIncome / producerIncomeTarget) * 100), 100)
      : 100;

    // ---- Builder Track ----
    const downlineIds = await getDownlineIds(userId);
    const builderWindow = windowParam || relevantLevel.builderWindowDays;
    // Get transfer dates for downline agents to ensure only post-transfer production counts
    const transferDates = await getTransferDatesForDownline(downlineIds);
    const builderPremium = await sumQualifyingPremium(downlineIds, builderWindow, promotedAt, transferDates);
    const builderTarget = relevantLevel.builderPremiumThreshold;
    const builderProgress = builderTarget > 0
      ? Math.min(Math.round((builderPremium / builderTarget) * 100), 100)
      : 100;

    const builderRequiredRanks = relevantLevel.builderRequiredRanks || [];
    let activeAgents = 0;
    let targetAgentCount = 0;
    let agentProgress = 100;
    let rankRequirement = { met: true, details: [] };
    if (builderRequiredRanks.length > 0) {
      rankRequirement = await evaluateBuilderRankRequirement(builderRequiredRanks, downlineIds, rankByName);
      agentProgress = rankRequirement.met ? 100 : Math.min(
        Math.round(Math.max(...rankRequirement.details.map(d => d.requiredCount > 0 ? (d.currentCount / d.requiredCount) * 100 : 100), 0)),
        100
      );
    } else {
      targetAgentCount = relevantLevel.builderAgentCountThreshold || 0;
      activeAgents = await countProducingAgents(downlineIds, builderWindow, promotedAt, transferDates);
      agentProgress = targetAgentCount > 0
        ? Math.min(Math.round((activeAgents / targetAgentCount) * 100), 100)
        : 100;
    }

    const builderIncomeWindow = windowParam || relevantLevel.builderIncomeWindowDays;
    const builderIncomeTarget = relevantLevel.builderIncomeThreshold || 0;
    const builderIncome = builderIncomeTarget > 0
      ? await sumApprovedIncome(userId, builderIncomeWindow, promotedAt)
      : 0;
    const builderIncomeProgress = builderIncomeTarget > 0
      ? Math.min(Math.round((builderIncome / builderIncomeTarget) * 100), 100)
      : 100;

    // Combined builder progress = ALL configured conditions must be met
    const builderOverallProgress = Math.min(builderProgress, agentProgress, builderIncomeProgress);

    // ---- Promotion eligibility (always evaluated against the level's own configured windows) ----
    const trackResult = next
      ? await evaluateTracks(userId, next, promotedAt, rankByName)
      : { producerMet: false, builderMet: false };
    const producerMet = trackResult.producerMet;
    const builderMet = trackResult.builderMet;
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
        windowDays: producerWindow,
        income: producerIncome,
        targetIncome: producerIncomeTarget,
        incomeProgress: producerIncomeProgress,
        incomeWindowDays: producerIncomeWindow
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
        windowDays: builderWindow,
        requiredRanks: rankRequirement.details,
        rankRequirementMet: rankRequirement.met,
        income: builderIncome,
        targetIncome: builderIncomeTarget,
        incomeProgress: builderIncomeProgress,
        incomeWindowDays: builderIncomeWindow
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
      'producerIncomeThreshold', 'producerIncomeWindowDays',
      'builderPremiumThreshold', 'builderAgentCountThreshold', 'builderWindowDays',
      'builderRequiredRanks', 'builderIncomeThreshold', 'builderIncomeWindowDays',
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
            producerIncomeThreshold, producerIncomeWindowDays,
            builderPremiumThreshold, builderAgentCountThreshold, builderWindowDays,
            builderRequiredRanks, builderIncomeThreshold, builderIncomeWindowDays,
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
      producerIncomeThreshold: producerIncomeThreshold || 0,
      producerIncomeWindowDays: producerIncomeWindowDays || 180,
      builderPremiumThreshold: builderPremiumThreshold || 0,
      builderAgentCountThreshold: builderAgentCountThreshold || 0,
      builderWindowDays: builderWindowDays || 60,
      builderRequiredRanks: builderRequiredRanks || [],
      builderIncomeThreshold: builderIncomeThreshold || 0,
      builderIncomeWindowDays: builderIncomeWindowDays || 180,
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
    const rankByName = new Map(levels.map(l => [l.name.toLowerCase(), l.rank]));

    const {
      producerMet, producerPremium, producerIncome,
      builderMet, builderPremium, activeAgents, builderIncome, rankDetails
    } = await evaluateTracks(userId, next, promotedAt, rankByName);

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
      producer: {
        premium: producerPremium, target: next.producerPremiumThreshold,
        income: producerIncome, targetIncome: next.producerIncomeThreshold,
        met: producerMet
      },
      builder: {
        premium: builderPremium, target: next.builderPremiumThreshold,
        agents: activeAgents, targetAgents: next.builderAgentCountThreshold,
        requiredRanks: rankDetails, income: builderIncome, targetIncome: next.builderIncomeThreshold,
        met: builderMet
      }
    });
  } catch (err) {
    return errorResponse(res, err);
  }
});

module.exports = router;
module.exports.checkAndNotifyPromotion = checkAndNotifyPromotion;
module.exports.getUplineChainIds = getUplineChainIds;
// Exported for unit testing — pure(ish) calculation helpers
module.exports.sumApprovedIncome = sumApprovedIncome;
module.exports.countDownlineAtOrAboveRank = countDownlineAtOrAboveRank;
module.exports.evaluateBuilderRankRequirement = evaluateBuilderRankRequirement;
module.exports.evaluateTracks = evaluateTracks;
