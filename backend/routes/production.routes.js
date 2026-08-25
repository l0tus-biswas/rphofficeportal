const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ProductionSubmission = require('../models/ProductionSubmission');
const Carrier = require('../models/Carrier');
const User = require('../models/User');
const IncomePaid = require('../models/IncomePaid');
const Notification = require('../models/Notification');
const { protect: authenticate, authorize } = require('../middleware/auth.middleware');
const { validateRequest, schemas } = require('../middleware/validation.middleware');
const { getDownlineIds } = require('../utils/helpers');
const SystemConfig = require('../models/SystemConfig');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// Full product → category mapping (client-provided, March 2026)
const PRODUCT_CATEGORY_MAP = {
  // Medicare
  'Medicare Advantage':                    'Medicare',
  'Medicare Supplement (Medigap)':         'Medicare',
  'Medicare Part D (Prescription Drug Plan)': 'Medicare',

  // Health Insurance (ACA / private)
  'ACA Marketplace Health Insurance':      'Health Insurance',
  'Private Health Insurance':              'Health Insurance',
  'Short-Term Health Insurance':           'Health Insurance',

  // Life Insurance
  'Term Life Insurance':                   'Life Insurance',
  'Whole Life Insurance':                  'Life Insurance',
  'Universal Life (UL)':                   'Life Insurance',
  'Indexed Universal Life (IUL)':          'Life Insurance',
  'Final Expense / Burial Insurance':      'Life Insurance',
  // Legacy product names (backward compat)
  'Life Insurance \u2013 Term':            'Life Insurance',
  'Life Insurance \u2013 IUL':             'Life Insurance',
  'Life Insurance \u2013 Whole Life':      'Life Insurance',
  'Life Insurance \u2013 VUL':             'Life Insurance',
  'Final Expense':                         'Life Insurance',

  // Supplemental Insurance
  'Short-Term Disability Insurance':       'Supplemental Insurance',
  'Long-Term Disability Insurance':        'Supplemental Insurance',
  'Dental Insurance':                      'Supplemental Insurance',
  'Vision Insurance':                      'Supplemental Insurance',
  'Hospital Indemnity':                    'Supplemental Insurance',
  'Cancer Insurance':                      'Supplemental Insurance',
  'Critical Illness Insurance':            'Supplemental Insurance',
  'Accident Insurance':                    'Supplemental Insurance',
  'Long-Term Care Insurance':              'Supplemental Insurance',
  // Legacy product names (backward compat)
  'Critical Illness':                      'Supplemental Insurance',
  'Dental / Vision / Hearing':             'Supplemental Insurance',
  'Disability':                            'Supplemental Insurance',
  'Long Term Care':                        'Supplemental Insurance',

  // Retirement / Annuities
  'Fixed Annuities':                       'Retirement / Annuities',
  'Indexed Annuities':                     'Retirement / Annuities',

  // Property & Casualty - Personal
  'Auto Insurance':                        'Property & Casualty - Personal',
  'Homeowners Insurance':                  'Property & Casualty - Personal',
  'Renters Insurance':                     'Property & Casualty - Personal',
  'Landlord Insurance':                    'Property & Casualty - Personal',
  'Motorcycle Insurance':                  'Property & Casualty - Personal',
  'RV Insurance':                          'Property & Casualty - Personal',
  'Boat / Watercraft Insurance':           'Property & Casualty - Personal',
  'Umbrella Insurance':                    'Property & Casualty - Personal',

  // Property & Casualty - Commercial
  'General Liability Insurance':           'Property & Casualty - Commercial',
  "Workers' Compensation Insurance":       'Property & Casualty - Commercial',
  'Commercial Property Insurance':         'Property & Casualty - Commercial',
  'Commercial Auto Insurance':             'Property & Casualty - Commercial',
  "Business Owner's Policy (BOP)":         'Property & Casualty - Commercial',
  'Professional Liability Insurance':      'Property & Casualty - Commercial',
};

/**
 * Derive category from product name.
 * Falls back to 'Other' for unmapped products.
 */
const getProductCategory = (productSold) => {
  if (!productSold || productSold === 'Other') return 'Other';
  return PRODUCT_CATEGORY_MAP[productSold] || 'Other';
};

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/production');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `production-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|jpg|jpeg|png|doc|docx|xls|xlsx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only PDF, JPG, PNG, DOC, DOCX, XLS, and XLSX files are allowed'));
  }
});

