const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { parse } = require('csv-parse/sync');
const User = require('../models/User');
const ACAClientRecord = require('../models/ACAClientRecord');
const ProductionSubmission = require('../models/ProductionSubmission');
const { protect: authenticate, authorize } = require('../middleware/auth.middleware');
const { sendResponse, errorResponse, getDownlineIds } = require('../utils/helpers');

// ---------------------------------------------------------------------------
// Multer — in-memory CSV storage (no files saved to disk)
// ---------------------------------------------------------------------------
const csvUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5 MB
});

// ---------------------------------------------------------------------------
// Tier calculation
// ---------------------------------------------------------------------------
function calcTier(count) {
  if (count >= 3000) return { tier: 3, label: 'Tier 3', rate: 3, bonus: count * 3 };
  if (count >= 2000) return { tier: 2, label: 'Tier 2', rate: 2, bonus: count * 2 };
  if (count >= 1000) return { tier: 1, label: 'Tier 1', rate: 1, bonus: count * 1 };
  return { tier: 0, label: 'Tier 0', rate: 0, bonus: 0 };
}

const TIER_THRESHOLDS = [0, 1000, 2000, 3000];

// ---------------------------------------------------------------------------
// Helper: normalize CSV header names
// ---------------------------------------------------------------------------
function normalizeHeader(h) {
  return h.trim().toLowerCase().replace(/[\s_-]+/g, '_');
}

