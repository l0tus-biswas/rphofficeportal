const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Carrier = require('../models/Carrier');
const AgentCarrierStatus = require('../models/AgentCarrierStatus');
const { protect: authenticate, authorize } = require('../middleware/auth.middleware');

// ---------------------------------------------------------------------------
// Multer — supplemental level guide PDF uploads
// ---------------------------------------------------------------------------
const guideDir = path.join(__dirname, '../uploads/carrier-guides');
if (!fs.existsSync(guideDir)) fs.mkdirSync(guideDir, { recursive: true });

const guideStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, guideDir),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  }
});
const guideUpload = multer({
  storage: guideStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed for level guides'), false);
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

// @route   GET /api/carriers/my-statuses
// @desc    Agent: get all their carrier status records
// @access  Private
router.get('/my-statuses', authenticate, async (req, res) => {
  try {
    const statuses = await AgentCarrierStatus.find({ agent: req.user._id })
      .populate('carrier', 'name category factor')
      .sort('-requestedAt');
    res.json(statuses);
  } catch (error) {
    console.error('Error fetching carrier statuses:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/carriers/admin/all-requests
// @desc    Admin: list all carrier status requests
// @access  Admin only
router.get('/admin/all-requests', authenticate, authorize('admin'), async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    const requests = await AgentCarrierStatus.find(filter)
      .populate('agent', 'name email')
      .populate('carrier', 'name category')
      .populate('appointedBy', 'name')
      .sort('-requestedAt');

    res.json(requests);
  } catch (error) {
    console.error('Error fetching all requests:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/carriers
// @desc    Get all carriers; supports ?category= and ?activeOnly=
// @access  Private
router.get('/', authenticate, async (req, res) => {
  try {
    const query = {};

    // Admin can see all; agents see only active
    if (req.user.role !== 'admin' || req.query.activeOnly === 'true') {
      query.isActive = true;
    }

    // Optional category filter
    if (req.query.category) {
      query.category = req.query.category;
    }

    const carriers = await Carrier.find(query)
      .select('-__v')
      .sort({ category: 1, name: 1 });

    res.json(carriers);
  } catch (error) {
    console.error('Error fetching carriers:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/carriers/:id
// @desc    Get specific carrier
// @access  Private
router.get('/:id', authenticate, async (req, res) => {
  try {
    const carrier = await Carrier.findById(req.params.id)
      .populate('addedBy', 'name')
      .populate('lastModifiedBy', 'name');
    
    if (!carrier) {
      return res.status(404).json({ message: 'Carrier not found' });
    }
    
    res.json(carrier);
  } catch (error) {
    console.error('Error fetching carrier:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/carriers
// @desc    Create new carrier
// @access  Admin only
router.post('/', authenticate, authorize('admin'), guideUpload.single('levelGuideFile'), async (req, res) => {
  try {
    const {
      name, category, isActive, factor, productFactors,
      contractingLink, contractingInstructions, whatToExpect,
      contactInfo, notes
    } = req.body;

    if (!name) return res.status(400).json({ message: 'Carrier name is required' });
    if (!category) return res.status(400).json({ message: 'Carrier category is required' });

    const existing = await Carrier.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (existing) return res.status(400).json({ message: 'Carrier with this name already exists' });

    const carrierData = {
      name, category,
      isActive: isActive !== undefined ? isActive : true,
      contractingLink, contractingInstructions, whatToExpect, notes,
      addedBy: req.user._id, lastModifiedBy: req.user._id
    };

    if (factor !== undefined && factor !== '') carrierData.factor = parseFloat(factor);
    if (productFactors) {
      try { carrierData.productFactors = typeof productFactors === 'string' ? JSON.parse(productFactors) : productFactors; }
      catch (e) { /* ignore */ }
    }
    if (contactInfo) {
      try { carrierData.contactInfo = typeof contactInfo === 'string' ? JSON.parse(contactInfo) : contactInfo; }
      catch (e) { carrierData.contactInfo = contactInfo; }
    }
    if (req.file) carrierData.supplementalLevelGuide = `uploads/carrier-guides/${req.file.filename}`;

    const carrier = await Carrier.create(carrierData);
    await carrier.populate('addedBy', 'name');

    res.status(201).json(carrier);
  } catch (error) {
    console.error('Error creating carrier:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/carriers/:id
// @desc    Update carrier
// @access  Admin only
router.put('/:id', authenticate, authorize('admin'), guideUpload.single('levelGuideFile'), async (req, res) => {
  try {
    const carrier = await Carrier.findById(req.params.id);
    if (!carrier) return res.status(404).json({ message: 'Carrier not found' });

    const {
      name, category, isActive, factor, productFactors,
      contractingLink, contractingInstructions, whatToExpect,
      contactInfo, notes
    } = req.body;

    if (name && name !== carrier.name) {
      const existing = await Carrier.findOne({
        name: { $regex: new RegExp(`^${name}$`, 'i') },
        _id: { $ne: carrier._id }
      });
      if (existing) return res.status(400).json({ message: 'Carrier with this name already exists' });
      carrier.name = name;
    }

    if (category) carrier.category = category;
    if (isActive !== undefined) carrier.isActive = isActive;
    if (factor !== undefined && factor !== '') carrier.factor = parseFloat(factor);
    if (productFactors) {
      try { carrier.productFactors = typeof productFactors === 'string' ? JSON.parse(productFactors) : productFactors; }
      catch (e) { /* ignore */ }
    }
    if (contractingLink !== undefined) carrier.contractingLink = contractingLink;
    if (contractingInstructions !== undefined) carrier.contractingInstructions = contractingInstructions;
    if (whatToExpect !== undefined) carrier.whatToExpect = whatToExpect;
    if (notes !== undefined) carrier.notes = notes;
    if (contactInfo) {
      try { carrier.contactInfo = { ...carrier.contactInfo, ...(typeof contactInfo === 'string' ? JSON.parse(contactInfo) : contactInfo) }; }
      catch (e) { /* ignore */ }
    }
    if (req.file) carrier.supplementalLevelGuide = `uploads/carrier-guides/${req.file.filename}`;

    carrier.lastModifiedBy = req.user._id;
    await carrier.save();
    await carrier.populate('lastModifiedBy', 'name');

    res.json(carrier);
  } catch (error) {
    console.error('Error updating carrier:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/carriers/:id
// @desc    Delete carrier (soft delete by marking inactive)
// @access  Admin only
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const carrier = await Carrier.findById(req.params.id);
    
    if (!carrier) {
      return res.status(404).json({ message: 'Carrier not found' });
    }
    
    // Soft delete - just mark as inactive
    carrier.isActive = false;
    carrier.lastModifiedBy = req.user._id;
    await carrier.save();
    
    res.json({ message: 'Carrier deactivated successfully', carrier });
  } catch (error) {
    console.error('Error deleting carrier:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/carriers/:carrierId/request
// @desc    Agent: request a contract with a carrier
// @access  Private
router.post('/:carrierId/request', authenticate, async (req, res) => {
  try {
    const carrier = await Carrier.findById(req.params.carrierId);
    if (!carrier || !carrier.isActive) return res.status(404).json({ message: 'Carrier not found' });

    // Idempotent — no-op if already requested/appointed
    const existing = await AgentCarrierStatus.findOne({ agent: req.user._id, carrier: carrier._id });
    if (existing) return res.json({ message: 'Contract already requested', status: existing });

    const status = await AgentCarrierStatus.create({ agent: req.user._id, carrier: carrier._id });
    res.status(201).json({ message: 'Contract request submitted', status });
  } catch (error) {
    console.error('Error requesting contract:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/carriers/admin/status/:statusId/appoint
// @desc    Admin: mark agent as Appointed for a carrier
// @access  Admin only
router.put('/admin/status/:statusId/appoint', authenticate, authorize('admin'), async (req, res) => {
  try {
    const statusRecord = await AgentCarrierStatus.findById(req.params.statusId)
      .populate('agent', 'name email')
      .populate('carrier', 'name');

    if (!statusRecord) return res.status(404).json({ message: 'Request not found' });

    statusRecord.status = 'Appointed';
    statusRecord.appointedAt = new Date();
    statusRecord.appointedBy = req.user._id;
    await statusRecord.save();

    res.json({ message: 'Agent appointed successfully', status: statusRecord });
  } catch (error) {
    console.error('Error appointing agent:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
