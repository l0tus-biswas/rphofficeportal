const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');
const TrainingMaterial = require('../models/TrainingMaterial');
const TrainingCategory = require('../models/TrainingCategory');
const TrainingFolder = require('../models/TrainingFolder');
const { protect, authorize } = require('../middleware/auth.middleware');
const { validateRequest, schemas } = require('../middleware/validation.middleware');
const { logAction } = require('../middleware/audit.middleware');
const { sendResponse, errorResponse, paginate } = require('../utils/helpers');

/**
 * Auto-detect content type from URL.
 * Returns the detected type or the provided fallback.
 */
function detectContentType(url, fallbackType) {
  if (!url) return fallbackType || 'other';

  const lower = url.toLowerCase();

  // YouTube
  if (/(?:youtube\.com\/watch|youtu\.be\/|youtube\.com\/embed\/)/.test(lower)) {
    return 'youtube';
  }
  // Loom
  if (/loom\.com\/share\//.test(lower)) {
    return 'loom';
  }
  // Vimeo
  if (/vimeo\.com\/\d+/.test(lower)) {
    return 'video';
  }
  // PDF document (URL ending in .pdf or containing common PDF patterns)
  if (/\.pdf(\?.*)?$/.test(lower)) {
    return 'document';
  }
  // Common document extensions
  if (/\.(docx?|xlsx?|pptx?|txt|csv)(\?.*)?$/.test(lower)) {
    return 'document';
  }
  // Article platforms
  if (/medium\.com|blog\.|wordpress\.com|substack\.com/.test(lower)) {
    return 'article';
  }

  return fallbackType || 'link';
}

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

