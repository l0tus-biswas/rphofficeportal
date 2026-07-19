const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Carrier = require('../models/Carrier');
const AgentCarrierStatus = require('../models/AgentCarrierStatus');
const Notification = require('../models/Notification');
const User = require('../models/User');
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

// ---------------------------------------------------------------------------
// Multer — general carrier document uploads (guides, forms, resources)
// ---------------------------------------------------------------------------
const documentsDir = path.join(__dirname, '../uploads/carrier-documents');
if (!fs.existsSync(documentsDir)) fs.mkdirSync(documentsDir, { recursive: true });

const documentStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, documentsDir),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  }
});
// Documents accept PDF, Word docs, and common image formats.
const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp'
];
const documentUpload = multer({
  storage: documentStorage,
  fileFilter: (req, file, cb) => {
    if (ALLOWED_DOCUMENT_MIME_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PDF, Word, or image (JPG, PNG, GIF, WEBP) files are allowed'), false);
  },
  limits: { fileSize: 3 * 1024 * 1024 }
});

// Multer errors (bad mimetype, oversized file, disk write failure) are
// surfaced via next(err) and would otherwise skip straight past each route's
// own try/catch to the app's generic error handler, which masks everything
// as "Internal Server Error" in production. Run upload middleware manually so
// these come back as clear, specific 400s instead.
const runUpload = (uploadMiddleware, maxSizeLabel = '10MB') => (req, res, next) => {
  uploadMiddleware(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: `File is too large. Maximum size is ${maxSizeLabel}.` });
    }
    return res.status(400).json({ message: err.message || 'File upload failed' });
  });
};

