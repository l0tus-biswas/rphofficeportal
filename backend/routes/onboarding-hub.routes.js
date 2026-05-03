const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const OnboardingDocType = require('../models/OnboardingDocType');
const OnboardingDocument = require('../models/OnboardingDocument');
const AuditLog = require('../models/AuditLog');
const { protect: authenticate, authorize } = require('../middleware/auth.middleware');

// ---------------------------------------------------------------------------
// Multer — onboarding document uploads
// ---------------------------------------------------------------------------
const docDir = path.join(__dirname, '../uploads/onboarding-docs');
if (!fs.existsSync(docDir)) fs.mkdirSync(docDir, { recursive: true });

const docStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, docDir),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  }
});
const docUpload = multer({
  storage: docStorage,
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PDF and image files are allowed'), false);
  },
  limits: { fileSize: 15 * 1024 * 1024 } // 15 MB
});

// ---------------------------------------------------------------------------
// Helper: log audit event
// ---------------------------------------------------------------------------
async function auditLog(actor, targetAgent, action, details) {
  try {
    await AuditLog.create({
      performedBy: actor,
      targetUser: targetAgent,
      action,
      details: details instanceof Map ? details : new Map(Object.entries(details || {})),
      timestamp: new Date()
    });
  } catch (e) { /* non-blocking */ }
}

// ---------------------------------------------------------------------------
// @route   GET /api/onboarding-hub/doc-types
// @desc    List all active document types
// @access  Private
// ---------------------------------------------------------------------------
router.get('/doc-types', authenticate, async (req, res) => {
  try {
    const query = { isActive: true };
    // Admin sees all including inactive
    if (req.user.role === 'admin' && req.query.all === 'true') delete query.isActive;

    const docTypes = await OnboardingDocType.find(query).sort({ sortOrder: 1, name: 1 });
    res.json(docTypes);
  } catch (error) {
    console.error('Error fetching doc types:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------------------------------------------------------------------
// @route   GET/POST/PUT/DELETE /api/onboarding-hub/admin/doc-types
// @desc    Admin CRUD for document types
// @access  Admin only
// ---------------------------------------------------------------------------
router.post('/admin/doc-types', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { name, description, required, agentCanUpload, agentCanDelete, isReadOnlyLink, sortOrder } = req.body;
    if (!name) return res.status(400).json({ message: 'Document type name is required' });

    const docType = await OnboardingDocType.create({
      name, description, required, agentCanUpload, agentCanDelete, isReadOnlyLink, sortOrder
    });
    res.status(201).json(docType);
  } catch (error) {
    console.error('Error creating doc type:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/admin/doc-types/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const docType = await OnboardingDocType.findById(req.params.id);
    if (!docType) return res.status(404).json({ message: 'Document type not found' });

    const fields = ['name', 'description', 'required', 'agentCanUpload', 'agentCanDelete', 'isReadOnlyLink', 'sortOrder', 'isActive'];
    fields.forEach(f => { if (req.body[f] !== undefined) docType[f] = req.body[f]; });

    await docType.save();
    res.json(docType);
  } catch (error) {
    console.error('Error updating doc type:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.delete('/admin/doc-types/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const docType = await OnboardingDocType.findById(req.params.id);
    if (!docType) return res.status(404).json({ message: 'Document type not found' });

    await docType.deleteOne();
    res.json({ message: 'Document type deleted' });
  } catch (error) {
    console.error('Error deleting doc type:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------------------------------------------------------------------
// @route   GET /api/onboarding-hub/documents/:agentId
// @desc    List all non-deleted documents for an agent
// @access  Own agent, their upline, or admin
// ---------------------------------------------------------------------------
router.get('/documents/:agentId', authenticate, async (req, res) => {
  try {
    const { agentId } = req.params;

    // Access control: agent can only see own; admin sees all
    if (req.user.role !== 'admin' && req.user._id.toString() !== agentId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const documents = await OnboardingDocument.find({ agent: agentId, deletedAt: null })
      .populate('docType', 'name isReadOnlyLink agentCanDelete')
      .populate('uploadedBy', 'name')
      .sort('-uploadedAt');

    res.json(documents);
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------------------------------------------------------------------
// @route   POST /api/onboarding-hub/documents
// @desc    Upload a document (agent uploads own, admin uploads for anyone)
// @access  Private
// ---------------------------------------------------------------------------
router.post('/documents', authenticate, docUpload.single('docFile'), async (req, res) => {
  try {
    const { docTypeId, agentId, externalLink, notes } = req.body;
    if (!docTypeId) return res.status(400).json({ message: 'docTypeId is required' });

    const docType = await OnboardingDocType.findById(docTypeId);
    if (!docType || !docType.isActive) return res.status(404).json({ message: 'Document type not found' });

    // Determine target agent
    const targetAgentId = (req.user.role === 'admin' && agentId) ? agentId : req.user._id.toString();

    // Enforce agent upload permission
    if (req.user.role !== 'admin' && !docType.agentCanUpload) {
      return res.status(403).json({ message: 'You are not allowed to upload this document type' });
    }

    if (!req.file && !externalLink) {
      return res.status(400).json({ message: 'A document file or external link is required' });
    }

    const docData = {
      agent: targetAgentId,
      docType: docTypeId,
      uploadedBy: req.user._id,
      uploadedAt: new Date(),
      notes: notes || ''
    };

    if (req.file) {
      docData.filePath = `uploads/onboarding-docs/${req.file.filename}`;
      docData.originalFileName = req.file.originalname;
    }
    if (externalLink) docData.externalLink = externalLink;

    const doc = await OnboardingDocument.create(docData);
    await doc.populate('docType', 'name');

    await auditLog(req.user._id, targetAgentId, 'ONBOARDING_DOC_UPLOAD', {
      docType: docType.name,
      fileName: req.file?.originalname || externalLink
    });

    res.status(201).json({ message: 'Document uploaded', document: doc });
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------------------------------------------------------------------
// @route   DELETE /api/onboarding-hub/documents/:id
// @desc    Soft-delete a document
// @access  Agent (own, if agentCanDelete) or Admin
// ---------------------------------------------------------------------------
router.delete('/documents/:id', authenticate, async (req, res) => {
  try {
    const doc = await OnboardingDocument.findOne({ _id: req.params.id, deletedAt: null })
      .populate('docType', 'name agentCanDelete');
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    const isOwn = doc.agent.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isAdmin) {
      if (!isOwn) return res.status(403).json({ message: 'Access denied' });
      if (!doc.docType.agentCanDelete) {
        return res.status(403).json({ message: 'This document type cannot be deleted by agents' });
      }
    }

    doc.deletedAt = new Date();
    await doc.save();

    await auditLog(req.user._id, doc.agent, 'ONBOARDING_DOC_DELETE', { docType: doc.docType.name });

    res.json({ message: 'Document removed' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------------------------------------------------------------------
// @route   GET /api/onboarding-hub/documents/:agentId/:id/download
// @desc    Download an onboarding document
// @access  Own agent or admin
// ---------------------------------------------------------------------------
router.get('/documents/:agentId/:docId/download', authenticate, async (req, res) => {
  try {
    const doc = await OnboardingDocument.findOne({ _id: req.params.docId, deletedAt: null });
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    if (req.user.role !== 'admin' && doc.agent.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (!doc.filePath) return res.status(404).json({ message: 'No file attached' });

    const filePath = path.join(__dirname, '..', doc.filePath);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'File not found on server' });

    res.setHeader('Content-Disposition', `attachment; filename="${doc.originalFileName || 'document.pdf'}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error('Error downloading document:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
