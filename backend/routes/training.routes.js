const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');
const TrainingMaterial = require('../models/TrainingMaterial');
const { protect, authorize } = require('../middleware/auth.middleware');
const { validateRequest, schemas } = require('../middleware/validation.middleware');
const { logAction } = require('../middleware/audit.middleware');
const { sendResponse, errorResponse, paginate } = require('../utils/helpers');

// Configure multer for training PDF uploads
const pdfStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/training-pdfs');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `training-pdf-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const uploadPdf = multer({
  storage: pdfStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() === '.pdf' || file.mimetype === 'application/pdf') {
      return cb(null, true);
    }
    cb(new Error('Only PDF files are allowed'));
  }
});

// @route   GET /api/training/materials
// @desc    Get all training materials (filtered by access level)
// @access  Private
router.get('/materials', protect, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const category = req.query.category;
    const type = req.query.type;
    
    const filter = { isActive: true };
    
    // Filter by access level based on user role
    if (req.user.role === 'recruit') {
      filter.accessLevel = { $in: ['all', 'recruit'] };
    } else if (req.user.role === 'agent') {
      filter.accessLevel = { $in: ['all', 'agent', 'recruit'] };
    }
    // Admin sees all
    
    if (category) filter.category = category;
    if (type) filter.type = type;
    
    const query = TrainingMaterial.find(filter)
      .populate('uploadedBy', 'name role')
      .sort('order -createdAt');
    
    const materials = await paginate(query, page, limit);
    const total = await TrainingMaterial.countDocuments(filter);
    
    sendResponse(res, 200, {
      materials,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/training/materials/:id
// @desc    Get single training material
// @access  Private
router.get('/materials/:id', protect, async (req, res) => {
  try {
    const material = await TrainingMaterial.findById(req.params.id)
      .populate('uploadedBy', 'name role');
    
    if (!material) {
      return sendResponse(res, 404, { message: 'Training material not found' });
    }
    
    // Check access level
    if (req.user.role === 'recruit' && !['all', 'recruit'].includes(material.accessLevel)) {
      return sendResponse(res, 403, { message: 'Access denied' });
    }
    
    if (req.user.role === 'agent' && !['all', 'agent', 'recruit'].includes(material.accessLevel)) {
      return sendResponse(res, 403, { message: 'Access denied' });
    }
    
    sendResponse(res, 200, { material });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/training/categories
// @desc    Get all unique categories
// @access  Private
router.get('/categories', protect, async (req, res) => {
  try {
    const categories = await TrainingMaterial.distinct('category', { isActive: true });
    sendResponse(res, 200, { categories });
  } catch (error) {
    errorResponse(res, error);
  }
});

// Admin-only routes
router.use(protect);
router.use(authorize('admin'));

// @route   POST /api/training/materials
// @desc    Create training material
// @access  Private (Admin only)
router.post('/materials', validateRequest(schemas.trainingMaterial), logAction('CREATE_TRAINING_MATERIAL'), async (req, res) => {
  try {
    const material = await TrainingMaterial.create({
      ...req.body,
      uploadedBy: req.user._id
    });
    
    sendResponse(res, 201, {
      message: 'Training material created successfully',
      material
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   PUT /api/training/materials/:id
// @desc    Update training material
// @access  Private (Admin only)
router.put('/materials/:id', validateRequest(schemas.updateTrainingMaterial), logAction('UPDATE_TRAINING_MATERIAL'), async (req, res) => {
  try {
    const material = await TrainingMaterial.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!material) {
      return sendResponse(res, 404, { message: 'Training material not found' });
    }
    
    sendResponse(res, 200, {
      message: 'Training material updated successfully',
      material
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/training/materials/:id/pdf
// @desc    Upload or replace PDF attachment for a training material
// @access  Private (Admin only)
router.post('/materials/:id/pdf', uploadPdf.single('pdf'), logAction('UPLOAD_TRAINING_PDF'), async (req, res) => {
  try {
    if (!req.file) {
      return sendResponse(res, 400, { message: 'No PDF file uploaded' });
    }

    const material = await TrainingMaterial.findById(req.params.id);
    if (!material) {
      return sendResponse(res, 404, { message: 'Training material not found' });
    }

    // Delete old PDF file if it exists
    if (material.pdfAttachment?.filePath) {
      const oldPath = path.join(__dirname, '..', material.pdfAttachment.filePath);
      try { await fs.unlink(oldPath); } catch (_) { /* ignore if not found */ }
    }

    material.pdfAttachment = {
      fileName: req.file.originalname,
      filePath: `/uploads/training-pdfs/${req.file.filename}`,
      uploadedAt: new Date()
    };

    await material.save();

    sendResponse(res, 200, {
      message: 'PDF uploaded successfully',
      pdfAttachment: material.pdfAttachment,
      material
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   DELETE /api/training/materials/:id/pdf
// @desc    Remove PDF attachment from training material
// @access  Private (Admin only)
router.delete('/materials/:id/pdf', logAction('DELETE_TRAINING_PDF'), async (req, res) => {
  try {
    const material = await TrainingMaterial.findById(req.params.id);
    if (!material) {
      return sendResponse(res, 404, { message: 'Training material not found' });
    }

    if (material.pdfAttachment?.filePath) {
      const filePath = path.join(__dirname, '..', material.pdfAttachment.filePath);
      try { await fs.unlink(filePath); } catch (_) { /* ignore */ }
    }

    material.pdfAttachment = undefined;
    await material.save();

    sendResponse(res, 200, { message: 'PDF attachment removed successfully' });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   DELETE /api/training/materials/:id
// @desc    Delete training material (soft delete)
// @access  Private (Admin only)
router.delete('/materials/:id', logAction('DELETE_TRAINING_MATERIAL'), async (req, res) => {
  try {
    const material = await TrainingMaterial.findById(req.params.id);
    
    if (!material) {
      return sendResponse(res, 404, { message: 'Training material not found' });
    }
    
    material.isActive = false;
    await material.save();
    
    sendResponse(res, 200, {
      message: 'Training material deleted successfully'
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

module.exports = router;