// Configure multer for folder thumbnail uploads
const thumbnailStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/training-thumbnails');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `folder-thumb-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const uploadThumbnail = multer({
  storage: thumbnailStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|jpg|png|gif|webp|svg\+xml)$/.test(file.mimetype)) {
      return cb(null, true);
    }
    cb(new Error('Only image files (JPEG, PNG, GIF, WebP, SVG) are allowed'));
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
    const folder = req.query.folder;
    
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
    if (folder) {
      filter.folder = folder === 'none' ? null : folder;
    }
    
    const query = TrainingMaterial.find(filter)
      .populate('uploadedBy', 'name role')
      .populate('folder', 'name parent')
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
// @desc    Get all categories
// @access  Private
router.get('/categories', protect, async (req, res) => {
  try {
    const categories = await TrainingCategory.find({ isActive: true })
      .sort('order name');
    sendResponse(res, 200, { categories });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/training/folders
// @desc    Get all folders (tree structure)
// @access  Private
router.get('/folders', protect, async (req, res) => {
  try {
    const folders = await TrainingFolder.find({ isActive: true })
      .populate('parent', 'name')
      .sort('order name');
    sendResponse(res, 200, { folders });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/training/folders/:id/contents
// @desc    Get folder contents (subfolders + materials)
// @access  Private
router.get('/folders/:id/contents', protect, async (req, res) => {
  try {
    const folderId = req.params.id;
    
    const subfolders = await TrainingFolder.find({
      parent: folderId,
      isActive: true
    }).sort('order name');
    
    const materialFilter = { folder: folderId, isActive: true };
    if (req.user.role === 'recruit') {
      materialFilter.accessLevel = { $in: ['all', 'recruit'] };
    } else if (req.user.role === 'agent') {
      materialFilter.accessLevel = { $in: ['all', 'agent', 'recruit'] };
    }
    
    const materials = await TrainingMaterial.find(materialFilter)
      .populate('uploadedBy', 'name role')
      .populate('folder', 'name')
      .sort('order -createdAt');
    
    const folder = await TrainingFolder.findById(folderId)
      .populate('parent', 'name');
    
    sendResponse(res, 200, { folder, subfolders, materials });
  } catch (error) {
    errorResponse(res, error);
  }
});

// Admin-only routes
router.use(protect);
router.use(authorize('admin'));

// ========== CATEGORY CRUD (Admin) ==========

// @route   POST /api/training/categories
// @desc    Create a category
// @access  Private (Admin only)
router.post('/categories', logAction('CREATE_TRAINING_CATEGORY'), async (req, res) => {
  try {
    const { name, description, order } = req.body;
    if (!name || !name.trim()) {
      return sendResponse(res, 400, { message: 'Category name is required' });
    }
    const existing = await TrainingCategory.findOne({ name: name.trim(), isActive: true });
    if (existing) {
      return sendResponse(res, 400, { message: 'Category with this name already exists' });
    }
    const category = await TrainingCategory.create({
      name: name.trim(),
      description: description?.trim() || '',
      order: order || 0,
      createdBy: req.user._id
    });
    sendResponse(res, 201, { message: 'Category created successfully', category });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   PUT /api/training/categories/:id
// @desc    Update a category
// @access  Private (Admin only)
router.put('/categories/:id', logAction('UPDATE_TRAINING_CATEGORY'), async (req, res) => {
  try {
    const { name, description, order } = req.body;
    const category = await TrainingCategory.findById(req.params.id);
    if (!category || !category.isActive) {
      return sendResponse(res, 404, { message: 'Category not found' });
    }
    if (name) {
      const existing = await TrainingCategory.findOne({
        name: name.trim(),
        isActive: true,
        _id: { $ne: req.params.id }
      });
      if (existing) {
        return sendResponse(res, 400, { message: 'Category with this name already exists' });
      }
      // Update all materials that used the old category name
      await TrainingMaterial.updateMany(
        { category: category.name },
        { category: name.trim() }
      );
      category.name = name.trim();
    }
    if (description !== undefined) category.description = description.trim();
    if (order !== undefined) category.order = order;
    await category.save();
    sendResponse(res, 200, { message: 'Category updated successfully', category });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   DELETE /api/training/categories/:id
// @desc    Delete a category (soft delete)
// @access  Private (Admin only)
router.delete('/categories/:id', logAction('DELETE_TRAINING_CATEGORY'), async (req, res) => {
  try {
    const category = await TrainingCategory.findById(req.params.id);
    if (!category || !category.isActive) {
      return sendResponse(res, 404, { message: 'Category not found' });
    }
    // Move materials in this category to 'General'
    await TrainingMaterial.updateMany(
      { category: category.name },
      { category: 'General' }
    );
    category.isActive = false;
    await category.save();
    sendResponse(res, 200, { message: 'Category deleted successfully' });
  } catch (error) {
    errorResponse(res, error);
  }
});

// ========== FOLDER CRUD (Admin) ==========

// @route   POST /api/training/folders
// @desc    Create a folder
// @access  Private (Admin only)
router.post('/folders', logAction('CREATE_TRAINING_FOLDER'), async (req, res) => {
  try {
    const { name, description, parent, order } = req.body;
    if (!name || !name.trim()) {
      return sendResponse(res, 400, { message: 'Folder name is required' });
    }
    // Validate parent exists if provided
    if (parent) {
      const parentFolder = await TrainingFolder.findById(parent);
      if (!parentFolder || !parentFolder.isActive) {
        return sendResponse(res, 400, { message: 'Parent folder not found' });
      }
    }
    const folder = await TrainingFolder.create({
      name: name.trim(),
      description: description?.trim() || '',
      parent: parent || null,
      order: order || 0,
      createdBy: req.user._id
    });
    sendResponse(res, 201, { message: 'Folder created successfully', folder });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   PUT /api/training/folders/:id
// @desc    Update a folder
// @access  Private (Admin only)
router.put('/folders/:id', logAction('UPDATE_TRAINING_FOLDER'), async (req, res) => {
  try {
    const { name, description, parent, order } = req.body;
    const folder = await TrainingFolder.findById(req.params.id);
    if (!folder || !folder.isActive) {
      return sendResponse(res, 404, { message: 'Folder not found' });
    }
    // Prevent making a folder its own parent
    if (parent && parent === req.params.id) {
      return sendResponse(res, 400, { message: 'A folder cannot be its own parent' });
    }
    if (parent) {
      const parentFolder = await TrainingFolder.findById(parent);
      if (!parentFolder || !parentFolder.isActive) {
        return sendResponse(res, 400, { message: 'Parent folder not found' });
      }
      // Prevent creating a cycle by reparenting under one of this folder's own descendants
      let ancestor = parentFolder;
      while (ancestor?.parent) {
        if (String(ancestor.parent) === String(folder._id)) {
          return sendResponse(res, 400, { message: 'Cannot move a folder into one of its own subfolders' });
        }
        ancestor = await TrainingFolder.findById(ancestor.parent);
      }
    }
    if (name) folder.name = name.trim();
    if (description !== undefined) folder.description = description.trim();
    if (parent !== undefined) folder.parent = parent || null;
    if (order !== undefined) folder.order = order;
    await folder.save();
    sendResponse(res, 200, { message: 'Folder updated successfully', folder });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   DELETE /api/training/folders/:id
// @desc    Delete a folder (soft delete). Moves contents to parent/root.
// @access  Private (Admin only)
router.delete('/folders/:id', logAction('DELETE_TRAINING_FOLDER'), async (req, res) => {
  try {
    const folder = await TrainingFolder.findById(req.params.id);
    if (!folder || !folder.isActive) {
      return sendResponse(res, 404, { message: 'Folder not found' });
    }
    // Move child folders up to this folder's parent
    await TrainingFolder.updateMany(
      { parent: folder._id, isActive: true },
      { parent: folder.parent }
    );
    // Move materials up to this folder's parent
    await TrainingMaterial.updateMany(
      { folder: folder._id },
      { folder: folder.parent }
    );
    folder.isActive = false;
    await folder.save();
    sendResponse(res, 200, { message: 'Folder deleted successfully' });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/training/folders/:id/thumbnail
// @desc    Upload or replace folder thumbnail image
// @access  Private (Admin only)
router.post('/folders/:id/thumbnail', uploadThumbnail.single('thumbnail'), logAction('UPDATE_FOLDER_THUMBNAIL'), async (req, res) => {
  try {
    const folder = await TrainingFolder.findById(req.params.id);
    if (!folder || !folder.isActive) {
      return sendResponse(res, 404, { message: 'Folder not found' });
    }
    if (!req.file) {
      return sendResponse(res, 400, { message: 'No image file provided' });
    }
    // Delete old thumbnail if it exists
    if (folder.thumbnail) {
      const oldPath = path.join(__dirname, '..', folder.thumbnail);
      try { await fs.unlink(oldPath); } catch (e) { /* ignore if missing */ }
    }
    folder.thumbnail = `/uploads/training-thumbnails/${req.file.filename}`;
    await folder.save();
    sendResponse(res, 200, { message: 'Thumbnail uploaded successfully', folder });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   DELETE /api/training/folders/:id/thumbnail
// @desc    Remove folder thumbnail
// @access  Private (Admin only)
router.delete('/folders/:id/thumbnail', logAction('DELETE_FOLDER_THUMBNAIL'), async (req, res) => {
  try {
    const folder = await TrainingFolder.findById(req.params.id);
    if (!folder || !folder.isActive) {
      return sendResponse(res, 404, { message: 'Folder not found' });
    }
    if (folder.thumbnail) {
      const oldPath = path.join(__dirname, '..', folder.thumbnail);
      try { await fs.unlink(oldPath); } catch (e) { /* ignore if missing */ }
      folder.thumbnail = null;
      await folder.save();
    }
    sendResponse(res, 200, { message: 'Thumbnail removed', folder });
  } catch (error) {
    errorResponse(res, error);
  }
});

// ========== MATERIAL THUMBNAIL ==========

// @route   POST /api/training/materials/:id/thumbnail
// @desc    Upload or replace material thumbnail image
// @access  Private (Admin only)
router.post('/materials/:id/thumbnail', uploadThumbnail.single('thumbnail'), logAction('UPDATE_MATERIAL_THUMBNAIL'), async (req, res) => {
  try {
    const material = await TrainingMaterial.findById(req.params.id);
    if (!material || !material.isActive) {
      return sendResponse(res, 404, { message: 'Material not found' });
    }
    if (!req.file) {
      return sendResponse(res, 400, { message: 'No image file provided' });
    }
    // Delete old thumbnail if it exists
    if (material.thumbnail) {
      const oldPath = path.join(__dirname, '..', material.thumbnail);
      try { await fs.unlink(oldPath); } catch (e) { /* ignore if missing */ }
    }
    material.thumbnail = `/uploads/training-thumbnails/${req.file.filename}`;
    await material.save();
    sendResponse(res, 200, { message: 'Thumbnail uploaded successfully', material });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   DELETE /api/training/materials/:id/thumbnail
// @desc    Remove material thumbnail
// @access  Private (Admin only)
router.delete('/materials/:id/thumbnail', logAction('DELETE_MATERIAL_THUMBNAIL'), async (req, res) => {
  try {
    const material = await TrainingMaterial.findById(req.params.id);
    if (!material || !material.isActive) {
      return sendResponse(res, 404, { message: 'Material not found' });
    }
    if (material.thumbnail) {
      const oldPath = path.join(__dirname, '..', material.thumbnail);
      try { await fs.unlink(oldPath); } catch (e) { /* ignore if missing */ }
      material.thumbnail = null;
      await material.save();
    }
    sendResponse(res, 200, { message: 'Thumbnail removed', material });
  } catch (error) {
    errorResponse(res, error);
  }
});

// ========== MATERIAL CRUD (Admin) ==========

// @route   POST /api/training/materials
// @desc    Create training material
// @access  Private (Admin only)
router.post('/materials', validateRequest(schemas.trainingMaterial), logAction('CREATE_TRAINING_MATERIAL'), async (req, res) => {
  try {
    // Auto-detect content type from URL
    const detectedType = detectContentType(req.body.url, req.body.type);
    const material = await TrainingMaterial.create({
      ...req.body,
      type: detectedType,
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
    const existing = await TrainingMaterial.findById(req.params.id);
    if (!existing || !existing.isActive) {
      return sendResponse(res, 404, { message: 'Training material not found' });
    }

    // Auto-detect content type if URL is being updated
    const updateData = { ...req.body };
    if (updateData.url) {
      updateData.type = detectContentType(updateData.url, updateData.type);
    }

    const material = await TrainingMaterial.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    sendResponse(res, 200, {
      message: 'Training material updated successfully',
      material
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/training/materials/:id/pdf
// @desc    Upload one or more PDF attachments for a training material (added to existing ones)
// @access  Private (Admin only)
router.post('/materials/:id/pdf', uploadPdf.array('pdf', 10), logAction('UPLOAD_TRAINING_PDF'), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return sendResponse(res, 400, { message: 'No PDF file uploaded' });
    }

    const material = await TrainingMaterial.findById(req.params.id);
    if (!material || !material.isActive) {
      return sendResponse(res, 404, { message: 'Training material not found' });
    }

    const newAttachments = req.files.map(file => ({
      fileName: file.originalname,
      filePath: `/uploads/training-pdfs/${file.filename}`,
      uploadedAt: new Date()
    }));
    material.pdfAttachments.push(...newAttachments);

    await material.save();

    sendResponse(res, 200, {
      message: 'PDF(s) uploaded successfully',
      pdfAttachments: material.pdfAttachments,
      material
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   DELETE /api/training/materials/:id/pdf/:attachmentId
// @desc    Remove a single PDF attachment from a training material
// @access  Private (Admin only)
router.delete('/materials/:id/pdf/:attachmentId', logAction('DELETE_TRAINING_PDF'), async (req, res) => {
  try {
    const material = await TrainingMaterial.findById(req.params.id);
    if (!material || !material.isActive) {
      return sendResponse(res, 404, { message: 'Training material not found' });
    }

    const attachment = material.pdfAttachments.id(req.params.attachmentId);
    if (!attachment) {
      return sendResponse(res, 404, { message: 'Attachment not found' });
    }

    const filePath = path.join(__dirname, '..', attachment.filePath);
    try { await fs.unlink(filePath); } catch (_) { /* ignore */ }

    attachment.deleteOne();
    await material.save();

    sendResponse(res, 200, { message: 'PDF attachment removed successfully', material });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   DELETE /api/training/materials/:id/pdf
// @desc    Remove the legacy single PDF attachment from a training material
// @access  Private (Admin only)
router.delete('/materials/:id/pdf', logAction('DELETE_TRAINING_PDF'), async (req, res) => {
  try {
    const material = await TrainingMaterial.findById(req.params.id);
    if (!material || !material.isActive) {
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

// @route   POST /api/training/materials/fix-types
// @desc    Re-detect and fix content types for all existing materials based on URL
// @access  Private (Admin only)
router.post('/materials/fix-types', logAction('FIX_TRAINING_TYPES'), async (req, res) => {
  try {
    const materials = await TrainingMaterial.find({ isActive: true });
    let fixed = 0;
    const changes = [];

    for (const material of materials) {
      const detected = detectContentType(material.url, material.type);
      if (detected !== material.type) {
        changes.push({
          id: material._id,
          title: material.title,
          oldType: material.type,
          newType: detected
        });
        material.type = detected;
        await material.save();
        fixed++;
      }
    }

    sendResponse(res, 200, {
      message: `Fixed ${fixed} of ${materials.length} materials`,
      fixed,
      total: materials.length,
      changes
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

module.exports = router;
