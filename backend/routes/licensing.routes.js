const express = require('express');
const router = express.Router();
const LicensingProgress = require('../models/LicensingProgress');
const User = require('../models/User');
const APAApplication = require('../models/APAApplication');
const { protect: authenticate, authorize } = require('../middleware/auth.middleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/licensing');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `licensing-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|jpg|jpeg|png|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only PDF, JPG, PNG, DOC, and DOCX files are allowed'));
  }
});

// @route   GET /api/licensing
// @desc    Get all licensing progress (admin) or own progress (agent)
// @access  Private
router.get('/', authenticate, async (req, res) => {
  try {
    // If admin, return all agents with their licensing progress
    if (req.user.role === 'admin') {
      // Get all agents
      const agents = await User.find({ role: 'agent', isActive: true })
        .select('name email phone')
        .sort({ name: 1 });
      
      // Get all licensing progress records
      const progressRecords = await LicensingProgress.find()
        .populate('lastUpdatedBy', 'name');
      
      // Map progress to agents
      const progressMap = {};
      progressRecords.forEach(record => {
        progressMap[record.agent.toString()] = record;
      });
      
      // Build result with all agents
      const result = agents.map(agent => {
        const progress = progressMap[agent._id.toString()];
        if (progress) {
          return {
            ...progress.toObject(),
            agent: {
              _id: agent._id,
              name: agent.name,
              email: agent.email,
              phone: agent.phone
            }
          };
        } else {
          // Create default progress object for agents without records
          const enrollmentDate = agent.createdAt || new Date();
          const licensingDeadline = new Date(enrollmentDate);
          licensingDeadline.setDate(licensingDeadline.getDate() + 60);
          
          const now = new Date();
          const diffTime = licensingDeadline - now;
          const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          
          return {
            agent: {
              _id: agent._id,
              name: agent.name,
              email: agent.email,
              phone: agent.phone
            },
            enrollmentDate: enrollmentDate,
            licensingDeadline: licensingDeadline,
            daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
            isLicensed: false,
            completionPercentage: 0,
            checklist: {
              preLicenseCourse: { completed: false },
              stateExam: { scheduled: false, attempts: 0 },
              fingerprinting: { scheduled: false },
              diceApplication: { submitted: false },
              stateAppointment: { approved: false }
            },
            documents: [],
            adminNotes: ''
          };
        }
      });
      
      // Apply filters if provided
      let filteredResult = result;
      if (req.query.isLicensed !== undefined) {
        const isLicensed = req.query.isLicensed === 'true';
        filteredResult = result.filter(r => r.isLicensed === isLicensed);
      }
      
      return res.json(filteredResult);
    }
    
    // For agents, only show own licensing progress
    let query = { agent: req.user._id };
    
    const licensingProgress = await LicensingProgress.find(query)
      .populate('agent', 'name email phone')
      .populate('lastUpdatedBy', 'name')
      .sort({ enrollmentDate: -1 });
    
    res.json(licensingProgress);
  } catch (error) {
    console.error('Error fetching licensing progress:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/licensing/countdown/all
// @desc    Get countdown status for all unlicensed agents
// @access  Admin only
router.get('/countdown/all', authenticate, authorize('admin'), async (req, res) => {
  try {
    const unlicensedAgents = await LicensingProgress.find({ isLicensed: false })
      .populate('agent', 'name email')
      .select('agent enrollmentDate licensingDeadline daysRemaining')
      .sort({ licensingDeadline: 1 });
    
    res.json(unlicensedAgents);
  } catch (error) {
    console.error('Error fetching countdown data:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/licensing/:agentId
// @desc    Get specific agent's licensing progress
// @access  Private
router.get('/:agentId', authenticate, async (req, res) => {
  try {
    // Agents can only view their own, admins can view anyone's
    if (req.user.role !== 'admin' && req.user._id.toString() !== req.params.agentId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    let licensingProgress = await LicensingProgress.findOne({ agent: req.params.agentId })
      .populate('agent', 'name email phone')
      .populate('lastUpdatedBy', 'name')
      .populate('checklist.preLicenseCourse.documents.uploadedBy', 'name')
      .populate('checklist.stateExam.documents.uploadedBy', 'name')
      .populate('checklist.fingerprinting.documents.uploadedBy', 'name')
      .populate('checklist.diceApplication.documents.uploadedBy', 'name')
      .populate('checklist.stateAppointment.documents.uploadedBy', 'name');
    
    if (!licensingProgress) {
      // Auto-create licensing progress if agent exists
      const agent = await User.findById(req.params.agentId);
      if (!agent || agent.role !== 'agent') {
        return res.status(404).json({ message: 'Agent not found' });
      }
      
      // Create with default 30-day deadline
      const enrollmentDate = agent.createdAt || new Date();
      const licensingDeadline = new Date(enrollmentDate);
      licensingDeadline.setDate(licensingDeadline.getDate() + 30);
      
      licensingProgress = new LicensingProgress({
        agent: req.params.agentId,
        enrollmentDate,
        licensingDeadline,
        lastUpdatedBy: req.user._id
      });
      
      await licensingProgress.save();
      
      // Populate after save
      licensingProgress = await LicensingProgress.findById(licensingProgress._id)
        .populate('agent', 'name email phone')
        .populate('lastUpdatedBy', 'name');
    }
    
    // Get license types from APAApplication if it exists
    const apaApplication = await APAApplication.findOne({ user: req.params.agentId });
    let licenseTypes = apaApplication?.licensingStatus?.licenseTypes || [];
    let isCurrentlyLicensed = apaApplication?.licensingStatus?.currentlyLicensed || false;
    
    // Also check the agent's metadata for license information
    const agent = await User.findById(req.params.agentId);
    if (licenseTypes.length === 0 && agent?.metadata) {
      // Check if license info is stored in metadata
      const metadataLicenseTypes = agent.metadata.get('licenseTypes');
      if (metadataLicenseTypes) {
        try {
          licenseTypes = JSON.parse(metadataLicenseTypes);
        } catch (e) {
          // If it's already an array or string, use it directly
          licenseTypes = Array.isArray(metadataLicenseTypes) ? metadataLicenseTypes : [metadataLicenseTypes];
        }
      }
      
      const metadataCurrentlyLicensed = agent.metadata.get('currentlyLicensed');
      if (metadataCurrentlyLicensed) {
        isCurrentlyLicensed = metadataCurrentlyLicensed === 'true' || metadataCurrentlyLicensed === true;
      }
    }
    
    console.log(`License info for user ${req.params.agentId}:`);
    console.log('- Currently Licensed:', isCurrentlyLicensed);
    console.log('- License Types:', licenseTypes);
    
    // Add license types to the response
    const responseData = licensingProgress.toObject();
    // Only include license types if user said they're currently licensed
    responseData.licenseTypes = isCurrentlyLicensed ? licenseTypes : [];
    
    res.json(responseData);
  } catch (error) {
    console.error('Error fetching licensing progress:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/licensing/:agentId
// @desc    Create licensing progress for an agent
// @access  Admin only
router.post('/:agentId', authenticate, authorize('admin'), async (req, res) => {
  try {
    // Check if agent exists
    const agent = await User.findById(req.params.agentId);
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }
    
    // Check if licensing progress already exists
    const existing = await LicensingProgress.findOne({ agent: req.params.agentId });
    if (existing) {
      return res.status(400).json({ message: 'Licensing progress already exists for this agent' });
    }
    
    const enrollmentDate = req.body.enrollmentDate || Date.now();
    const licensingDeadline = new Date(enrollmentDate);
    licensingDeadline.setDate(licensingDeadline.getDate() + 60);
    
    const licensingProgress = new LicensingProgress({
      agent: req.params.agentId,
      enrollmentDate: enrollmentDate,
      licensingDeadline: licensingDeadline,
      lastUpdatedBy: req.user._id
    });
    
    await licensingProgress.save();
    await licensingProgress.populate('agent', 'name email phone');
    
    res.status(201).json(licensingProgress);
  } catch (error) {
    console.error('Error creating licensing progress:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/licensing/:agentId/checklist
// @desc    Update checklist items
// @access  Admin only
router.put('/:agentId/checklist', authenticate, authorize('admin'), async (req, res) => {
  try {
    // Check if agent exists
    const agent = await User.findById(req.params.agentId);
    if (!agent || agent.role !== 'agent') {
      return res.status(404).json({ message: 'Agent not found' });
    }
    
    // Find or create licensing progress
    let licensingProgress = await LicensingProgress.findOne({ agent: req.params.agentId });
    
    if (!licensingProgress) {
      // Auto-create if doesn't exist
      const enrollmentDate = agent.createdAt || Date.now();
      const licensingDeadline = new Date(enrollmentDate);
      licensingDeadline.setDate(licensingDeadline.getDate() + 60);
      
      licensingProgress = new LicensingProgress({
        agent: req.params.agentId,
        enrollmentDate: enrollmentDate,
        licensingDeadline: licensingDeadline,
        lastUpdatedBy: req.user._id
      });
    }
    
    const { checklistItem, data } = req.body;
    
    // Update specific checklist item
    if (checklistItem && licensingProgress.checklist[checklistItem]) {
      Object.assign(licensingProgress.checklist[checklistItem], data);
      
      // If marking as completed/scheduled/approved, set date
      if (checklistItem === 'preLicenseCourse' && data.completed) {
        licensingProgress.checklist[checklistItem].completedDate = data.completedDate || Date.now();
      }
      if (checklistItem === 'stateExam' && data.scheduled) {
        licensingProgress.checklist[checklistItem].scheduledDate = data.scheduledDate || Date.now();
      }
      if (checklistItem === 'fingerprinting' && data.scheduled) {
        licensingProgress.checklist[checklistItem].appointmentDate = data.appointmentDate || Date.now();
      }
      if (checklistItem === 'diceApplication' && data.submitted) {
        licensingProgress.checklist[checklistItem].submittedDate = data.submittedDate || Date.now();
      }
      if (checklistItem === 'stateAppointment' && data.approved) {
        licensingProgress.checklist[checklistItem].approvedDate = data.approvedDate || Date.now();
        // Mark as licensed when final step is approved
        licensingProgress.isLicensed = true;
        licensingProgress.licenseObtainedDate = Date.now();
      }
    }
    
    licensingProgress.lastUpdatedBy = req.user._id;
    await licensingProgress.save();
    await licensingProgress.populate('agent', 'name email phone');
    
    res.json(licensingProgress);
  } catch (error) {
    console.error('Error updating checklist:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/licensing/:agentId/upload/:checklistItem
// @desc    Upload document for checklist item
// @access  Admin only
router.post('/:agentId/upload/:checklistItem', 
  authenticate, 
  authorize('admin'), 
  upload.single('document'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }
      
      // Check if agent exists
      const agent = await User.findById(req.params.agentId);
      if (!agent || agent.role !== 'agent') {
        return res.status(404).json({ message: 'Agent not found' });
      }
      
      // Find or create licensing progress
      let licensingProgress = await LicensingProgress.findOne({ agent: req.params.agentId });
      
      if (!licensingProgress) {
        // Auto-create if doesn't exist
        const enrollmentDate = agent.createdAt || Date.now();
        const licensingDeadline = new Date(enrollmentDate);
        licensingDeadline.setDate(licensingDeadline.getDate() + 60);
        
        licensingProgress = new LicensingProgress({
          agent: req.params.agentId,
          enrollmentDate: enrollmentDate,
          licensingDeadline: licensingDeadline,
          lastUpdatedBy: req.user._id
        });
      }
      
      const checklistItem = req.params.checklistItem;
      
      if (!licensingProgress.checklist[checklistItem]) {
        return res.status(400).json({ message: 'Invalid checklist item' });
      }
      
      // Add document to checklist item
      const document = {
        filename: req.file.originalname,
        url: `/uploads/licensing/${req.file.filename}`,
        uploadedAt: Date.now(),
        uploadedBy: req.user._id
      };
      
      licensingProgress.checklist[checklistItem].documents.push(document);
      licensingProgress.lastUpdatedBy = req.user._id;
      
      await licensingProgress.save();
      await licensingProgress.populate('agent', 'name email phone');
      
      res.json({
        message: 'Document uploaded successfully',
        document,
        licensingProgress
      });
    } catch (error) {
      console.error('Error uploading document:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// @route   PUT /api/licensing/:agentId/notes
// @desc    Update admin notes
// @access  Admin only
router.put('/:agentId/notes', authenticate, authorize('admin'), async (req, res) => {
  try {
    // Check if agent exists
    const agent = await User.findById(req.params.agentId);
    if (!agent || agent.role !== 'agent') {
      return res.status(404).json({ message: 'Agent not found' });
    }
    
    // Find or create licensing progress
    let licensingProgress = await LicensingProgress.findOne({ agent: req.params.agentId });
    
    if (!licensingProgress) {
      // Auto-create if doesn't exist
      const enrollmentDate = agent.createdAt || Date.now();
      const licensingDeadline = new Date(enrollmentDate);
      licensingDeadline.setDate(licensingDeadline.getDate() + 60);
      
      licensingProgress = new LicensingProgress({
        agent: req.params.agentId,
        enrollmentDate: enrollmentDate,
        licensingDeadline: licensingDeadline,
        lastUpdatedBy: req.user._id
      });
    }
    
    licensingProgress.adminNotes = req.body.adminNotes;
    licensingProgress.lastUpdatedBy = req.user._id;
    
    await licensingProgress.save();
    await licensingProgress.populate('agent', 'name email phone');
    
    res.json(licensingProgress);
  } catch (error) {
    console.error('Error updating admin notes:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