// @route   GET /api/carriers/my-statuses
// @desc    Agent: get all their carrier status records
// @access  Private (agent, admin)
router.get('/my-statuses', authenticate, authorize('agent', 'admin'), async (req, res) => {
  try {
    const statuses = await AgentCarrierStatus.find({ agent: req.user._id })
      .populate('carrier', 'name category')
      .populate('notes.addedBy', 'name')
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
      .populate('unappointedBy', 'name')
      .populate('notes.addedBy', 'name')
      .sort('-requestedAt');

    res.json(requests);
  } catch (error) {
    console.error('Error fetching all requests:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/carriers/admin/agents
// @desc    Admin: list all agents (for the appointments agent selector)
// @access  Admin only
router.get('/admin/agents', authenticate, authorize('admin'), async (req, res) => {
  try {
    const agents = await User.find({ role: 'agent', isActive: true, deletedAt: null })
      .select('name email')
      .sort('name');
    res.json(agents);
  } catch (error) {
    console.error('Error fetching agents:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/carriers/admin/agent/:agentId/statuses
// @desc    Admin: get a single agent's carrier status records (across all carriers)
// @access  Admin only
router.get('/admin/agent/:agentId/statuses', authenticate, authorize('admin'), async (req, res) => {
  try {
    const statuses = await AgentCarrierStatus.find({ agent: req.params.agentId })
      .populate('carrier', 'name category')
      .populate('notes.addedBy', 'name')
      .sort('-updatedAt');
    res.json(statuses);
  } catch (error) {
    console.error('Error fetching agent statuses:', error);
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

    // Optional category filter — category is now an array, use $in
    if (req.query.category) {
      query.category = { $in: [req.query.category] };
    }

    const carriers = await Carrier.find(query)
      .select('-__v')
      .sort({ name: 1 });

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
router.post('/', authenticate, authorize('admin'), runUpload(guideUpload.single('levelGuideFile')), async (req, res) => {
  try {
    const {
      name, category, isActive,
      contractingLink, contractingInstructions, whatToExpect,
      contactInfo, notes
    } = req.body;

    if (!name) return res.status(400).json({ message: 'Carrier name is required' });

    // category is now an array — parse if sent as JSON string
    let categoryArr = category;
    if (typeof categoryArr === 'string') {
      try { categoryArr = JSON.parse(categoryArr); } catch (e) { categoryArr = [categoryArr]; }
    }
    if (!categoryArr || !Array.isArray(categoryArr) || categoryArr.length === 0) {
      return res.status(400).json({ message: 'At least one carrier category is required' });
    }

    const existing = await Carrier.findOne({
      name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });
    if (existing) return res.status(400).json({ message: 'Carrier with this name already exists' });

    // Validate contractingLink is a valid URL if provided
    if (contractingLink && contractingLink.trim()) {
      try {
        const url = new URL(contractingLink);
        if (!['http:', 'https:'].includes(url.protocol)) {
          return res.status(400).json({ message: 'Contracting link must be an HTTP or HTTPS URL' });
        }
      } catch (e) {
        return res.status(400).json({ message: 'Contracting link must be a valid URL' });
      }
    }

    const carrierData = {
      name, category: categoryArr,
      isActive: isActive !== undefined ? isActive : true,
      contractingLink, contractingInstructions, whatToExpect, notes,
      addedBy: req.user._id, lastModifiedBy: req.user._id
    };

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
router.put('/:id', authenticate, authorize('admin'), runUpload(guideUpload.single('levelGuideFile')), async (req, res) => {
  try {
    const carrier = await Carrier.findById(req.params.id);
    if (!carrier) return res.status(404).json({ message: 'Carrier not found' });

    const {
      name, category, isActive,
      contractingLink, contractingInstructions, whatToExpect,
      contactInfo, notes
    } = req.body;

    if (name && name !== carrier.name) {
      const existing = await Carrier.findOne({
        name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        _id: { $ne: carrier._id }
      });
      if (existing) return res.status(400).json({ message: 'Carrier with this name already exists' });
      carrier.name = name;
    }

    // category is now an array — parse if sent as JSON string
    if (category) {
      let categoryArr = category;
      if (typeof categoryArr === 'string') {
        try { categoryArr = JSON.parse(categoryArr); } catch (e) { categoryArr = [categoryArr]; }
      }
      if (Array.isArray(categoryArr) && categoryArr.length > 0) {
        carrier.category = categoryArr;
      }
    }
    if (isActive !== undefined) {
      carrier.isActive = isActive;
      // Reactivating clears the soft-delete tombstone so it reflects current state
      if (isActive) {
        carrier.deletedAt = null;
        carrier.deletedBy = null;
      }
    }
    if (contractingLink !== undefined) {
      if (contractingLink && contractingLink.trim()) {
        try {
          const url = new URL(contractingLink);
          if (!['http:', 'https:'].includes(url.protocol)) {
            return res.status(400).json({ message: 'Contracting link must be an HTTP or HTTPS URL' });
          }
        } catch (e) {
          return res.status(400).json({ message: 'Contracting link must be a valid URL' });
        }
      }
      carrier.contractingLink = contractingLink;
    }
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

// @route   POST /api/carriers/:id/documents
// @desc    Upload a named PDF document for a carrier (guide, form, resource)
// @access  Admin only
router.post('/:id/documents', authenticate, authorize('admin'), runUpload(documentUpload.single('file'), '3MB'), async (req, res) => {
  try {
    const carrier = await Carrier.findById(req.params.id);
    if (!carrier) return res.status(404).json({ message: 'Carrier not found' });
    if (!req.file) return res.status(400).json({ message: 'A PDF file is required' });
    if (!req.file.size) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ message: 'Uploaded file is empty' });
    }

    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ message: 'Document name is required' });

    carrier.documents.push({
      name,
      filePath: `uploads/carrier-documents/${req.file.filename}`,
      originalFileName: req.file.originalname,
      fileSize: req.file.size,
      uploadedBy: req.user._id,
      uploadedAt: new Date()
    });
    carrier.lastModifiedBy = req.user._id;
    await carrier.save();

    res.status(201).json(carrier);
  } catch (error) {
    console.error('Error uploading carrier document:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/carriers/:id/documents/:docId
// @desc    Delete a carrier document
// @access  Admin only
router.delete('/:id/documents/:docId', authenticate, authorize('admin'), async (req, res) => {
  try {
    const carrier = await Carrier.findById(req.params.id);
    if (!carrier) return res.status(404).json({ message: 'Carrier not found' });

    const doc = carrier.documents.id(req.params.docId);
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    const fullPath = path.join(__dirname, '..', doc.filePath);
    if (fs.existsSync(fullPath)) {
      fs.unlink(fullPath, () => {});
    }

    carrier.documents.pull(req.params.docId);
    carrier.lastModifiedBy = req.user._id;
    await carrier.save();

    res.json({ message: 'Document deleted', carrier });
  } catch (error) {
    console.error('Error deleting carrier document:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/carriers/:id/documents/:docId/download
// @desc    Download/view a carrier document
// @access  Private (any authenticated user)
router.get('/:id/documents/:docId/download', authenticate, async (req, res) => {
  try {
    const carrier = await Carrier.findById(req.params.id);
    if (!carrier) return res.status(404).json({ message: 'Carrier not found' });

    const doc = carrier.documents.id(req.params.docId);
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    const fullPath = path.join(__dirname, '..', doc.filePath);
    const backendRoot = path.resolve(__dirname, '..');
    if (!path.resolve(fullPath).startsWith(backendRoot + path.sep)) {
      return res.status(403).json({ message: 'Access denied: invalid file path' });
    }
    if (!fs.existsSync(fullPath)) return res.status(404).json({ message: 'File not found on server' });

    const fileName = doc.originalFileName || doc.name;
    const ext = path.extname(fileName).toLowerCase();
    const contentTypeByExt = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };
    const contentType = contentTypeByExt[ext] || 'application/octet-stream';
    // Browsers can render PDFs/images inline; Word docs can't be previewed, so
    // serve those as an attachment (triggers a normal download) instead.
    const disposition = (ext === '.doc' || ext === '.docx') ? 'attachment' : 'inline';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `${disposition}; filename="${fileName}"`);
    fs.createReadStream(fullPath).pipe(res);
  } catch (error) {
    console.error('Error downloading carrier document:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/carriers/:id/level-guide/download
// @desc    Download the legacy supplemental level guide PDF (authenticated)
// @access  Private (any authenticated user)
router.get('/:id/level-guide/download', authenticate, async (req, res) => {
  try {
    const carrier = await Carrier.findById(req.params.id);
    if (!carrier || !carrier.supplementalLevelGuide) {
      return res.status(404).json({ message: 'Level guide not found' });
    }

    const fullPath = path.join(__dirname, '..', carrier.supplementalLevelGuide);
    const backendRoot = path.resolve(__dirname, '..');
    if (!path.resolve(fullPath).startsWith(backendRoot + path.sep)) {
      return res.status(403).json({ message: 'Access denied: invalid file path' });
    }
    if (!fs.existsSync(fullPath)) return res.status(404).json({ message: 'File not found on server' });

    const safeName = carrier.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${safeName}-level-guide.pdf"`);
    fs.createReadStream(fullPath).pipe(res);
  } catch (error) {
    console.error('Error downloading level guide:', error);
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
    carrier.deletedAt = new Date();
    carrier.deletedBy = req.user._id;
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

    // Notify all admins about the contract request
    try {
      const admins = await User.find({ role: 'admin' }).select('_id').lean();
      for (const admin of admins) {
        await Notification.createNotification({
          userId: admin._id,
          type: 'carrier_contract_requested',
          title: 'New Carrier Contract Request',
          message: `${req.user.name} has requested a contract with ${carrier.name}.`,
          data: { agentId: String(req.user._id), agentName: req.user.name, carrierId: String(carrier._id), carrierName: carrier.name },
          link: '/admin/carrier-appointments'
        });
      }
    } catch (notifErr) {
      console.error('Error sending contract request notification:', notifErr);
    }

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

    // Notify the agent about appointment
    try {
      await Notification.createNotification({
        userId: statusRecord.agent._id || statusRecord.agent,
        type: 'carrier_appointed',
        title: 'Carrier Contract Appointed',
        message: `You have been appointed for ${statusRecord.carrier?.name || 'a carrier'}.`,
        data: { carrierId: String(statusRecord.carrier._id || statusRecord.carrier) },
        link: '/carriers'
      });
    } catch (notifErr) {
      console.error('Error sending appointment notification:', notifErr);
    }

    res.json({ message: 'Agent appointed successfully', status: statusRecord });
  } catch (error) {
    console.error('Error appointing agent:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/carriers/admin/status/:statusId/unappoint
// @desc    Admin: unappoint an agent from a carrier
// @access  Admin only
router.put('/admin/status/:statusId/unappoint', authenticate, authorize('admin'), async (req, res) => {
  try {
    const statusRecord = await AgentCarrierStatus.findById(req.params.statusId)
      .populate('agent', 'name email')
      .populate('carrier', 'name');

    if (!statusRecord) return res.status(404).json({ message: 'Request not found' });
    if (statusRecord.status !== 'Appointed') return res.status(400).json({ message: 'Can only unappoint an appointed carrier' });

    statusRecord.status = 'Unappointed';
    statusRecord.unappointedAt = new Date();
    statusRecord.unappointedBy = req.user._id;
    await statusRecord.save();

    // Notify the agent
    try {
      await Notification.createNotification({
        userId: statusRecord.agent._id || statusRecord.agent,
        type: 'carrier_unappointed',
        title: 'Carrier Contract Unappointed',
        message: `Your appointment for ${statusRecord.carrier?.name || 'a carrier'} has been removed.`,
        data: { carrierId: String(statusRecord.carrier._id || statusRecord.carrier) },
        link: '/carriers'
      });
    } catch (notifErr) {
      console.error('Error sending unappoint notification:', notifErr);
    }

    res.json({ message: 'Agent unappointed successfully', status: statusRecord });
  } catch (error) {
    console.error('Error unappointing agent:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/carriers/admin/status/:statusId/notes
// @desc    Admin: add a note to a carrier request
// @access  Admin only
router.post('/admin/status/:statusId/notes', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ message: 'Note text is required' });

    const statusRecord = await AgentCarrierStatus.findById(req.params.statusId);
    if (!statusRecord) return res.status(404).json({ message: 'Request not found' });

    statusRecord.notes.push({ text: text.trim(), addedBy: req.user._id, addedAt: new Date() });
    await statusRecord.save();

    // Re-fetch with populated notes
    const updated = await AgentCarrierStatus.findById(statusRecord._id)
      .populate('agent', 'name email')
      .populate('carrier', 'name category')
      .populate('notes.addedBy', 'name');

    res.json({ message: 'Note added', status: updated });
  } catch (error) {
    console.error('Error adding note:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/carriers/admin/agent/:agentId/carrier/:carrierId/status
// @desc    Admin: manually set an agent's appointment status for a carrier.
//          Upserts the AgentCarrierStatus record so admins can manage
//          appointments without waiting for an agent request. Syncs to the
//          agent's Carriers page.
// @access  Admin only
router.put('/admin/agent/:agentId/carrier/:carrierId/status', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['Appointed', 'Unappointed', 'Pending'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: `Status must be one of: ${allowed.join(', ')}` });
    }

    const agent = await User.findById(req.params.agentId).select('name role');
    if (!agent) return res.status(404).json({ message: 'Agent not found' });

    const carrier = await Carrier.findById(req.params.carrierId).select('name');
    if (!carrier) return res.status(404).json({ message: 'Carrier not found' });

    let record = await AgentCarrierStatus.findOne({ agent: agent._id, carrier: carrier._id });
    if (!record) {
      record = new AgentCarrierStatus({ agent: agent._id, carrier: carrier._id });
    }

    record.status = status;
    if (status === 'Appointed') {
      record.appointedAt = new Date();
      record.appointedBy = req.user._id;
    } else if (status === 'Unappointed') {
      record.unappointedAt = new Date();
      record.unappointedBy = req.user._id;
    }
    await record.save();

    // Notify the agent that their carrier status changed
    try {
      const notifMap = {
        Appointed: { type: 'carrier_appointed', title: 'Carrier Appointment Updated', message: `You have been appointed for ${carrier.name}.` },
        Unappointed: { type: 'carrier_unappointed', title: 'Carrier Appointment Updated', message: `Your appointment for ${carrier.name} has been removed.` },
        Pending: { type: 'carrier_appointed', title: 'Carrier Appointment Updated', message: `Your appointment for ${carrier.name} is now pending / in progress.` }
      };
      const n = notifMap[status];
      await Notification.createNotification({
        userId: agent._id,
        type: n.type,
        title: n.title,
        message: n.message,
        data: { carrierId: String(carrier._id) },
        link: '/carriers'
      });
    } catch (notifErr) {
      console.error('Error sending status notification:', notifErr);
    }

    const updated = await AgentCarrierStatus.findById(record._id)
      .populate('agent', 'name email')
      .populate('carrier', 'name category')
      .populate('notes.addedBy', 'name');

    res.json({ message: `Status set to ${status}`, status: updated });
  } catch (error) {
    console.error('Error setting agent carrier status:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
