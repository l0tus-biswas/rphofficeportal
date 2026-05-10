const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const { parse } = require('csv-parse/sync');
const XLSX = require('xlsx');
const User = require('../models/User');
const ACAClientRecord = require('../models/ACAClientRecord');
const AcaTierConfig = require('../models/AcaTierConfig');
const ProductionSubmission = require('../models/ProductionSubmission');
const { protect: authenticate, authorize } = require('../middleware/auth.middleware');
const { sendResponse, errorResponse, getDownlineIds } = require('../utils/helpers');

// ---------------------------------------------------------------------------
// Multer — in-memory storage for CSV + XLSX (5.1: Excel support, 5.2: multi-file)
// ---------------------------------------------------------------------------
const fileUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowed = [
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(file.mimetype) || ['.csv', '.xlsx', '.xls'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and Excel (.xlsx/.xls) files are allowed'), false);
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB per file
});

// ---------------------------------------------------------------------------
// Helper: parse any uploaded file buffer → array of row objects
// Supports CSV and XLSX (5.1)
// ---------------------------------------------------------------------------
function parseFileToRows(buffer, originalname) {
  const ext = path.extname(originalname).toLowerCase();
  if (ext === '.xlsx' || ext === '.xls') {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error('Excel file has no sheets.');
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
    // Normalize headers
    return rows.map(row => {
      const normalized = {};
      for (const key of Object.keys(row)) {
        normalized[normalizeHeader(key)] = row[key];
      }
      return normalized;
    });
  }
  // Default: CSV
  return parse(buffer.toString('utf-8'), {
    columns: (headers) => headers.map(normalizeHeader),
    skip_empty_lines: true,
    trim: true
  });
}

// ---------------------------------------------------------------------------
// Helper: normalize CSV header names
// ---------------------------------------------------------------------------
function normalizeHeader(h) {
  return h.trim().toLowerCase().replace(/[\s_-]+/g, '_');
}

