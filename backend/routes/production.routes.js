const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ProductionSubmission = require('../models/ProductionSubmission');
const Carrier = require('../models/Carrier');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { protect: authenticate, authorize } = require('../middleware/auth.middleware');
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
 * Falls back to 'Life Insurance' if unmapped (most legacy records are life/supplemental).
 */
const getProductCategory = (productSold) => {
  if (!productSold || productSold === 'Other') return 'Life Insurance';
  return PRODUCT_CATEGORY_MAP[productSold] || 'Life Insurance';
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
    let query = {};
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
    if (req.query.agentId) {
      query.agent = req.query.agentId;
    }
    if (req.query.productSold) {
      query.productSold = req.query.productSold;
    }
    if (req.query.carrier) {
      query.carrier = new mongoose.Types.ObjectId(req.query.carrier);
    }
    if (req.query.status) {
      query.status = req.query.status;
    }

    // Date range filter
    if (req.query.startDate || req.query.endDate) {
      query.submissionDate = {};
      if (req.query.startDate) {
        query.submissionDate.$gte = new Date(req.query.startDate);
      }
      if (req.query.endDate) {
        query.submissionDate.$lte = new Date(req.query.endDate);
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
// @access  Private
router.get('/team-report', authenticate, async (req, res) => {
  try {
    // window defaults to 30 days
    const windowDays = parseInt(req.query.window) || 30;
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    let agentIds;
    if (req.user.role === 'admin') {
      // Admin can query any upline's tree by passing ?uplineId=
      const rootId = req.query.uplineId || req.user._id;
      const downlineIds = await getDownlineIds(rootId);
      agentIds = [rootId, ...downlineIds];
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

    const [submissions, newRecruits] = await Promise.all([
      ProductionSubmission.find({
        agent: { $in: agentIds },
        status: 'In Force',
        submissionDate: { $gte: since }
      }).select('premiumAmount agent'),
      User.countDocuments({
        referredBy: { $in: agentIds },
        createdAt: { $gte: since }
      })
    ]);

    const totalPremiumInForce = submissions.reduce((sum, s) => sum + (s.premiumAmount || 0), 0);
    const activeAgentCount = await User.countDocuments({
      _id: { $in: agentIds },
      isActive: true
    });

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

// @route   GET /api/production/export
// @desc    Export production submissions as CSV
// @access  Private
router.get('/export', authenticate, async (req, res) => {
  try {
    let query = {};

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
    if (req.query.productCategory) query.productCategory = req.query.productCategory;

    if (req.query.startDate || req.query.endDate) {
      query.submissionDate = {};
      if (req.query.startDate) query.submissionDate.$gte = new Date(req.query.startDate);
      if (req.query.endDate) query.submissionDate.$lte = new Date(req.query.endDate);
    }

    const submissions = await ProductionSubmission.find(query)
      .populate('agent', 'name email')
      .populate('carrier', 'name')
      .sort({ submissionDate: -1 });

    // Build CSV manually (no extra dependency needed)
    const escape = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val).replace(/"/g, '""');
      return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
    };

    const headers = [
      'Submission Date', 'Agent Name', 'Agent Email',
      'Client Name', 'Product', 'Product Category',
      'Carrier', 'Premium Amount', 'Status', 'Notes'
    ];

    const rows = submissions.map(s => [
      s.submissionDate ? new Date(s.submissionDate).toLocaleDateString('en-US') : '',
      s.agent?.name || '',
      s.agent?.email || '',
      s.clientName || '',
      s.productSold === 'Other' && s.productOtherDescription
        ? `Other - ${s.productOtherDescription}`
        : s.productSold || '',
      s.productCategory || '',
      s.carrier?.name || '',
      s.premiumAmount != null ? s.premiumAmount.toFixed(2) : '',
      s.status || '',
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
    let matchQuery = {};
    
    // If not admin, only show own stats
    if (req.user.role !== 'admin') {
      matchQuery.agent = req.user._id;
    } else if (req.query.agentId) {
      matchQuery.agent = req.query.agentId;
    }
    
    // Date range filter
    if (req.query.startDate || req.query.endDate) {
      matchQuery.submissionDate = {};
      if (req.query.startDate) {
        matchQuery.submissionDate.$gte = new Date(req.query.startDate);
      }
      if (req.query.endDate) {
        matchQuery.submissionDate.$lte = new Date(req.query.endDate);
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

    const matchFilter = {};
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
      totalMembers: { $sum: { $ifNull: ['$numberOfMembers', 1] } },
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
router.post('/', authenticate, async (req, res) => {
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
      customFields
    } = req.body;
    
    // Validate required fields
    if (!clientName || !productSold || !carrier || !premiumAmount) {
      return res.status(400).json({ 
        message: 'Missing required fields: clientName, productSold, carrier, premiumAmount' 
      });
    }
    
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
    
    const submission = new ProductionSubmission({
      agent: req.user._id,
      submissionDate: submissionDate || Date.now(),
      clientName,
      numberOfMembers: numberOfMembers || 1,
      productSold,
      productOtherDescription,
      productCategory: resolvedCategory,
      carrier,
      premiumAmount,
      notes,
      status: status || 'Submitted',
      isTrainingPeriod: isTrainingPeriod || false,
      customFields: customFields || {}
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
      customFields
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
    if (premiumAmount !== undefined) submission.premiumAmount = premiumAmount;
    if (notes !== undefined) submission.notes = notes;
    if (isTrainingPeriod !== undefined) submission.isTrainingPeriod = isTrainingPeriod;
    if (customFields !== undefined) submission.customFields = customFields;
    
    // Both agents and admins can change status
    if (status) {
      submission.status = status;
    }
    
    await submission.save();
    await submission.populate('agent', 'name email');
    await submission.populate('carrier', 'name');
    
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
    
    await submission.deleteOne();
    
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
        uploadedAt: Date.now()
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
    submission.reviewNotes = reviewNotes;
    submission.reviewedBy = req.user._id;
    submission.reviewedAt = Date.now();
    
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

      // Trigger promotion check for the agent (async, non-blocking)
      (async () => {
        try {
          const PromotionLevel = require('../models/PromotionLevel');
          const LicensingProgress = require('../models/LicensingProgress');
          const mongoose = require('mongoose');

          const QUALIFYING_CATEGORIES = ['Life Insurance', 'Supplemental Insurance', 'Retirement / Annuities'];
          const agent = await User.findById(agentId).select('level name promotedAt').lean();
          if (!agent) return;

          const levels = await PromotionLevel.find({ isActive: true }).sort({ rank: 1 }).lean();
          if (!levels.length) return;

          const userLevelLower = (agent.level || '').toLowerCase();
          const currentIdx = levels.findIndex(l => l.name.toLowerCase() === userLevelLower);
          if (currentIdx < 0 || currentIdx >= levels.length - 1) return;

          const next = levels[currentIdx + 1];
          const promotedAt = agent.promotedAt || null;
          const cutoff = promotedAt ? new Date(promotedAt) : new Date();
          if (!promotedAt) cutoff.setDate(cutoff.getDate() - (next.producerWindowDays || 365));

          // Check producer track
          const producerResult = await ProductionSubmission.aggregate([
            { $match: { agent: new mongoose.Types.ObjectId(agentId), status: 'In Force', productCategory: { $in: QUALIFYING_CATEGORIES }, submissionDate: { $gte: cutoff } } },
            { $group: { _id: null, total: { $sum: '$premiumAmount' } } }
          ]);
          const producerPremium = producerResult.length > 0 ? producerResult[0].total : 0;
          const producerMet = producerPremium >= next.producerPremiumThreshold;

          // Check builder track
          const downlineIds = await getDownlineIds(agentId);
          const builderCutoff = promotedAt ? new Date(promotedAt) : new Date();
          if (!promotedAt) builderCutoff.setDate(builderCutoff.getDate() - (next.builderWindowDays || 365));

          const builderResult = await ProductionSubmission.aggregate([
            { $match: { agent: { $in: downlineIds.map(id => new mongoose.Types.ObjectId(id)) }, status: 'In Force', productCategory: { $in: QUALIFYING_CATEGORIES }, submissionDate: { $gte: builderCutoff } } },
            { $group: { _id: null, total: { $sum: '$premiumAmount' } } }
          ]);
          const builderPremium = builderResult.length > 0 ? builderResult[0].total : 0;

          // Count licensed producing agents
          const licensedRecords = await LicensingProgress.find({ agent: { $in: downlineIds.map(id => new mongoose.Types.ObjectId(id)) }, isLicensed: true }).select('agent').lean();
          const licensedIds = licensedRecords.map(r => r.agent);
          let activeAgents = 0;
          if (licensedIds.length > 0) {
            const agentResult = await ProductionSubmission.aggregate([
              { $match: { agent: { $in: licensedIds }, status: 'In Force', productCategory: { $in: QUALIFYING_CATEGORIES }, submissionDate: { $gte: builderCutoff } } },
              { $group: { _id: '$agent' } }
            ]);
            activeAgents = agentResult.length;
          }

          const builderMet = builderPremium >= next.builderPremiumThreshold && activeAgents >= next.builderAgentCountThreshold;

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
        } catch (promoErr) {
          console.error('[Production Review] Promotion check error:', promoErr.message);
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
