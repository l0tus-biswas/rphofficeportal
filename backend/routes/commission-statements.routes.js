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

// Multer error handler wrapper
const handleMulterError = (upload) => (req, res, next) => {
  upload(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'File too large. Maximum size is 20MB.' });
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ message: 'Too many files. Maximum 20 files per upload.' });
      }
      return res.status(400).json({ message: err.message || 'File upload error' });
    }
    next();
  });
};

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
// @desc    Admin: upload commission statement(s) for an agent
//          Supports multiple files in a single upload
// @access  Admin only
// ---------------------------------------------------------------------------
router.post('/', authenticate, authorize('admin'), handleMulterError(stmtUpload.array('statementFile', 20)), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ message: 'At least one file is required' });

    const { agentId, carrier, carriers, payPeriod, notes } = req.body;
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

    // Parse initial notes if provided
    let initialNotes = [];
    if (notes && notes.trim()) {
      initialNotes = [{ text: notes.trim(), addedBy: req.user._id, addedAt: new Date() }];
    }

    // Create a statement record for each uploaded file
    const created = [];
    for (const file of req.files) {
      const stmt = await CommissionStatement.create({
        agent: agentId,
        carrier: carriersArr.join(', '),
        carriers: carriersArr,
        payPeriod: new Date(payPeriod),
        filePath: `uploads/commission-statements/${file.filename}`,
        originalFileName: file.originalname,
        uploadedBy: req.user._id,
        notes: initialNotes
      });
      created.push(stmt);
    }

    res.status(201).json({
      message: `${created.length} commission statement(s) uploaded`,
      statements: created
    });
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
// @route   PUT /api/commission-statements/:id/notes/:noteId
// @desc    Edit an existing note on a commission statement
// @access  Admin only
// ---------------------------------------------------------------------------
router.put('/:id/notes/:noteId', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ message: 'Note text is required' });

    const stmt = await CommissionStatement.findById(req.params.id);
    if (!stmt) return res.status(404).json({ message: 'Statement not found' });

    const note = stmt.notes.id(req.params.noteId);
    if (!note) return res.status(404).json({ message: 'Note not found' });

    note.text = text.trim();
    await stmt.save();

    // Re-populate for response
    await stmt.populate('notes.addedBy', 'name');

    res.json({ message: 'Note updated', notes: stmt.notes });
  } catch (error) {
    console.error('Error editing note:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------------------------------------------------------------------
// @route   GET /api/commission-statements/:id/notes
// @desc    Get notes for a commission statement (agent can view their own)
// @access  Private (agent can only access own; admin can access any)
// ---------------------------------------------------------------------------
router.get('/:id/notes', authenticate, async (req, res) => {
  try {
    const stmt = await CommissionStatement.findById(req.params.id)
      .populate('notes.addedBy', 'name');
    if (!stmt) return res.status(404).json({ message: 'Statement not found' });

    // Access control: agents can only view notes on their own statements
    if (req.user.role !== 'admin' && stmt.agent.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({ notes: stmt.notes });
  } catch (error) {
    console.error('Error fetching notes:', error);
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

    // Encode filename for Content-Disposition (handles special characters)
    const fileName = stmt.originalFileName || 'statement.pdf';
    const encodedFileName = encodeURIComponent(fileName).replace(/'/g, '%27');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/[^\x20-\x7E]/g, '_')}"; filename*=UTF-8''${encodedFileName}`);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error('Error downloading statement:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------------------------------------------------------------------
// @route   PUT /api/commission-statements/:id
// @desc    Admin: edit a commission statement (agent, carriers, payPeriod, notes, file)
// @access  Admin only
// ---------------------------------------------------------------------------
router.put('/:id', authenticate, authorize('admin'), handleMulterError(stmtUpload.single('statementFile')), async (req, res) => {
  try {
    const stmt = await CommissionStatement.findById(req.params.id);
    if (!stmt) return res.status(404).json({ message: 'Statement not found' });

    const { agentId, carrier, carriers, payPeriod, notes } = req.body;

    // Update agent if provided
    if (agentId) {
      const agent = await User.findById(agentId).select('name email');
      if (!agent) return res.status(404).json({ message: 'Agent not found' });
      stmt.agent = agentId;
    }

    // Update carriers
    if (carriers !== undefined) {
      let carriersArr = [];
      try {
        carriersArr = JSON.parse(carriers);
      } catch {
        carriersArr = carriers.split(',').map(c => c.trim()).filter(Boolean);
      }
      stmt.carriers = carriersArr;
      stmt.carrier = carriersArr.join(', ');
    } else if (carrier !== undefined) {
      const carriersArr = carrier.split(',').map(c => c.trim()).filter(Boolean);
      stmt.carriers = carriersArr;
      stmt.carrier = carrier;
    }

    // Update pay period
    if (payPeriod) {
      stmt.payPeriod = new Date(payPeriod);
    }

    // Update/add notes
    if (notes !== undefined && notes.trim()) {
      stmt.notes.push({ text: notes.trim(), addedBy: req.user._id, addedAt: new Date() });
    }

    // Replace file if a new one is uploaded
    if (req.file) {
      // Remove old file
      const oldPath = path.join(__dirname, '..', stmt.filePath);
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch (e) { /* ignore */ }
      }
      stmt.filePath = `uploads/commission-statements/${req.file.filename}`;
      stmt.originalFileName = req.file.originalname;
    }

    await stmt.save();

    // Populate for response
    await stmt.populate('agent', 'name email');
    await stmt.populate('uploadedBy', 'name');
    await stmt.populate('notes.addedBy', 'name');

    res.json({ message: 'Statement updated', statement: stmt });
  } catch (error) {
    console.error('Error updating commission statement:', error);
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
