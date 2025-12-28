const express = require('express');
const router = express.Router();
const ProductionSubmission = require('../models/ProductionSubmission');
const Carrier = require('../models/Carrier');
const User = require('../models/User');
const { protect: authenticate, authorize } = require('../middleware/auth.middleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

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
// @desc    Get production submissions with filtering
// @access  Private
router.get('/', authenticate, async (req, res) => {
  try {
    let query = {};
    
    // If not admin, only show own submissions
    if (req.user.role !== 'admin') {
      query.agent = req.user._id;
    }
    
    // Apply filters
    if (req.query.agentId) {
      query.agent = req.query.agentId;
    }
    if (req.query.productSold) {
      query.productSold = req.query.productSold;
    }
    if (req.query.carrier) {
      query.carrier = req.query.carrier;
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
    
    res.json({
      submissions,
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
      productSold,
      productOtherDescription,
      carrier,
      premiumAmount,
      notes
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
    
    // Verify carrier exists
    const carrierExists = await Carrier.findById(carrier);
    if (!carrierExists) {
      return res.status(400).json({ message: 'Invalid carrier' });
    }
    
    const submission = new ProductionSubmission({
      agent: req.user._id,
      submissionDate: submissionDate || Date.now(),
      clientName,
      productSold,
      productOtherDescription,
      carrier,
      premiumAmount,
      notes
    });
    
    await submission.save();
    await submission.populate('agent', 'name email');
    await submission.populate('carrier', 'name');
    
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
      productSold,
      productOtherDescription,
      carrier,
      premiumAmount,
      notes,
      status
    } = req.body;
    
    // Update fields
    if (submissionDate) submission.submissionDate = submissionDate;
    if (clientName) submission.clientName = clientName;
    if (productSold) submission.productSold = productSold;
    if (productOtherDescription !== undefined) submission.productOtherDescription = productOtherDescription;
    if (carrier) submission.carrier = carrier;
    if (premiumAmount !== undefined) submission.premiumAmount = premiumAmount;
    if (notes !== undefined) submission.notes = notes;
    
    // Only admins can change status
    if (status && req.user.role === 'admin') {
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
    
    const { status, reviewNotes } = req.body;
    
    submission.status = status || submission.status;
    submission.reviewNotes = reviewNotes;
    submission.reviewedBy = req.user._id;
    submission.reviewedAt = Date.now();
    
    await submission.save();
    await submission.populate('agent', 'name email');
    await submission.populate('carrier', 'name');
    await submission.populate('reviewedBy', 'name');
    
    res.json(submission);
  } catch (error) {
    console.error('Error reviewing production submission:', error);
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

module.exports = router;