// ---------------------------------------------------------------------------
// @route   POST /api/admin/aca-clients/upload
// @desc    Upload ACA client CSV/XLSX (single or multi-file); groups by agent
// @access  Admin only
//
// Supports: CSV and Excel (.xlsx/.xls) — 5.1
// Multi-file: send multiple files in field "files" — 5.2
// Replace batch: set body.replaceBatch = "true" to clear previous data — 5.7
//
// Expected columns: first_name, last_name, issuer, agent, household_size
// ---------------------------------------------------------------------------
router.post('/admin/aca-clients/upload', authenticate, authorize('admin'), fileUpload.fields([
  { name: 'files', maxCount: 10 },
  { name: 'file', maxCount: 1 }
]), async (req, res) => {
  try {
    // Support both 'files' (new multi-file) and 'file' (legacy single-file) field names
    const filesArr = (req.files && req.files['files']) || [];
    const fileArr = (req.files && req.files['file']) || [];
    const files = [...filesArr, ...fileArr];
    if (files.length === 0) {
      return sendResponse(res, 400, { message: 'No file provided. Send CSV or Excel file(s) in field "files".' });
    }

    // Determine upload batch: use body field, query, or default to current YYYY-MM
    let uploadBatch = (req.body && req.body.uploadBatch) || req.query.uploadBatch;
    if (!uploadBatch) {
      const now = new Date();
      uploadBatch = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    // 5.7: Replace batch — delete all existing records for this batch before inserting
    const replaceBatch = req.body && (req.body.replaceBatch === 'true' || req.body.replaceBatch === true);
    if (replaceBatch) {
      await ACAClientRecord.deleteMany({ uploadBatch });
    }

    // ------------------------------------------------------------------
    // Step 1 — Parse all files and merge rows
    // ------------------------------------------------------------------
    let allRows = [];
    const fileResults = []; // per-file parse info
    const parseErrors = [];

    for (const file of files) {
      try {
        const rows = parseFileToRows(file.buffer, file.originalname);
        if (!rows || rows.length === 0) {
          parseErrors.push({ file: file.originalname, reason: 'File is empty or has no data rows.' });
          continue;
        }
        fileResults.push({ file: file.originalname, rowCount: rows.length });
        allRows = allRows.concat(rows.map((r, idx) => ({ ...r, _sourceFile: file.originalname, _sourceRow: idx + 2 })));
      } catch (parseErr) {
        parseErrors.push({ file: file.originalname, reason: `Parse error: ${parseErr.message}` });
      }
    }

    if (allRows.length === 0 && parseErrors.length > 0) {
      return sendResponse(res, 422, {
        message: 'All files failed to parse.',
        parseErrors
      });
    }

    // ------------------------------------------------------------------
    // Step 2 — Group client rows by agent name, summing household_size
    // ------------------------------------------------------------------
    const agentTotals = new Map();
    const invalidRows = [];

    for (let i = 0; i < allRows.length; i++) {
      const row = allRows[i];
      const agentName = row.agent ? String(row.agent).trim() : null;

      if (!agentName) {
        invalidRows.push({
          rowIndex: row._sourceRow,
          sourceFile: row._sourceFile,
          firstName: row.first_name || '',
          lastName: row.last_name || '',
          reason: 'Missing "agent" column value'
        });
        continue;
      }

      const householdSizeRaw = row.household_size;
      const householdSize = householdSizeRaw !== undefined && householdSizeRaw !== ''
        ? parseInt(String(householdSizeRaw).trim(), 10)
        : 1;

      if (isNaN(householdSize) || householdSize < 0) {
        invalidRows.push({
          rowIndex: row._sourceRow,
          sourceFile: row._sourceFile,
          agentName,
          reason: `Invalid household_size: "${householdSizeRaw}"`
        });
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
    // Step 3 — Match agents to User records and upsert (5.8: detailed errors)
    // ------------------------------------------------------------------
    const matched = [];
    const unmatched = [];
    const errors = [];

    for (const [, { displayName, householdSize, rowCount }] of agentTotals) {
      let agentDoc = await User.findOne({
        name: { $regex: new RegExp(`^${displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        role: 'agent'
      }).select('_id email name').lean();

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
          rowCount,
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
            source: files.length === 1 ? path.extname(files[0].originalname).replace('.', '') : 'multi'
          },
          { upsert: true, new: true }
        );
        matched.push({
          agentId: agentDoc._id,
          agentName: agentDoc.name,
          agentEmail: agentDoc.email,
          clientCount: householdSize,
          rowCount,
          batch: uploadBatch
        });
      } catch (upsertErr) {
        errors.push({ agentName: displayName, householdSize, error: upsertErr.message });
      }
    }

    return sendResponse(res, 200, {
      message: `Upload complete. ${matched.length} agents matched, ${unmatched.length} unmatched.`,
      totalClientRows: allRows.length,
      filesProcessed: fileResults.length,
      fileResults,
      agentGroupsFound: agentTotals.size,
      uploadBatch,
      replacedBatch: replaceBatch,
      matched: matched.length,
      matchedDetails: matched,
      unmatchedCount: unmatched.length,
      unmatched,
      invalidRows,
      errors,
      parseErrors
    });
  } catch (err) {
    return errorResponse(res, err);
  }
});

// ---------------------------------------------------------------------------
// @route   GET /api/admin/aca-clients/batches
// @desc    List all upload batches with summary stats (5.6: improved clarity)
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
          uploadedBy: { $last: '$uploadedBy' },
          source: { $last: '$source' }
        }
      },
      { $sort: { _id: -1 } },
      { $limit: 24 }
    ]);

    // Populate uploadedBy name
    const User = require('../models/User');
    for (const b of batches) {
      if (b.uploadedBy) {
        const u = await User.findById(b.uploadedBy).select('name').lean();
        b.uploadedByName = u ? u.name : 'Unknown';
      }
    }

    return sendResponse(res, 200, { batches });
  } catch (err) {
    return errorResponse(res, err);
  }
});

// ---------------------------------------------------------------------------
// @route   DELETE /api/admin/aca-clients/batches/:batch
// @desc    Delete all records for a given batch (5.3)
// @access  Admin only
// ---------------------------------------------------------------------------
router.delete('/admin/aca-clients/batches/:batch', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { batch } = req.params;
    if (!batch) {
      return sendResponse(res, 400, { message: 'Batch identifier is required.' });
    }
    const result = await ACAClientRecord.deleteMany({ uploadBatch: batch });
    return sendResponse(res, 200, {
      message: `Batch "${batch}" deleted. ${result.deletedCount} record(s) removed.`,
      deletedCount: result.deletedCount
    });
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
//          Fixed: separates personal vs team (5.9-5.10), configurable tiers (5.11-5.12)
//          Added: agent breakdown (5.14)
// @access  Authenticated (agent or admin)
// ---------------------------------------------------------------------------
router.get('/dashboard/aca-tracker', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;
    const downlineIds = await getDownlineIds(userId);
    const teamIds = [userId, ...downlineIds];

    // ── REPORTED (from ProductionSubmission) ─────────────────────────
    // Personal reported
    const personalReportedAgg = await ProductionSubmission.aggregate([
      {
        $match: {
          agent: userId,
          productCategory: 'Health Insurance',
          status: 'In Force'
        }
      },
      {
        $group: {
          _id: null,
          clientCount: { $sum: 1 },
          premium: { $sum: '$premiumAmount' }
        }
      }
    ]);

    // Team reported (downline only, excluding self)
    const teamReportedAgg = downlineIds.length > 0 ? await ProductionSubmission.aggregate([
      {
        $match: {
          agent: { $in: downlineIds },
          productCategory: 'Health Insurance',
          status: 'In Force'
        }
      },
      {
        $group: {
          _id: null,
          clientCount: { $sum: 1 },
          premium: { $sum: '$premiumAmount' },
          producingAgents: { $addToSet: '$agent' }
        }
      }
    ]) : [];

    const personalReportedClients = personalReportedAgg.length > 0 ? personalReportedAgg[0].clientCount : 0;
    const personalReportedPremium = personalReportedAgg.length > 0 ? personalReportedAgg[0].premium : 0;
    const teamReportedClients = teamReportedAgg.length > 0 ? teamReportedAgg[0].clientCount : 0;
    const teamReportedPremium = teamReportedAgg.length > 0 ? teamReportedAgg[0].premium : 0;
    const teamReportedProducingAgents = teamReportedAgg.length > 0 ? teamReportedAgg[0].producingAgents.length : 0;
    const totalReportedClients = personalReportedClients + teamReportedClients;
    const totalReportedPremium = personalReportedPremium + teamReportedPremium;

    // ── VERIFIED (from ACAClientRecord — latest batch) ───────────────
    const latestBatchDoc = await ACAClientRecord.findOne(
      { agent: { $in: teamIds } },
      { uploadBatch: 1, uploadedAt: 1 }
    ).sort({ uploadedAt: -1 }).lean();

    let personalVerifiedClients = 0;
    let personalVerifiedPremium = 0;
    let teamVerifiedClients = 0;
    let teamVerifiedPremium = 0;
    let teamVerifiedProducingAgents = 0;
    let uploadBatch = null;
    let uploadedAt = null;
    let agentBreakdown = []; // 5.14

    if (latestBatchDoc) {
      uploadBatch = latestBatchDoc.uploadBatch;

      // Personal verified
      const personalVerifiedAgg = await ACAClientRecord.aggregate([
        { $match: { agent: userId, uploadBatch } },
        {
          $group: {
            _id: null,
            totalClients: { $sum: '$clientCount' },
            totalPremium: { $sum: '$verifiedPremium' }
          }
        }
      ]);

      if (personalVerifiedAgg.length > 0) {
        personalVerifiedClients = personalVerifiedAgg[0].totalClients;
        personalVerifiedPremium = personalVerifiedAgg[0].totalPremium;
      }

      // Team verified (downline only, excluding self)
      if (downlineIds.length > 0) {
        const teamVerifiedAgg = await ACAClientRecord.aggregate([
          { $match: { agent: { $in: downlineIds }, uploadBatch } },
          {
            $group: {
              _id: null,
              totalClients: { $sum: '$clientCount' },
              totalPremium: { $sum: '$verifiedPremium' },
              producingCount: {
                $sum: { $cond: [{ $eq: ['$isProducing', true] }, 1, 0] }
              }
            }
          }
        ]);

        if (teamVerifiedAgg.length > 0) {
          teamVerifiedClients = teamVerifiedAgg[0].totalClients;
          teamVerifiedPremium = teamVerifiedAgg[0].totalPremium;
          teamVerifiedProducingAgents = teamVerifiedAgg[0].producingCount;
        }
      }

      uploadedAt = latestBatchDoc.uploadedAt;

      // 5.14: Agent breakdown — per-agent client counts for the team
      const breakdownRaw = await ACAClientRecord.find(
        { agent: { $in: teamIds }, uploadBatch }
      ).populate('agent', 'name email').lean();

      agentBreakdown = breakdownRaw.map(r => ({
        agentId: r.agent?._id || r.agent,
        agentName: r.agent?.name || r.agentName,
        agentEmail: r.agent?.email || r.agentEmail,
        clientCount: r.clientCount,
        isProducing: r.isProducing,
        isSelf: String(r.agent?._id || r.agent) === String(userId)
      })).sort((a, b) => b.clientCount - a.clientCount);
    }

    const totalVerifiedClients = personalVerifiedClients + teamVerifiedClients;
    const totalVerifiedPremium = personalVerifiedPremium + teamVerifiedPremium;
    const hasData = totalReportedClients > 0 || totalVerifiedClients > 0;

    // ── TOP 5 LEADERBOARDS (global, for agent visibility) ────────────
    let topPersonalACA = [];
    let topTeamACA = [];

    // Use global latest batch (not just agent's team batch)
    const globalLatestBatchDoc = await ACAClientRecord.findOne(
      {},
      { uploadBatch: 1 }
    ).sort({ uploadedAt: -1 }).lean();

    if (globalLatestBatchDoc) {
      const globalBatch = globalLatestBatchDoc.uploadBatch;

      // Top 5 personal (individual agent client count across entire org)
      topPersonalACA = await ACAClientRecord.aggregate([
        { $match: { uploadBatch: globalBatch } },
        { $sort: { clientCount: -1 } },
        { $limit: 5 },
        { $lookup: { from: 'users', localField: 'agent', foreignField: '_id', as: 'agentInfo' } },
        { $unwind: { path: '$agentInfo', preserveNullAndEmptyArrays: true } },
        { $project: { agentName: { $ifNull: ['$agentInfo.name', '$agentName'] }, clientCount: 1 } }
      ]);

      // Top 5 team (agent + their downline total)
      const allGlobalRecords = await ACAClientRecord.find({ uploadBatch: globalBatch }).lean();
      const allAgentsForTeam = await User.find({ role: 'agent' }).select('_id name referredBy').lean();
      const childrenMapGlobal = {};
      allAgentsForTeam.forEach(u => {
        const pid = u.referredBy?.toString();
        if (pid) {
          if (!childrenMapGlobal[pid]) childrenMapGlobal[pid] = [];
          childrenMapGlobal[pid].push(u._id.toString());
        }
      });
      const recordMapGlobal = {};
      allGlobalRecords.forEach(r => { recordMapGlobal[r.agent.toString()] = r.clientCount; });
      function sumTreeGlobal(id) {
        let total = recordMapGlobal[id] || 0;
        (childrenMapGlobal[id] || []).forEach(cid => { total += sumTreeGlobal(cid); });
        return total;
      }
      const teamTotalsGlobal = allAgentsForTeam.map(u => ({
        agentName: u.name, teamClientCount: sumTreeGlobal(u._id.toString())
      }));
      teamTotalsGlobal.sort((a, b) => b.teamClientCount - a.teamClientCount);
      topTeamACA = teamTotalsGlobal.slice(0, 5);
    }

    // ── TIERS — configurable (5.11-5.12) + per-agent (5.13) ──────────
    const tiers = await AcaTierConfig.getTiersForAgent(userId);
    const tierInfo = AcaTierConfig.calcTierFromList(totalVerifiedClients, tiers);

    // Sort tiers ascending by threshold for progress calculation
    const sortedTiers = [...tiers].sort((a, b) => a.threshold - b.threshold);
    const currentTierIdx = sortedTiers.findIndex(t => t.tier === tierInfo.tier);
    const nextTierEntry = sortedTiers[currentTierIdx + 1] || null;
    const currentThreshold = sortedTiers[currentTierIdx]?.threshold || 0;
    const nextTierThreshold = nextTierEntry ? nextTierEntry.threshold : currentThreshold;

    let progressPercent;
    if (!nextTierEntry) {
      progressPercent = 100; // max tier
    } else {
      const bandSize = nextTierThreshold - currentThreshold;
      const inBand = totalVerifiedClients - currentThreshold;
      progressPercent = bandSize > 0 ? Math.min(100, Math.round((inBand / bandSize) * 100)) : 100;
    }

    return sendResponse(res, 200, {
      hasData,
      // Personal (5.10)
      personalReportedClients,
      personalReportedPremium,
      personalVerifiedClients,
      personalVerifiedPremium,
      // Team (downline only) (5.9-5.10)
      teamReportedClients,
      teamReportedPremium,
      teamVerifiedClients,
      teamVerifiedPremium,
      teamVerifiedProducingAgents,
      teamReportedProducingAgents,
      // Combined totals
      totalReportedClients,
      totalReportedPremium,
      totalVerifiedClients,
      totalVerifiedPremium,
      // Tier info (based on total verified) (5.11-5.12)
      currentTier: tierInfo.tier,
      currentTierLabel: tierInfo.label,
      bonusRate: tierInfo.rate,
      bonusAmount: tierInfo.bonus,
      progressPercent,
      tierThreshold: currentThreshold,
      nextTierThreshold,
      isMaxTier: !nextTierEntry,
      allTiers: sortedTiers,
      // Batch info
      uploadBatch,
      uploadedAt,
      // Agent breakdown (5.14)
      agentBreakdown,
      teamSize: downlineIds.length,
      // Top 5 leaderboards (global)
      topPersonalACA,
      topTeamACA
    });
  } catch (err) {
    return errorResponse(res, err);
  }
});

// ---------------------------------------------------------------------------
// @route   GET /api/admin/aca-clients/sample-csv
// @desc    Download the sample ACA CSV template (5.4: fixed)
// @access  Admin only
// ---------------------------------------------------------------------------
router.get('/admin/aca-clients/sample-csv', authenticate, authorize('admin'), (req, res) => {
  const filePath = path.join(__dirname, '../uploads/aca-sample.csv');
  if (!fs.existsSync(filePath)) {
    return sendResponse(res, 404, { message: 'Sample CSV file not found on server. Please contact support.' });
  }
  res.download(filePath, 'aca-sample.csv', (err) => {
    if (err && !res.headersSent) {
      return sendResponse(res, 500, { message: 'Failed to download sample CSV.' });
    }
  });
});

// ---------------------------------------------------------------------------
// @route   GET /api/admin/aca-tiers
// @desc    Get the current global ACA tier configuration (5.12)
// @access  Admin only
// ---------------------------------------------------------------------------
router.get('/admin/aca-tiers', authenticate, authorize('admin'), async (req, res) => {
  try {
    const tiers = await AcaTierConfig.getTiersForAgent(null);
    const config = await AcaTierConfig.findOne({ agent: null }).lean();
    return sendResponse(res, 200, {
      tiers,
      updatedBy: config?.updatedBy || null,
      updatedAt: config?.updatedAt || null
    });
  } catch (err) {
    return errorResponse(res, err);
  }
});

// ---------------------------------------------------------------------------
// @route   PUT /api/admin/aca-tiers
// @desc    Update global ACA tier thresholds and rates (5.12)
// @access  Admin only
// ---------------------------------------------------------------------------
router.put('/admin/aca-tiers', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { tiers } = req.body;
    if (!Array.isArray(tiers) || tiers.length === 0) {
      return sendResponse(res, 400, { message: 'Provide a non-empty "tiers" array.' });
    }
    // Validate each tier entry
    for (const t of tiers) {
      if (typeof t.tier !== 'number' || typeof t.threshold !== 'number' || typeof t.rate !== 'number' || !t.label) {
        return sendResponse(res, 400, { message: 'Each tier must have: tier (number), label (string), threshold (number), rate (number).' });
      }
    }
    const config = await AcaTierConfig.findOneAndUpdate(
      { agent: null },
      { tiers, updatedBy: req.user._id, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    return sendResponse(res, 200, { message: 'Tier configuration updated.', tiers: config.tiers });
  } catch (err) {
    return errorResponse(res, err);
  }
});

// ---------------------------------------------------------------------------
// @route   GET /api/admin/aca-tiers/agent-overrides
// @desc    List all per-agent tier overrides (5.13)
// @access  Admin only
// ---------------------------------------------------------------------------
router.get('/admin/aca-tiers/agent-overrides', authenticate, authorize('admin'), async (req, res) => {
  try {
    const overrides = await AcaTierConfig.find({ agent: { $ne: null } })
      .populate('agent', 'name email referralCode')
      .lean();
    return sendResponse(res, 200, { overrides });
  } catch (err) {
    return errorResponse(res, err);
  }
});

// ---------------------------------------------------------------------------
// @route   GET /api/admin/aca-tiers/agents/search
// @desc    Search agents by name, email, or referralCode for override picker
// @access  Admin only
// ---------------------------------------------------------------------------
router.get('/admin/aca-tiers/agents/search', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || !q.trim()) {
      return sendResponse(res, 200, { agents: [] });
    }
    const escaped = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const filter = {
      role: 'agent',
      deletedAt: null,
      $or: [
        { name: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
        { referralCode: { $regex: escaped, $options: 'i' } }
      ]
    };
    const agents = await User.find(filter)
      .select('_id name email referralCode')
      .sort({ name: 1 })
      .limit(20)
      .lean();
    return sendResponse(res, 200, { agents });
  } catch (err) {
    return errorResponse(res, err);
  }
});

// ---------------------------------------------------------------------------
// @route   PUT /api/admin/aca-tiers/agent/:agentId
// @desc    Set or update per-agent tier override (5.13)
// @access  Admin only
// ---------------------------------------------------------------------------
router.put('/admin/aca-tiers/agent/:agentId', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { agentId } = req.params;
    const { tiers } = req.body;
    if (!Array.isArray(tiers) || tiers.length === 0) {
      return sendResponse(res, 400, { message: 'Provide a non-empty "tiers" array.' });
    }
    for (const t of tiers) {
      if (typeof t.tier !== 'number' || typeof t.threshold !== 'number' || typeof t.rate !== 'number' || !t.label) {
        return sendResponse(res, 400, { message: 'Each tier must have: tier, label, threshold, rate.' });
      }
    }
    // Resolve agent: accept ObjectId or referralCode
    let resolvedId = agentId;
    if (!mongoose.Types.ObjectId.isValid(agentId)) {
      const user = await User.findOne({ referralCode: { $regex: new RegExp(`^${agentId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } }).select('_id').lean();
      if (!user) {
        return sendResponse(res, 404, { message: 'Agent not found. Check the Agent ID or referral code.' });
      }
      resolvedId = user._id;
    } else {
      const exists = await User.exists({ _id: agentId, role: 'agent' });
      if (!exists) {
        return sendResponse(res, 404, { message: 'Agent not found with that ID.' });
      }
    }
    const config = await AcaTierConfig.findOneAndUpdate(
      { agent: resolvedId },
      { agent: resolvedId, tiers, updatedBy: req.user._id, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    return sendResponse(res, 200, { message: 'Agent tier override saved.', config });
  } catch (err) {
    return errorResponse(res, err);
  }
});

// ---------------------------------------------------------------------------
// @route   DELETE /api/admin/aca-tiers/agent/:agentId
// @desc    Remove per-agent tier override (revert to global) (5.13)
// @access  Admin only
// ---------------------------------------------------------------------------
router.delete('/admin/aca-tiers/agent/:agentId', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { agentId } = req.params;
    // Resolve agent: accept ObjectId or referralCode
    let resolvedId = agentId;
    if (!mongoose.Types.ObjectId.isValid(agentId)) {
      const user = await User.findOne({ referralCode: { $regex: new RegExp(`^${agentId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } }).select('_id').lean();
      if (!user) {
        return sendResponse(res, 404, { message: 'Agent not found.' });
      }
      resolvedId = user._id;
    }
    await AcaTierConfig.deleteOne({ agent: resolvedId });
    return sendResponse(res, 200, { message: 'Agent tier override removed. Agent will use global tiers.' });
  } catch (err) {
    return errorResponse(res, err);
  }
});

module.exports = router;