// @route   GET /api/production
// @desc    Get production submissions with filtering; ?scope=team shows full downline (clientName stripped)
// @access  Private
router.get('/', authenticate, async (req, res) => {
  try {
    let query = { deletedAt: null };
    let isTeamScope = false;

    // If not admin, only show own submissions (or team if scope=team)
    if (req.user.role !== 'admin') {
      if (req.query.scope === 'team') {
        // Upline: own + all downline submissions, with clientName stripped
        const downlineIds = await getDownlineIds(req.user._id);
        const allIds = [req.user._id, ...downlineIds];
        query.agent = { $in: allIds };
        isTeamScope = true;
      } else {
        query.agent = req.user._id;
      }
    }

    // Apply filters
    if (req.query.agentId && req.user.role === 'admin') {
      query.agent = req.query.agentId;
    }
    if (req.query.productSold) {
      query.productSold = req.query.productSold;
    }
    if (req.query.carrier && mongoose.Types.ObjectId.isValid(req.query.carrier)) {
      query.carrier = new mongoose.Types.ObjectId(req.query.carrier);
    }
    if (req.query.status) {
      query.status = req.query.status;
    }
    if (req.query.priority) {
      query.$or = [
        { priority: req.query.priority },
        { 'customFields.priority': req.query.priority }
      ];
    }
    if (req.query.productCategory) {
      query.productCategory = req.query.productCategory;
    }

    // Date range filter
    if (req.query.startDate || req.query.endDate) {
      query.submissionDate = {};
      if (req.query.startDate) {
        query.submissionDate.$gte = new Date(req.query.startDate + 'T00:00:00');
      }
      if (req.query.endDate) {
        // Set to end of day in server timezone to include all records from that date
        const endDate = new Date(req.query.endDate + 'T23:59:59.999');
        query.submissionDate.$lte = endDate;
      }
    }

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const [submissions, total] = await Promise.all([
      ProductionSubmission.find(query)
        .populate('agent', 'name email')
        .populate('carrier', 'name')
        .populate('reviewedBy', 'name')
        .sort({ submissionDate: -1 })
        .skip(skip)
        .limit(limit),
      ProductionSubmission.countDocuments(query)
    ]);

    // For team scope: strip clientName from submissions where agent !== requester
    const processedSubmissions = isTeamScope
      ? submissions.map(sub => {
          const obj = sub.toObject();
          if (sub.agent && sub.agent._id.toString() !== req.user._id.toString()) {
            obj.clientName = null; // strip client name for downline records
          }
          return obj;
        })
      : submissions;

    res.json({
      submissions: processedSubmissions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching production submissions:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/production/team-report
// @desc    Rolling team report: total premium, active agents, new recruits for full downline
//          Accepts same filters as the production list so totals match visible records
// @access  Private
router.get('/team-report', authenticate, async (req, res) => {
  try {
    // window defaults to 30 days
    const windowDays = parseInt(req.query.window) || 30;
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    let agentIds = null; // null = no agent filter (admin sees all)
    if (req.user.role === 'admin') {
      if (req.query.agentId) {
        // Admin filtered to a specific agent — report only that agent's tree
        const targetDownline = await getDownlineIds(req.query.agentId);
        agentIds = [req.query.agentId, ...targetDownline];
      } else if (req.query.uplineId) {
        // Admin can query any upline's tree
        const downlineIds = await getDownlineIds(req.query.uplineId);
        agentIds = [req.query.uplineId, ...downlineIds];
      }
      // If neither agentId nor uplineId, agentIds stays null → query all agents
    } else {
      const downlineIds = await getDownlineIds(req.user._id);
      if (downlineIds.length === 0) {
        return res.json({
          totalPremiumInForce: 0,
          activeAgents: 0,
          newRecruits: 0,
          windowDays,
          since
        });
      }
      agentIds = [req.user._id, ...downlineIds];
    }

    // Build production query — match the same filters the table uses
    const productionQuery = {
      status: 'In Force',
      deletedAt: null
    };

    // Only restrict by agent if we have a specific set of agents
    if (agentIds) {
      productionQuery.agent = { $in: agentIds };
    }

    // Date filter: use explicit date range if provided, else fall back to window
    if (req.query.startDate || req.query.endDate) {
      productionQuery.submissionDate = {};
      if (req.query.startDate) {
        productionQuery.submissionDate.$gte = new Date(req.query.startDate + 'T00:00:00');
      }
      if (req.query.endDate) {
        productionQuery.submissionDate.$lte = new Date(req.query.endDate + 'T23:59:59.999');
      }
    } else {
      productionQuery.submissionDate = { $gte: since };
    }

    // Optional product / carrier / status filters (status already forced to 'In Force')
    if (req.query.productSold) {
      productionQuery.productSold = req.query.productSold;
    }
    if (req.query.carrier && mongoose.Types.ObjectId.isValid(req.query.carrier)) {
      productionQuery.carrier = new mongoose.Types.ObjectId(req.query.carrier);
    }

    // Build recruits/active-agent queries based on whether we have a specific agent set
    const recruitsQuery = { createdAt: { $gte: since } };
    const activeQuery = { isActive: true, role: 'agent', deletedAt: null };
    if (agentIds) {
      recruitsQuery.referredBy = { $in: agentIds };
      activeQuery._id = { $in: agentIds };
    }

    const [submissions, newRecruits] = await Promise.all([
      ProductionSubmission.find(productionQuery).select('premiumAmount agent'),
      User.countDocuments(recruitsQuery)
    ]);

    const totalPremiumInForce = submissions.reduce((sum, s) => sum + (s.premiumAmount || 0), 0);
    const activeAgentCount = await User.countDocuments(activeQuery);

    res.json({
      totalPremiumInForce,
      activeAgents: activeAgentCount,
      newRecruits,
      windowDays,
      since
    });
  } catch (error) {
    console.error('Error fetching team report:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------------------------------------------------------------------
// @route   GET /api/production/stats/filtered
// @desc    Get production statistics that match the SAME filters as the list view
//          so that dashboard totals update when filters are applied
// @access  Private
// ---------------------------------------------------------------------------
router.get('/stats/filtered', authenticate, async (req, res) => {
  try {
    let query = { deletedAt: null };

    if (req.user.role !== 'admin') {
      if (req.query.scope === 'team') {
        const downlineIds = await getDownlineIds(req.user._id);
        const allIds = [req.user._id, ...downlineIds];
        query.agent = { $in: allIds };
      } else {
        query.agent = req.user._id;
      }
    }

    if (req.query.agentId && req.user.role === 'admin') query.agent = req.query.agentId;
    if (req.query.productSold) query.productSold = req.query.productSold;
    if (req.query.carrier && mongoose.Types.ObjectId.isValid(req.query.carrier)) {
      query.carrier = new mongoose.Types.ObjectId(req.query.carrier);
    }
    if (req.query.status) query.status = req.query.status;
    if (req.query.priority) {
      query.$or = [
        { priority: req.query.priority },
        { 'customFields.priority': req.query.priority }
      ];
    }
    if (req.query.productCategory) query.productCategory = req.query.productCategory;

    if (req.query.startDate || req.query.endDate) {
      query.submissionDate = {};
      if (req.query.startDate) query.submissionDate.$gte = new Date(req.query.startDate + 'T00:00:00');
      if (req.query.endDate) query.submissionDate.$lte = new Date(req.query.endDate + 'T23:59:59.999');
    }

    const stats = await ProductionSubmission.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalSubmissions: { $sum: 1 },
          totalPremium: { $sum: '$premiumAmount' },
          totalMembers: { $sum: { $ifNull: ['$numberOfMembers', 0] } },
          inForceCount: { $sum: { $cond: [{ $eq: ['$status', 'In Force'] }, 1, 0] } },
          inForcePremium: { $sum: { $cond: [{ $eq: ['$status', 'In Force'] }, '$premiumAmount', 0] } },
          submittedCount: { $sum: { $cond: [{ $eq: ['$status', 'Submitted'] }, 1, 0] } },
          pendingCount: { $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] } }
        }
      }
    ]);

    res.json({
      summary: stats[0] || { totalSubmissions: 0, totalPremium: 0, totalMembers: 0, inForceCount: 0, inForcePremium: 0, submittedCount: 0, pendingCount: 0 }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/production/export
// @desc    Export production submissions as CSV
// @access  Private
router.get('/export', authenticate, async (req, res) => {
  try {
    let query = { deletedAt: null };

    // Agents only see their own data
    if (req.user.role !== 'admin') {
      query.agent = req.user._id;
    }

    // Apply same filters as the list endpoint
    if (req.query.agentId && req.user.role === 'admin') {
      query.agent = req.query.agentId;
    }
    if (req.query.productSold) query.productSold = req.query.productSold;
    if (req.query.carrier) query.carrier = req.query.carrier;
    if (req.query.status) query.status = req.query.status;
    if (req.query.priority) {
      query.$or = [
        { priority: req.query.priority },
        { 'customFields.priority': req.query.priority }
      ];
    }
    if (req.query.productCategory) query.productCategory = req.query.productCategory;

    if (req.query.startDate || req.query.endDate) {
      query.submissionDate = {};
      if (req.query.startDate) query.submissionDate.$gte = new Date(req.query.startDate + 'T00:00:00');
      if (req.query.endDate) {
        query.submissionDate.$lte = new Date(req.query.endDate + 'T23:59:59.999');
      }
    }

    const submissions = await ProductionSubmission.find(query)
      .populate('agent', 'name email')
      .populate('carrier', 'name')
      .sort({ submissionDate: -1 });

    // Build CSV manually (no extra dependency needed)
    const escape = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val).replace(/"/g, '""');
      return str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r') ? `"${str}"` : str;
    };

    const headers = [
      'Submission Date', 'In-Force Date', 'Agent Name', 'Agent Email',
      'Client Name', 'Product', 'Product Category',
      'Carrier', 'Premium Amount', 'Members', 'Status', 'Priority', 'Notes'
    ];

    const rows = submissions.map(s => [
      s.submissionDate ? new Date(s.submissionDate).toLocaleDateString('en-US') : '',
      s.inForceDate ? new Date(s.inForceDate).toLocaleDateString('en-US') : '',
      s.agent?.name || '',
      s.agent?.email || '',
      s.clientName || '',
      s.productSold === 'Other' && s.productOtherDescription
        ? `Other - ${s.productOtherDescription}`
        : s.productSold || '',
      s.productCategory || '',
      s.carrier?.name || '',
      s.premiumAmount != null ? s.premiumAmount.toFixed(2) : '',
      s.numberOfMembers != null ? s.numberOfMembers : '',
      s.status || '',
      s.priority || '',
      s.notes || ''
    ].map(escape).join(','));

    const csv = [headers.join(','), ...rows].join('\n');

    const filename = `production-export-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting production CSV:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/production/stats/summary
// @desc    Get production statistics summary
// @access  Private
router.get('/stats/summary', authenticate, async (req, res) => {
  try {
    let matchQuery = { deletedAt: null };
    
    // If not admin, only show own stats
    if (req.user.role !== 'admin') {
      matchQuery.agent = req.user._id;
    } else if (req.query.agentId) {
      matchQuery.agent = new mongoose.Types.ObjectId(req.query.agentId);
    }
    
    // Date range filter
    if (req.query.startDate || req.query.endDate) {
      matchQuery.submissionDate = {};
      if (req.query.startDate) {
        matchQuery.submissionDate.$gte = new Date(req.query.startDate + 'T00:00:00');
      }
      if (req.query.endDate) {
        matchQuery.submissionDate.$lte = new Date(req.query.endDate + 'T23:59:59.999');
      }
    }
    
    const stats = await ProductionSubmission.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalSubmissions: { $sum: 1 },
          totalPremium: { $sum: '$premiumAmount' },
          avgPremium: { $avg: '$premiumAmount' }
        }
      }
    ]);
    
    const byProduct = await ProductionSubmission.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$productSold',
          count: { $sum: 1 },
          totalPremium: { $sum: '$premiumAmount' }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    res.json({
      summary: stats[0] || { totalSubmissions: 0, totalPremium: 0, avgPremium: 0 },
      byProduct
    });
  } catch (error) {
    console.error('Error fetching production stats:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------------------------------------------------------------------
// @route   GET /api/production/ranking
// @desc    Agent ranking/leaderboard by production volume (8.7)
// @access  Private (admin sees all; agent sees own team)
// ---------------------------------------------------------------------------
router.get('/ranking', authenticate, async (req, res) => {
  try {
    const sortBy = req.query.sortBy || 'premium'; // premium | policies | members
    const windowDays = parseInt(req.query.window) || 0; // 0 = all time
    const limitCount = parseInt(req.query.limit) || 25;

    const matchFilter = { deletedAt: null };
    if (windowDays > 0) {
      matchFilter.submissionDate = { $gte: new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000) };
    }
    // Non-admin: restrict to own team
    if (req.user.role !== 'admin') {
      const downlineIds = await getDownlineIds(req.user._id);
      const allIds = [req.user._id, ...downlineIds];
      matchFilter.agent = { $in: allIds };
    }

    const groupFields = {
      _id: '$agent',
      totalPremium: { $sum: '$premiumAmount' },
      totalPolicies: { $sum: 1 },
      totalMembers: { $sum: { $ifNull: ['$numberOfMembers', 0] } },
      inForceCount: { $sum: { $cond: [{ $eq: ['$status', 'In Force'] }, 1, 0] } },
      inForcePremium: { $sum: { $cond: [{ $eq: ['$status', 'In Force'] }, '$premiumAmount', 0] } }
    };

    const pipeline = [
      { $match: matchFilter },
      { $group: groupFields },
      { $sort: { [sortBy === 'policies' ? 'totalPolicies' : sortBy === 'members' ? 'totalMembers' : 'totalPremium']: -1 } },
      { $limit: limitCount },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'agentInfo'
        }
      },
      { $unwind: '$agentInfo' },
      {
        $project: {
          agentId: '$_id',
          agentName: '$agentInfo.name',
          agentEmail: '$agentInfo.email',
          totalPremium: 1,
          totalPolicies: 1,
          totalMembers: 1,
          inForceCount: 1,
          inForcePremium: 1
        }
      }
    ];

    const ranking = await ProductionSubmission.aggregate(pipeline);

    // Add rank number
    ranking.forEach((r, i) => { r.rank = i + 1; });

    res.json({ ranking, sortBy, windowDays });
  } catch (error) {
    console.error('Error fetching production ranking:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------------------------------------------------------------------
// @route   GET /api/production/custom-fields
// @desc    Get admin-configured custom production fields (8.2)
// @access  Private
// ---------------------------------------------------------------------------
router.get('/custom-fields', authenticate, async (req, res) => {
  try {
    const config = await SystemConfig.findOne({ key: 'production_custom_fields' }).lean();
    let fields = [];
    if (config && config.value) {
      try { fields = JSON.parse(config.value); } catch { fields = []; }
    }
    res.json({ fields });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------------------------------------------------------------------
// @route   PUT /api/production/custom-fields
// @desc    Admin: configure custom production fields (8.2)
//          Body: { fields: [{ key, label, type, options?, required? }] }
// @access  Admin only
// ---------------------------------------------------------------------------
router.put('/custom-fields', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { fields } = req.body;
    if (!Array.isArray(fields)) {
      return res.status(400).json({ message: 'fields must be an array' });
    }
    // Validate each field definition
    for (const f of fields) {
      if (!f.key || !f.label || !f.type) {
        return res.status(400).json({ message: 'Each field requires: key, label, type' });
      }
      if (!['text', 'number', 'select', 'date', 'checkbox'].includes(f.type)) {
        return res.status(400).json({ message: `Invalid field type "${f.type}". Use: text, number, select, date, checkbox` });
      }
    }
    await SystemConfig.findOneAndUpdate(
      { key: 'production_custom_fields' },
      {
        key: 'production_custom_fields',
        value: JSON.stringify(fields),
        category: 'application',
        description: 'Custom production submission fields',
        isEditable: true,
        updatedBy: req.user._id
      },
      { upsert: true, new: true }
    );
    res.json({ message: 'Custom fields configuration saved.', fields });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ============================================================================
// INCOME PAID
// Agent-submitted "income paid" entry — a single policy can pay out in
// several installments over time (e.g. an upfront payment, then trailing
// monthly commission for months afterward), so an agent logs one entry per
// carrier payment, each with its own "date paid by carrier" so admins can
// line it up against carrier statements when reviewing. Gated by admin
// approval before it feeds any promotion-level income requirement (see
// promotion.routes.js).
// NOTE: these fixed-path routes MUST be registered before the generic
// GET/PUT/DELETE '/:id' routes below — otherwise Express would match
// "/income-paid" itself against ':id' and never reach these handlers.
// ============================================================================

// @route   POST /api/production/income-paid
// @desc    Agent submits an Income Paid entry (pending approval)
// @access  Authenticated
router.post('/income-paid', authenticate, validateRequest(schemas.incomePaid), async (req, res) => {
  try {
    const { amount, datePaidByCarrier, notes } = req.body;

    const entry = await IncomePaid.create({
      agent: req.user._id,
      amount,
      datePaidByCarrier,
      notes,
      status: 'pending'
    });

    // Notify admins there's a new entry awaiting approval. The entry is
    // already saved at this point, so a notification failure (e.g. an
    // email/push provider hiccup) must never surface as a failed submission.
    try {
      const admins = await User.find({ role: 'admin' }).select('_id').lean();
      for (const admin of admins) {
        await Notification.createNotification({
          userId: admin._id,
          type: 'income_paid_pending',
          title: 'Income Paid Awaiting Approval',
          message: `${req.user.name} submitted an Income Paid entry of $${amount.toLocaleString()} for review.`,
          data: { agentId: String(req.user._id), agentName: req.user.name, entryId: String(entry._id) },
          link: '/admin/production'
        });
      }
    } catch (notifyErr) {
      console.error('[Income Paid Submit] Failed to notify admins:', notifyErr.message);
    }

    res.status(201).json({ message: 'Income Paid submitted for approval', entry });
  } catch (error) {
    console.error('Error creating income paid entry:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/production/income-paid/mine
// @desc    Get the current agent's own Income Paid entries
// @access  Authenticated
router.get('/income-paid/mine', authenticate, async (req, res) => {
  try {
    const entries = await IncomePaid.find({ agent: req.user._id })
      .sort('-datePaidByCarrier')
      .lean();
    res.json({ entries });
  } catch (error) {
    console.error('Error fetching income paid entries:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/production/income-paid
// @desc    Admin — list Income Paid entries (filterable by status, agent, and
//          date-paid range so admins can line entries up against carrier statements)
// @access  Admin only
router.get('/income-paid', authenticate, authorize('admin'), async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.agentId) filter.agent = req.query.agentId;
    if (req.query.fromDate || req.query.toDate) {
      filter.datePaidByCarrier = {};
      if (req.query.fromDate) filter.datePaidByCarrier.$gte = new Date(req.query.fromDate);
      if (req.query.toDate) filter.datePaidByCarrier.$lte = new Date(req.query.toDate);
    }

    const entries = await IncomePaid.find(filter)
      .populate('agent', 'name email')
      .populate('reviewedBy', 'name')
      .sort('-datePaidByCarrier')
      .lean();
    res.json({ entries });
  } catch (error) {
    console.error('Error fetching income paid entries:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/production/income-paid/:id/approve
// @desc    Admin — approve an Income Paid entry
// @access  Admin only
router.put('/income-paid/:id/approve', authenticate, authorize('admin'), async (req, res) => {
  try {
    const entry = await IncomePaid.findById(req.params.id);
    if (!entry) return res.status(404).json({ message: 'Income Paid entry not found' });

    entry.status = 'approved';
    entry.reviewedBy = req.user._id;
    entry.reviewedAt = new Date();
    entry.reviewNotes = req.body.reviewNotes || '';
    await entry.save();

    // The approval itself is already saved — a notification failure must
    // never surface as a failed approval.
    try {
      await Notification.createNotification({
        userId: entry.agent,
        type: 'income_paid_approved',
        title: 'Income Paid Approved',
        message: `Your Income Paid entry of $${entry.amount.toLocaleString()} was approved and now counts toward your promotion tracker.`,
        data: { entryId: String(entry._id) },
        link: '/dashboard'
      });
    } catch (notifyErr) {
      console.error('[Income Paid Approve] Failed to notify agent:', notifyErr.message);
    }

    // Re-check promotion eligibility now that income counts
    const { checkAndNotifyPromotion, getUplineChainIds } = require('./promotion.routes');
    (async () => {
      try {
        await checkAndNotifyPromotion(entry.agent);
        const uplineIds = await getUplineChainIds(entry.agent);
        for (const uplineId of uplineIds) {
          await checkAndNotifyPromotion(uplineId);
        }
      } catch (promoErr) {
        console.error('[Income Paid Approve] Promotion chain check error:', promoErr.message);
      }
    })();

    res.json({ message: 'Income Paid entry approved', entry });
  } catch (error) {
    console.error('Error approving income paid entry:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/production/income-paid/:id/reject
// @desc    Admin — reject an Income Paid entry
// @access  Admin only
router.put('/income-paid/:id/reject', authenticate, authorize('admin'), async (req, res) => {
  try {
    const entry = await IncomePaid.findById(req.params.id);
    if (!entry) return res.status(404).json({ message: 'Income Paid entry not found' });

    entry.status = 'rejected';
    entry.reviewedBy = req.user._id;
    entry.reviewedAt = new Date();
    entry.reviewNotes = req.body.reviewNotes || '';
    await entry.save();

    // The rejection itself is already saved — a notification failure must
    // never surface as a failed rejection.
    try {
      await Notification.createNotification({
        userId: entry.agent,
        type: 'income_paid_rejected',
        title: 'Income Paid Rejected',
        message: `Your Income Paid entry of $${entry.amount.toLocaleString()} was rejected.${entry.reviewNotes ? ' Reason: ' + entry.reviewNotes : ''}`,
        data: { entryId: String(entry._id) },
        link: '/production'
      });
    } catch (notifyErr) {
      console.error('[Income Paid Reject] Failed to notify agent:', notifyErr.message);
    }

    res.json({ message: 'Income Paid entry rejected', entry });
  } catch (error) {
    console.error('Error rejecting income paid entry:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/production/income-paid/:id
// @desc    Delete an Income Paid entry (owner may delete only while pending; admin may always delete)
// @access  Authenticated
router.delete('/income-paid/:id', authenticate, async (req, res) => {
  try {
    const entry = await IncomePaid.findById(req.params.id);
    if (!entry) return res.status(404).json({ message: 'Income Paid entry not found' });

    const isOwner = entry.agent.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isAdmin && !(isOwner && entry.status === 'pending')) {
      return res.status(403).json({ message: 'You can only delete your own pending entries.' });
    }

    await entry.deleteOne();
    res.json({ message: 'Income Paid entry deleted' });
  } catch (error) {
    console.error('Error deleting income paid entry:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/production/:id
// @desc    Get specific production submission
// @access  Private
router.get('/:id', authenticate, async (req, res) => {
  try {
    const submission = await ProductionSubmission.findById(req.params.id)
      .populate('agent', 'name email phone')
      .populate('carrier', 'name')
      .populate('reviewedBy', 'name');
    
    if (!submission) {
      return res.status(404).json({ message: 'Production submission not found' });
    }
    
    // Agents can only view their own submissions, admins can view all
    if (req.user.role !== 'admin' && submission.agent._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    res.json(submission);
  } catch (error) {
    console.error('Error fetching production submission:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/production
// @desc    Create new production submission
// @access  Private (agent or admin)
router.post('/', authenticate, validateRequest(schemas.productionSubmission), async (req, res) => {
  try {
    const {
      submissionDate,
      clientName,
      numberOfMembers,
      productSold,
      productOtherDescription,
      productCategory,
      carrier,
      premiumAmount,
      notes,
      status,
      isTrainingPeriod,
      customFields,
      inForceDate,
      priority
    } = req.body;
    
    // If product is "Other", require description
    if (productSold === 'Other' && !productOtherDescription) {
      return res.status(400).json({ 
        message: 'Product description is required when "Other" is selected' 
      });
    }

    // Derive productCategory if not provided
    const resolvedCategory = productCategory || getProductCategory(productSold);
    
    // Verify carrier exists
    const carrierExists = await Carrier.findById(carrier);
    if (!carrierExists) {
      return res.status(400).json({ message: 'Invalid carrier' });
    }

    // Duplicate submission guard: prevent identical submissions within 60 seconds
    const dupeWindow = new Date(Date.now() - 60 * 1000);
    const duplicate = await ProductionSubmission.findOne({
      agent: req.user._id,
      clientName,
      productSold,
      carrier,
      premiumAmount,
      deletedAt: null,
      createdAt: { $gte: dupeWindow }
    }).lean();
    if (duplicate) {
      return res.status(409).json({ message: 'Duplicate submission detected. Please wait before resubmitting.' });
    }

    // Agents and admins can record any valid production status
    // (Submitted, Pending, In Force, Lapsed, Cancelled). The Joi schema and the
    // model enum validate the value, so an invalid status is rejected upstream.
    const VALID_STATUSES = ['Submitted', 'Pending', 'In Force', 'Lapsed', 'Cancelled', 'Lost'];
    let resolvedStatus = status && VALID_STATUSES.includes(status) ? status : 'Submitted';

    // If recording as "In Force" without an explicit date, default it to now
    let resolvedInForceDate = inForceDate || null;
    if (resolvedStatus === 'In Force' && !resolvedInForceDate) {
      resolvedInForceDate = new Date();
    }

    // Non-admin: restrict submission date (no more than 1 year in the past)
    let resolvedSubmissionDate = submissionDate ? new Date(submissionDate) : new Date();
    if (req.user.role !== 'admin' && submissionDate) {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const submDate = new Date(submissionDate);
      if (submDate < oneYearAgo) {
        return res.status(400).json({ message: 'Submission date cannot be more than 1 year in the past' });
      }
    }
    
    const submission = new ProductionSubmission({
      agent: req.user._id,
      submissionDate: resolvedSubmissionDate,
      clientName,
      numberOfMembers: numberOfMembers != null ? numberOfMembers : null,
      productSold,
      productOtherDescription,
      productCategory: resolvedCategory,
      carrier,
      premiumAmount,
      notes,
      status: resolvedStatus,
      isTrainingPeriod: isTrainingPeriod || false,
      customFields: customFields || {},
      inForceDate: resolvedInForceDate,
      priority: priority || null
    });

    await submission.save();
    await submission.populate('agent', 'name email');
    await submission.populate('carrier', 'name');

    Notification.createNotification({
      userId: req.user._id,
      type: 'production_submitted',
      title: 'Production Submitted',
      message: `Your production submission for ${clientName} (${productSold}) has been submitted successfully.`,
      link: '/production'
    }, false).catch(() => {});

    // If created directly as "In Force", run the promotion check chain
    if (submission.status === 'In Force') {
      const agentId = submission.agent._id || submission.agent;
      const { checkAndNotifyPromotion, getUplineChainIds } = require('./promotion.routes');
      (async () => {
        try {
          await checkAndNotifyPromotion(agentId);
          const uplineIds = await getUplineChainIds(agentId);
          for (const uplineId of uplineIds) {
            await checkAndNotifyPromotion(uplineId);
          }
        } catch (promoErr) {
          console.error('[Production Create] Promotion chain check error:', promoErr.message);
        }
      })();
    }

    res.status(201).json(submission);
  } catch (error) {
    console.error('Error creating production submission:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/production/:id
// @desc    Update production submission
// @access  Private (own submission or admin)
router.put('/:id', authenticate, async (req, res) => {
  try {
    const submission = await ProductionSubmission.findById(req.params.id);
    
    if (!submission) {
      return res.status(404).json({ message: 'Production submission not found' });
    }
    
    // Agents can only update their own submissions, admins can update all
    if (req.user.role !== 'admin' && submission.agent.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const {
      submissionDate,
      clientName,
      numberOfMembers,
      productSold,
      productOtherDescription,
      productCategory,
      carrier,
      premiumAmount,
      notes,
      status,
      isTrainingPeriod,
      customFields,
      inForceDate,
      priority
    } = req.body;
    
    // Update fields
    if (submissionDate) submission.submissionDate = submissionDate;
    if (clientName) submission.clientName = clientName;
    if (numberOfMembers !== undefined) submission.numberOfMembers = numberOfMembers;
    if (productSold) {
      submission.productSold = productSold;
      // Re-derive category if product changed and no explicit category sent
      submission.productCategory = productCategory || getProductCategory(productSold);
    }
    if (productCategory) submission.productCategory = productCategory;
    if (productOtherDescription !== undefined) submission.productOtherDescription = productOtherDescription;
    if (carrier) submission.carrier = carrier;
    if (premiumAmount !== undefined) {
      if (premiumAmount < 0) {
        return res.status(400).json({ message: 'Premium amount cannot be negative' });
      }
      submission.premiumAmount = premiumAmount;
    }
    if (notes !== undefined) submission.notes = notes;
    if (isTrainingPeriod !== undefined) submission.isTrainingPeriod = isTrainingPeriod;
    if (customFields !== undefined) submission.customFields = customFields;
    if (inForceDate !== undefined) submission.inForceDate = inForceDate;
    if (priority !== undefined) submission.priority = priority;
    
    // Status changes: agents and admins can set any valid production status so
    // they can keep records accurate (In Force, Lapsed, Cancelled, etc.).
    const previousStatus = submission.status;
    const VALID_STATUSES = ['Submitted', 'Pending', 'In Force', 'Lapsed', 'Cancelled', 'Lost'];
    if (status && VALID_STATUSES.includes(status)) {
      submission.status = status;
      // Auto-set inForceDate when status becomes "In Force" and none provided
      if (status === 'In Force' && !submission.inForceDate && !inForceDate) {
        submission.inForceDate = new Date();
      }
    }
    
    await submission.save();
    await submission.populate('agent', 'name email');
    await submission.populate('carrier', 'name');
    
    // Trigger promotion sync when status changes to "In Force"
    if (submission.status === 'In Force' && previousStatus !== 'In Force') {
      const agentId = submission.agent._id || submission.agent;
      const { checkAndNotifyPromotion, getUplineChainIds } = require('./promotion.routes');
      (async () => {
        try {
          await checkAndNotifyPromotion(agentId);
          const uplineIds = await getUplineChainIds(agentId);
          for (const uplineId of uplineIds) {
            await checkAndNotifyPromotion(uplineId);
          }
        } catch (promoErr) {
          console.error('[Production Update] Promotion chain check error:', {
            submissionId: submission._id,
            agentId: agentId.toString(),
            error: promoErr.message,
            stack: promoErr.stack
          });
        }
      })();
    }

    // When status changes FROM "In Force" to something else, re-check promotions
    // (the agent/upline may no longer meet thresholds)
    if (previousStatus === 'In Force' && submission.status !== 'In Force') {
      const agentId = submission.agent._id || submission.agent;
      const { checkAndNotifyPromotion, getUplineChainIds } = require('./promotion.routes');
      (async () => {
        try {
          await checkAndNotifyPromotion(agentId);
          const uplineIds = await getUplineChainIds(agentId);
          for (const uplineId of uplineIds) {
            await checkAndNotifyPromotion(uplineId);
          }
        } catch (promoErr) {
          console.error('[Production Update] Promotion recheck error:', {
            submissionId: submission._id,
            agentId: agentId.toString(),
            error: promoErr.message,
            stack: promoErr.stack
          });
        }
      })();
    }
    
    res.json(submission);
  } catch (error) {
    console.error('Error updating production submission:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/production/:id
// @desc    Delete production submission
// @access  Private (own submission or admin)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const submission = await ProductionSubmission.findById(req.params.id);
    
    if (!submission) {
      return res.status(404).json({ message: 'Production submission not found' });
    }
    
    // Agents can only delete their own submissions, admins can delete all
    if (req.user.role !== 'admin' && submission.agent.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const wasInForce = submission.status === 'In Force';

    // Soft-delete: set deletedAt timestamp instead of removing the record
    submission.deletedAt = new Date();
    submission.deletedBy = req.user._id;
    await submission.save();

    // Deleting an "In Force" submission changes production totals the same way
    // a status change away from "In Force" does — re-run the same eligibility
    // recheck for the agent and their upline chain.
    if (wasInForce) {
      const agentId = submission.agent._id || submission.agent;
      const { checkAndNotifyPromotion, getUplineChainIds } = require('./promotion.routes');
      (async () => {
        try {
          await checkAndNotifyPromotion(agentId);
          const uplineIds = await getUplineChainIds(agentId);
          for (const uplineId of uplineIds) {
            await checkAndNotifyPromotion(uplineId);
          }
        } catch (promoErr) {
          console.error('[Production Delete] Promotion recheck error:', {
            submissionId: submission._id,
            agentId: agentId.toString(),
            error: promoErr.message,
            stack: promoErr.stack
          });
        }
      })();
    }

    res.json({ message: 'Production submission deleted successfully' });
  } catch (error) {
    console.error('Error deleting production submission:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/production/:id/upload
// @desc    Upload document for production submission
// @access  Private
router.post('/:id/upload', 
  authenticate, 
  upload.single('document'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }
      
      const submission = await ProductionSubmission.findById(req.params.id);
      
      if (!submission) {
        return res.status(404).json({ message: 'Production submission not found' });
      }
      
      // Agents can only upload to their own submissions, admins can upload to all
      if (req.user.role !== 'admin' && submission.agent.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      const document = {
        filename: req.file.originalname,
        url: `/uploads/production/${req.file.filename}`,
        uploadedAt: new Date()
      };
      
      submission.documents.push(document);
      await submission.save();
      
      res.json({
        message: 'Document uploaded successfully',
        document,
        submission
      });
    } catch (error) {
      console.error('Error uploading document:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// @route   PUT /api/production/:id/review
// @desc    Admin review of production submission
// @access  Admin only
router.put('/:id/review', authenticate, authorize('admin'), async (req, res) => {
  try {
    const submission = await ProductionSubmission.findById(req.params.id);
    
    if (!submission) {
      return res.status(404).json({ message: 'Production submission not found' });
    }
    
    const previousStatus = submission.status;
    const { status, reviewNotes } = req.body;
    
    submission.status = status || submission.status;
    if (reviewNotes !== undefined) submission.reviewNotes = reviewNotes;
    submission.reviewedBy = req.user._id;
    submission.reviewedAt = new Date();

    // Auto-set inForceDate when marked as "In Force" and not already set
    if (status === 'In Force' && !submission.inForceDate) {
      submission.inForceDate = new Date();
    }
    
    await submission.save();
    await submission.populate('agent', 'name email');
    await submission.populate('carrier', 'name');
    await submission.populate('reviewedBy', 'name');

    // When production goes "In Force", notify the agent and trigger promotion check
    if (status === 'In Force' && previousStatus !== 'In Force') {
      const agentId = submission.agent._id || submission.agent;

      // Notify the agent
      Notification.createNotification({
        userId: agentId,
        type: 'production_in_force',
        title: 'Production In Force',
        message: `Your production submission for ${submission.clientName} has been marked as In Force.`,
        link: '/production'
      }, false).catch(() => {});

      // Notify upline chain about in-force production
      Notification.notifyUplineChain(
        agentId,
        'production_in_force',
        'Downline Production In Force',
        `{agentName}'s production for ${submission.clientName} is now In Force.`,
        '/production'
      ).catch(() => {});

      // Trigger promotion check for the agent AND the entire upline chain (async, non-blocking)
      const { checkAndNotifyPromotion, getUplineChainIds } = require('./promotion.routes');
      (async () => {
        try {
          // Check the submitting agent first
          await checkAndNotifyPromotion(agentId);

          // Propagate builder track check up the entire upline chain
          const uplineIds = await getUplineChainIds(agentId);
          for (const uplineId of uplineIds) {
            await checkAndNotifyPromotion(uplineId);
          }
        } catch (promoErr) {
          console.error('[Production Review] Promotion chain check error:', promoErr.message);
        }
      })();
    }

    res.json(submission);
  } catch (error) {
    console.error('Error reviewing production submission:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
