const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const CommissionStatement = require('../models/CommissionStatement');
const User = require('../models/User');
const { protect: authenticate, authorize } = require('../middleware/auth.middleware');

// ---------------------------------------------------------------------------
// Multer — commission statement PDF uploads (admin only)
// ---------------------------------------------------------------------------
const stmtDir = path.join(__dirname, '../uploads/commission-statements');
if (!fs.existsSync(stmtDir)) fs.mkdirSync(stmtDir, { recursive: true });

const stmtStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, stmtDir),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  }
});
const stmtUpload = multer({
  storage: stmtStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'), false);
  },
  limits: { fileSize: 20 * 1024 * 1024 } // 20 MB
});

// ---------------------------------------------------------------------------
// @route   POST /api/commission-statements
// @desc    Admin: upload a commission statement for an agent
// @access  Admin only
// ---------------------------------------------------------------------------
router.post('/', authenticate, authorize('admin'), stmtUpload.single('statementFile'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Statement PDF is required' });

    const { agentId, carrier, payPeriod } = req.body;
    if (!agentId) return res.status(400).json({ message: 'agentId is required' });
    if (!carrier) return res.status(400).json({ message: 'carrier is required' });
    if (!payPeriod) return res.status(400).json({ message: 'payPeriod is required' });

    const agent = await User.findById(agentId).select('name email');
    if (!agent) return res.status(404).json({ message: 'Agent not found' });

    const stmt = await CommissionStatement.create({
      agent: agentId,
      carrier: carrier.trim(),
      payPeriod: new Date(payPeriod),
      filePath: `uploads/commission-statements/${req.file.filename}`,
      originalFileName: req.file.originalname,
      uploadedBy: req.user._id
    });

    res.status(201).json({ message: 'Commission statement uploaded', statement: stmt });
  } catch (error) {
    console.error('Error uploading commission statement:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------------------------------------------------------------------
// @route   GET /api/commission-statements
// @desc    Agent: list their own statements. Admin: list all (optionally ?agentId=)
// @access  Private
// ---------------------------------------------------------------------------
router.get('/', authenticate, async (req, res) => {
  try {
    const filter = {};

    if (req.user.role === 'admin') {
      if (req.query.agentId) filter.agent = req.query.agentId;
    } else {
      filter.agent = req.user._id;
    }

    if (req.query.carrier) filter.carrier = { $regex: req.query.carrier, $options: 'i' };
    if (req.query.from || req.query.to) {
      filter.payPeriod = {};
      if (req.query.from) filter.payPeriod.$gte = new Date(req.query.from);
      if (req.query.to) filter.payPeriod.$lte = new Date(req.query.to);
    }

    const statements = await CommissionStatement.find(filter)
      .populate('agent', 'name email')
      .populate('uploadedBy', 'name')
      .sort({ payPeriod: -1 });

    res.json(statements);
  } catch (error) {
    console.error('Error fetching commission statements:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------------------------------------------------------------------
// @route   GET /api/commission-statements/:id/download
// @desc    Download (stream) a commission statement PDF
// @access  Private (agent can only access own; admin can access any)
// ---------------------------------------------------------------------------
router.get('/:id/download', authenticate, async (req, res) => {
  try {
    const stmt = await CommissionStatement.findById(req.params.id);
    if (!stmt) return res.status(404).json({ message: 'Statement not found' });

    // Access control
    if (req.user.role !== 'admin' && stmt.agent.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const filePath = path.join(__dirname, '..', stmt.filePath);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'File not found on server' });

    res.setHeader('Content-Disposition', `attachment; filename="${stmt.originalFileName || 'statement.pdf'}"`);
    res.setHeader('Content-Type', 'application/pdf');
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error('Error downloading statement:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------------------------------------------------------------------
// @route   DELETE /api/commission-statements/:id
// @desc    Admin: delete a commission statement
// @access  Admin only
// ---------------------------------------------------------------------------
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const stmt = await CommissionStatement.findById(req.params.id);
    if (!stmt) return res.status(404).json({ message: 'Statement not found' });

    // Remove physical file
    const filePath = path.join(__dirname, '..', stmt.filePath);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (e) { /* log but don't block */ }
    }

    await stmt.deleteOne();
    res.json({ message: 'Commission statement deleted' });
  } catch (error) {
    console.error('Error deleting commission statement:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