// ---------------------------------------------------------------------------
// @route   POST /api/admin/aca-clients/upload
// @desc    Upload client-level ACA CSV; groups by agent, sums household_size
// @access  Admin only
//
// Expected CSV columns (in order):
//   first_name, last_name, issuer, agent, household_size
// ---------------------------------------------------------------------------
router.post('/admin/aca-clients/upload', authenticate, authorize('admin'), csvUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return sendResponse(res, 400, { message: 'No CSV file provided. Send file in field "file".' });
    }

    // Parse the CSV
    let rows;
    try {
      rows = parse(req.file.buffer.toString('utf-8'), {
        columns: (headers) => headers.map(normalizeHeader),
        skip_empty_lines: true,
        trim: true
      });
    } catch (parseErr) {
      return sendResponse(res, 422, { message: `CSV parse error: ${parseErr.message}` });
    }

    if (!rows || rows.length === 0) {
      return sendResponse(res, 422, { message: 'CSV file is empty or has no data rows.' });
    }

    // Determine upload batch: use param, body field, or default to current YYYY-MM
    let uploadBatch = (req.body && req.body.uploadBatch) || req.query.uploadBatch;
    if (!uploadBatch) {
      const now = new Date();
      uploadBatch = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    // ------------------------------------------------------------------
    // Step 1 — Group client rows by agent name, summing household_size
    // Each CSV row = one client policy. household_size = covered members.
    // ------------------------------------------------------------------
    const agentTotals = new Map(); // agentName (lowercase) → { displayName, householdSize, rowCount }

    const invalidRows = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const agentName = row.agent ? String(row.agent).trim() : null;

      if (!agentName) {
        invalidRows.push({ rowIndex: i + 2, ...row, reason: 'Missing "agent" column value' });
        continue;
      }

      const householdSizeRaw = row.household_size;
      const householdSize = householdSizeRaw !== undefined && householdSizeRaw !== ''
        ? parseInt(String(householdSizeRaw).trim(), 10)
        : 1; // default 1 member if blank

      if (isNaN(householdSize) || householdSize < 0) {
        invalidRows.push({ rowIndex: i + 2, ...row, reason: `Invalid household_size: "${householdSizeRaw}"` });
        continue;
      }

      const key = agentName.toLowerCase();
      if (agentTotals.has(key)) {
        const existing = agentTotals.get(key);
        existing.householdSize += householdSize;
        existing.rowCount += 1;
      } else {
        agentTotals.set(key, { displayName: agentName, householdSize, rowCount: 1 });
      }
    }

    // ------------------------------------------------------------------
    // Step 2 — Match each agent group to a User record and upsert
    // ------------------------------------------------------------------
    const matched = [];
    const unmatched = [...invalidRows]; // invalid rows are always unmatched
    const errors = [];

    for (const [, { displayName, householdSize }] of agentTotals) {
      // Match by exact name (case-insensitive), role=agent
      let agentDoc = await User.findOne({
        name: { $regex: new RegExp(`^${displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        role: 'agent'
      }).select('_id email name').lean();

      // Fallback: partial match on first+last name
      if (!agentDoc) {
        const parts = displayName.split(/\s+/);
        if (parts.length >= 2) {
          agentDoc = await User.findOne({
            name: { $regex: new RegExp(parts.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*'), 'i') },
            role: 'agent'
          }).select('_id email name').lean();
        }
      }

      if (!agentDoc) {
        unmatched.push({
          agentName: displayName,
          householdSize,
          reason: 'Agent not found in system'
        });
        continue;
      }

      try {
        await ACAClientRecord.findOneAndUpdate(
          { agent: agentDoc._id, uploadBatch },
          {
            agent: agentDoc._id,
            agentName: agentDoc.name,
            agentEmail: agentDoc.email,
            clientCount: householdSize,
            isProducing: householdSize > 0,
            uploadBatch,
            uploadedBy: req.user._id,
            uploadedAt: new Date(),
            source: 'csv'
          },
          { upsert: true, new: true }
        );
        matched.push({
          agentId: agentDoc._id,
          agentName: agentDoc.name,
          agentEmail: agentDoc.email,
          clientCount: householdSize,
          batch: uploadBatch
        });
      } catch (upsertErr) {
        errors.push({ agentName: displayName, householdSize, error: upsertErr.message });
      }
    }

    return sendResponse(res, 200, {
      message: `Upload complete. ${matched.length} agents matched, ${unmatched.length} unmatched.`,
      totalClientRows: rows.length,
      agentGroupsFound: agentTotals.size,
      uploadBatch,
      matched: matched.length,
      unmatchedCount: unmatched.length,
      unmatched,
      errors
    });
  } catch (err) {
    return errorResponse(res, err);
  }
});

// ---------------------------------------------------------------------------
// @route   GET /api/admin/aca-clients/batches
// @desc    List all upload batches with summary stats
// @access  Admin only
// ---------------------------------------------------------------------------
router.get('/admin/aca-clients/batches', authenticate, authorize('admin'), async (req, res) => {
  try {
    const batches = await ACAClientRecord.aggregate([
      {
        $group: {
          _id: '$uploadBatch',
          agentCount: { $sum: 1 },
          totalClients: { $sum: '$clientCount' },
          totalVerifiedPremium: { $sum: '$verifiedPremium' },
          producingAgents: {
            $sum: { $cond: [{ $eq: ['$isProducing', true] }, 1, 0] }
          },
          uploadedAt: { $max: '$uploadedAt' },
          uploadedBy: { $last: '$uploadedBy' }
        }
      },
      { $sort: { _id: -1 } },
      { $limit: 24 }
    ]);

    return sendResponse(res, 200, { batches });
  } catch (err) {
    return errorResponse(res, err);
  }
});

// ---------------------------------------------------------------------------
// @route   GET /api/admin/aca-clients/records
// @desc    List individual records for a given batch (admin)
// @access  Admin only
// ---------------------------------------------------------------------------
router.get('/admin/aca-clients/records', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { batch } = req.query;
    const query = batch ? { uploadBatch: batch } : {};
    const records = await ACAClientRecord.find(query)
      .populate('agent', 'name email')
      .sort({ agentName: 1 })
      .lean();
    return sendResponse(res, 200, { records });
  } catch (err) {
    return errorResponse(res, err);
  }
});

// ---------------------------------------------------------------------------
// @route   GET /api/dashboard/aca-tracker
// @desc    Agent + admin: Reported vs Verified ACA tracker
//          Reported  = self-reported from ProductionSubmission (ACA / Health Insurance, In Force)
//          Verified  = carrier-verified from ACAClientRecord (admin CSV upload)
// @access  Authenticated (agent or admin)
// ---------------------------------------------------------------------------
router.get('/dashboard/aca-tracker', authenticate, async (req, res) => {
  try {
    const downlineIds = await getDownlineIds(req.user._id);
    const teamIds = [req.user._id, ...downlineIds];

    // ── REPORTED (from ProductionSubmission) ─────────────────────────
    // ACA = 'Health Insurance' category, status 'In Force'
    const reportedAgg = await ProductionSubmission.aggregate([
      {
        $match: {
          agent: { $in: teamIds },
          productCategory: 'Health Insurance',
          status: 'In Force'
        }
      },
      {
        $group: {
          _id: null,
          reportedClientCount: { $sum: 1 },
          reportedPremium: { $sum: '$premiumAmount' },
          producingAgents: { $addToSet: '$agent' }
        }
      }
    ]);

    const reportedClientCount = reportedAgg.length > 0 ? reportedAgg[0].reportedClientCount : 0;
    const reportedPremium = reportedAgg.length > 0 ? reportedAgg[0].reportedPremium : 0;
    const reportedProducingAgents = reportedAgg.length > 0 ? reportedAgg[0].producingAgents.length : 0;

    // ── VERIFIED (from ACAClientRecord — latest batch) ───────────────
    const latestBatchDoc = await ACAClientRecord.findOne(
      { agent: { $in: teamIds } },
      { uploadBatch: 1, uploadedAt: 1 }
    ).sort({ uploadedAt: -1 }).lean();

    let verifiedClientCount = 0;
    let verifiedPremium = 0;
    let verifiedProducingAgents = 0;
    let uploadBatch = null;
    let uploadedAt = null;

    if (latestBatchDoc) {
      uploadBatch = latestBatchDoc.uploadBatch;

      const verifiedAgg = await ACAClientRecord.aggregate([
        { $match: { agent: { $in: teamIds }, uploadBatch } },
        {
          $group: {
            _id: null,
            totalClients: { $sum: '$clientCount' },
            totalPremium: { $sum: '$verifiedPremium' },
            producingCount: {
              $sum: { $cond: [{ $eq: ['$isProducing', true] }, 1, 0] }
            },
            uploadedAt: { $max: '$uploadedAt' }
          }
        }
      ]);

      if (verifiedAgg.length > 0) {
        verifiedClientCount = verifiedAgg[0].totalClients;
        verifiedPremium = verifiedAgg[0].totalPremium;
        verifiedProducingAgents = verifiedAgg[0].producingCount;
        uploadedAt = verifiedAgg[0].uploadedAt;
      }
    }

    const hasData = reportedClientCount > 0 || verifiedClientCount > 0;

    // Tier is based on verified count
    const tierInfo = calcTier(verifiedClientCount);
    const nextTier = tierInfo.tier < 3 ? tierInfo.tier + 1 : 3;
    const nextTierThreshold = TIER_THRESHOLDS[nextTier] || TIER_THRESHOLDS[3];
    const currentThreshold = TIER_THRESHOLDS[tierInfo.tier];

    let progressPercent;
    if (tierInfo.tier >= 3) {
      progressPercent = 100;
    } else {
      const bandSize = nextTierThreshold - currentThreshold;
      const inBand = verifiedClientCount - currentThreshold;
      progressPercent = Math.min(100, Math.round((inBand / bandSize) * 100));
    }

    return sendResponse(res, 200, {
      hasData,
      // Reported (self-reported from production submissions)
      reportedClientCount,
      reportedPremium,
      reportedProducingAgents,
      // Verified (carrier-verified from admin CSV)
      verifiedClientCount,
      verifiedPremium,
      verifiedProducingAgents,
      // Tier info (based on verified)
      currentTier: tierInfo.tier,
      currentTierLabel: tierInfo.label,
      bonusRate: tierInfo.rate,
      bonusAmount: tierInfo.bonus,
      progressPercent,
      tierThreshold: currentThreshold,
      nextTierThreshold,
      // Batch info
      uploadBatch,
      uploadedAt
    });
  } catch (err) {
    return errorResponse(res, err);
  }
});

// ---------------------------------------------------------------------------
// @route   GET /api/admin/aca-clients/sample-csv
// @desc    Download the sample ACA CSV template
// @access  Admin only
// ---------------------------------------------------------------------------
router.get('/admin/aca-clients/sample-csv', authenticate, authorize('admin'), (req, res) => {
  const filePath = path.join(__dirname, '../uploads/aca-sample.csv');
  res.download(filePath, 'aca-sample.csv', (err) => {
    if (err) {
      return errorResponse(res, err);
    }
  });
});

module.exports = router;
