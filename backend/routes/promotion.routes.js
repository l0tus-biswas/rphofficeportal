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
// ============================================================================
const QUALIFYING_CATEGORIES = ['Life Insurance', 'Supplemental Insurance', 'Retirement / Annuities'];

// ============================================================================
// Helper: get all promotion levels sorted by rank
// ============================================================================
async function getSortedLevels() {
  return PromotionLevel.find({ isActive: true }).sort({ rank: 1 }).lean();
}

// ============================================================================
// Helper: compute premium for a set of agent IDs within a rolling window
// ============================================================================
async function sumQualifyingPremium(agentIds, windowDays) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);

  const result = await ProductionSubmission.aggregate([
    {
      $match: {
        agent: { $in: agentIds.map(id => new mongoose.Types.ObjectId(id)) },
        status: 'In Force',
        productCategory: { $in: QUALIFYING_CATEGORIES },
        submissionDate: { $gte: cutoff }
      }
    },
    { $group: { _id: null, total: { $sum: '$premiumAmount' } } }
  ]);
  return result.length > 0 ? result[0].total : 0;
}

// ============================================================================
// Helper: count distinct producing agents within a rolling window
// ============================================================================
async function countProducingAgents(agentIds, windowDays) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);

  const result = await ProductionSubmission.aggregate([
    {
      $match: {
        agent: { $in: agentIds.map(id => new mongoose.Types.ObjectId(id)) },
        status: 'In Force',
        productCategory: { $in: QUALIFYING_CATEGORIES },
        submissionDate: { $gte: cutoff }
      }
    },
    { $group: { _id: '$agent' } }
  ]);
  return result.length;
}

// ============================================================================
// @route   GET /api/promotion/tracker
// @desc    Dashboard promotion tracker — Producer + Builder tracks
// @access  Authenticated (any agent or admin)
// ============================================================================
router.get('/tracker', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).select('level').lean();
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

    // ---- Producer Track ----
    const producerWindow = windowParam || (next ? next.producerWindowDays : current.producerWindowDays);
    const producerPremium = await sumQualifyingPremium([userId], producerWindow);
    const producerTarget = next ? next.producerPremiumThreshold : current.producerPremiumThreshold;
    const producerProgress = producerTarget > 0
      ? Math.min(Math.round((producerPremium / producerTarget) * 100), 100)
      : 100;

    // ---- Builder Track ----
    const downlineIds = await getDownlineIds(userId);
    const builderWindow = windowParam || (next ? next.builderWindowDays : current.builderWindowDays);
    const builderPremium = await sumQualifyingPremium(downlineIds, builderWindow);
    const builderTarget = next ? next.builderPremiumThreshold : current.builderPremiumThreshold;
    const builderProgress = builderTarget > 0
      ? Math.min(Math.round((builderPremium / builderTarget) * 100), 100)
      : 100;

    const activeAgents = await countProducingAgents(downlineIds, builderWindow);
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

    // Auto-notify admins when eligible (deduplicate: skip if already notified in past 7 days)
    if (promotionReady && next) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const recentNotif = await Notification.findOne({
        type: 'promotion_eligible',
        'data.agentId': String(userId),
        'data.nextLevel': next.name,
        createdAt: { $gte: sevenDaysAgo }
      }).lean();
      if (!recentNotif) {
        const fullUser = await User.findById(userId).select('name').lean();
        const admins = await User.find({ role: 'admin' }).select('_id').lean();
        const track = producerMet ? 'producer' : 'builder';
        for (const admin of admins) {
          await Notification.createNotification({
            userId:  admin._id,
            type:    'promotion_eligible',
            title:   'Agent Promotion Eligible',
            message: `${fullUser.name} has met the ${track} track threshold and is ready to be promoted to ${next.name} (${next.commissionPercent}%).`,
            data:    { agentId: String(userId), agentName: fullUser.name, currentLevel: current.name, nextLevel: next.name, track },
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
      } : { canSkip: false }
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
// @route   PUT /api/promotion/admin/levels/:id
// @desc    Admin — update a promotion level's thresholds
// @access  Admin only
// ============================================================================
router.put('/admin/levels/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const allowed = [
      'commissionPercent',
      'producerPremiumThreshold', 'producerWindowDays',
      'builderPremiumThreshold', 'builderAgentCountThreshold', 'builderWindowDays',
      'canSkipTo', 'skipRequirements', 'isActive'
    ];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
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
// @route   POST /api/promotion/check-advancement
// @desc    Check if the current user qualifies for advancement (called after
//          production status updates). Creates notification if threshold met.
// @access  Authenticated
// ============================================================================
router.post('/check-advancement', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).select('level name').lean();
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

    // Check Producer track
    const producerPremium = await sumQualifyingPremium([userId], next.producerWindowDays);
    const producerMet = producerPremium >= next.producerPremiumThreshold;

    // Check Builder track
    const downlineIds = await getDownlineIds(userId);
    const builderPremium = await sumQualifyingPremium(downlineIds, next.builderWindowDays);
    const activeAgents = await countProducingAgents(downlineIds, next.builderWindowDays);
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
