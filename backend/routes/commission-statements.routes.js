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
// 6.1: Fixed file filter to accept PDF regardless of MIME type variations
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
    // 6.1: Accept PDF, images, and common doc formats
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.doc', '.docx', '.xls', '.xlsx', '.csv'];
    const allowedMimes = [
      'application/pdf', 'application/octet-stream',
      'image/png', 'image/jpeg', 'image/gif',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv'
    ];
    if (allowedExts.includes(ext) || allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, image, Word, Excel, and CSV files are allowed'), false);
    }
  },
  limits: { fileSize: 20 * 1024 * 1024 } // 20 MB
});

// ---------------------------------------------------------------------------
// @route   GET /api/commission-statements/agents/search
// @desc    Search agents by name (for admin agent picker with search) (6.4)
// @access  Admin only
// ---------------------------------------------------------------------------
router.get('/agents/search', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { q } = req.query;
    const filter = { role: 'agent', isActive: { $ne: false } };
    if (q && q.trim()) {
      filter.name = { $regex: q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    }
    const agents = await User.find(filter)
      .select('_id name email')
      .sort({ name: 1 })
      .limit(50)
      .lean();
    res.json({ agents });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------------------------------------------------------------------
// @route   POST /api/commission-statements
// @desc    Admin: upload a commission statement for an agent
//          6.1: Fixed upload, 6.2: supports carriers[] array
// @access  Admin only
// ---------------------------------------------------------------------------
router.post('/', authenticate, authorize('admin'), stmtUpload.single('statementFile'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Statement PDF is required' });

    const { agentId, carrier, carriers, payPeriod } = req.body;
    if (!agentId) return res.status(400).json({ message: 'agentId is required' });
    if (!payPeriod) return res.status(400).json({ message: 'payPeriod is required' });

    // 6.2: Accept carriers as JSON array string or comma-separated, or legacy single carrier
    let carriersArr = [];
    if (carriers) {
      try {
        carriersArr = JSON.parse(carriers);
      } catch {
        carriersArr = carriers.split(',').map(c => c.trim()).filter(Boolean);
      }
    } else if (carrier) {
      carriersArr = carrier.split(',').map(c => c.trim()).filter(Boolean);
    }

    const agent = await User.findById(agentId).select('name email');
    if (!agent) return res.status(404).json({ message: 'Agent not found' });

    const stmt = await CommissionStatement.create({
      agent: agentId,
      carrier: carriersArr.join(', '), // legacy field for backward compat
      carriers: carriersArr,
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
//          6.3: Populates notes.addedBy
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
      .populate('notes.addedBy', 'name')
      .sort({ payPeriod: -1 });

    res.json(statements);
  } catch (error) {
    console.error('Error fetching commission statements:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------------------------------------------------------------------
// @route   POST /api/commission-statements/:id/notes
// @desc    Add a note to a commission statement (6.3)
// @access  Admin only
// ---------------------------------------------------------------------------
router.post('/:id/notes', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ message: 'Note text is required' });

    const stmt = await CommissionStatement.findById(req.params.id);
    if (!stmt) return res.status(404).json({ message: 'Statement not found' });

    stmt.notes.push({
      text: text.trim(),
      addedBy: req.user._id,
      addedAt: new Date()
    });
    await stmt.save();

    // Re-populate for response
    await stmt.populate('notes.addedBy', 'name');

    res.json({ message: 'Note added', notes: stmt.notes });
  } catch (error) {
    console.error('Error adding note:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------------------------------------------------------------------
// @route   DELETE /api/commission-statements/:id/notes/:noteId
// @desc    Delete a note from a commission statement (6.3)
// @access  Admin only
// ---------------------------------------------------------------------------
router.delete('/:id/notes/:noteId', authenticate, authorize('admin'), async (req, res) => {
  try {
    const stmt = await CommissionStatement.findById(req.params.id);
    if (!stmt) return res.status(404).json({ message: 'Statement not found' });

    stmt.notes = stmt.notes.filter(n => n._id.toString() !== req.params.noteId);
    await stmt.save();

    res.json({ message: 'Note deleted', notes: stmt.notes });
  } catch (error) {
    console.error('Error deleting note:', error);
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

    // Determine content type from extension
    const extMap = {
      '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.gif': 'image/gif', '.doc': 'application/msword', '.csv': 'text/csv',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    };
    const fileExt = path.extname(stmt.originalFileName || stmt.filePath).toLowerCase();
    const contentType = extMap[fileExt] || 'application/octet-stream';

    res.setHeader('Content-Disposition', `attachment; filename="${stmt.originalFileName || 'statement.pdf'}"`);
    res.setHeader('Content-Type', contentType);
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
