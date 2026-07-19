const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const OnboardingDocType = require('../models/OnboardingDocType');
const OnboardingDocument = require('../models/OnboardingDocument');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const { protect: authenticate, authorize } = require('../middleware/auth.middleware');
const { encrypt, decrypt } = require('../utils/encryption');

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

function computeOverallStatus(docTypes, docs) {
  const activeTypes = (docTypes || []).filter(t => t.isActive !== false);
  const requiredTypes = activeTypes.filter(t => t.required);
  const docsByType = new Map((docs || []).map(d => [String(d.docType?._id || d.docType), d]));

  if (!requiredTypes.length) {
    return 'not-started';
  }

  const requiredDocs = requiredTypes.map(t => docsByType.get(String(t._id))).filter(Boolean);
  if (!requiredDocs.length) {
    return 'not-started';
  }

  if (requiredDocs.some(d => d.status === 'rejected')) return 'rejected';
  if (requiredTypes.some(t => !docsByType.get(String(t._id)))) return 'missing';
  if (requiredDocs.some(d => d.status === 'missing')) return 'missing';
  if (requiredDocs.every(d => d.status === 'approved')) return 'approved';
  return 'pending';
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
// @route   GET /api/onboarding-hub/admin/overview
// @desc    Admin list: agent onboarding summary from hub doc types + docs
// @access  Admin only
// ---------------------------------------------------------------------------
router.get('/admin/overview', authenticate, authorize('admin'), async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const search = (req.query.search || '').trim();
    const statusFilter = (req.query.status || '').trim();

    const userQuery = { role: 'agent', deletedAt: null };
    if (search) {
      const regex = new RegExp(search, 'i');
      userQuery.$or = [{ name: regex }, { email: regex }];
    }

    const [agents, totalAgents, docTypes] = await Promise.all([
      User.find(userQuery).select('_id name email role').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      User.countDocuments(userQuery),
      OnboardingDocType.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean()
    ]);

    const agentIds = agents.map(a => a._id);
    const docs = await OnboardingDocument.find({
      agent: { $in: agentIds },
      deletedAt: null
    }).populate('docType', 'name required sortOrder').populate('uploadedBy', 'name').lean();

    const docsByAgent = new Map();
    for (const doc of docs) {
      const key = String(doc.agent);
      if (!docsByAgent.has(key)) docsByAgent.set(key, []);
      docsByAgent.get(key).push(doc);
    }

    let rows = agents.map(agent => {
      const agentDocs = docsByAgent.get(String(agent._id)) || [];
      const requiredTypes = docTypes.filter(t => t.required);
      const uploadedRequiredCount = requiredTypes.filter(rt =>
        agentDocs.some(d => String(d.docType?._id || d.docType) === String(rt._id))
      ).length;
      const approvedRequiredCount = requiredTypes.filter(rt =>
        agentDocs.some(d => String(d.docType?._id || d.docType) === String(rt._id) && d.status === 'approved')
      ).length;
      const overallStatus = computeOverallStatus(docTypes, agentDocs);

      return {
        agent,
        status: overallStatus,
        totalRequired: requiredTypes.length,
        uploadedRequired: uploadedRequiredCount,
        approvedRequired: approvedRequiredCount,
        documentsCount: agentDocs.length,
        lastUploadedAt: agentDocs.length
          ? new Date(Math.max(...agentDocs.map(d => new Date(d.uploadedAt || d.updatedAt || d.createdAt).getTime())))
          : null
      };
    });

    if (statusFilter) {
      rows = rows.filter(r => r.status === statusFilter);
    }

    res.json({
      rows,
      pagination: {
        page,
        limit,
        total: totalAgents,
        pages: Math.ceil(totalAgents / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching onboarding overview:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------------------------------------------------------------------
// @route   GET /api/onboarding-hub/admin/agents/:agentId
// @desc    Admin detail: all doc types + agent documents with statuses
// @access  Admin only
// ---------------------------------------------------------------------------
router.get('/admin/agents/:agentId', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { agentId } = req.params;
    const [agent, docTypes, docs] = await Promise.all([
      User.findById(agentId).select('_id name email role').lean(),
      OnboardingDocType.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean(),
      OnboardingDocument.find({ agent: agentId, deletedAt: null })
        .populate('docType', 'name required sortOrder')
        .populate('uploadedBy', 'name')
        .populate('reviewedBy', 'name')
        .sort({ uploadedAt: -1 })
        .lean()
    ]);

    if (!agent) return res.status(404).json({ message: 'Agent not found' });

    const docsByType = new Map();
    for (const doc of docs) {
      const key = String(doc.docType?._id || doc.docType);
      if (!docsByType.has(key)) {
        docsByType.set(key, doc);
      }
    }

    const cards = docTypes.map(dt => {
      const doc = docsByType.get(String(dt._id)) || null;
      if (doc && doc.bankRoutingNumber) {
        doc.hasBankingData = true;
      }
      return { docType: dt, document: doc };
    });

    res.json({
      agent,
      cards,
      status: computeOverallStatus(docTypes, docs)
    });
  } catch (error) {
    console.error('Error fetching onboarding agent detail:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------------------------------------------------------------------
// @route   PUT /api/onboarding-hub/admin/documents/:id/status
// @desc    Admin review action for onboarding hub documents
// @access  Admin only
// ---------------------------------------------------------------------------
router.put('/admin/documents/:id/status', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { status, comment } = req.body;
    if (!['pending', 'approved', 'rejected', 'missing'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const doc = await OnboardingDocument.findOne({ _id: req.params.id, deletedAt: null })
      .populate('docType', 'name');
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    doc.status = status;
    doc.adminComment = (comment || '').trim();
    doc.reviewedBy = req.user._id;
    doc.reviewedAt = new Date();
    doc.history = Array.isArray(doc.history) ? doc.history : [];
    doc.history.push({
      status,
      comment: doc.adminComment,
      updatedBy: req.user._id,
      updatedAt: new Date()
    });

    await doc.save();

    // Create notification + email for the agent
    const docTypeName = doc.docType?.name || 'Document';
    const statusLabels = { approved: 'Approved', rejected: 'Rejected', missing: 'Resubmission Required', pending: 'Pending Review' };
    const statusLabel = statusLabels[status] || status;
    const commentNote = doc.adminComment ? ` Admin comment: "${doc.adminComment}"` : '';

    Notification.createNotification({
      userId: doc.agent,
      type: 'document_reviewed',
      title: `${docTypeName} — ${statusLabel}`,
      message: `Your ${docTypeName} has been ${statusLabel.toLowerCase()}.${commentNote}`,
      link: '/onboarding-hub'
    }, true).catch(err => console.error('[Onboarding Review] Notification error:', err.message));

    await auditLog(req.user._id, doc.agent, 'ONBOARDING_DOC_REVIEW', {
      docType: docTypeName,
      status,
      comment: doc.adminComment
    });

    res.json({ message: 'Document status updated', document: doc });
  } catch (error) {
    console.error('Error updating onboarding document status:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------------------------------------------------------------------
// @route   GET /api/onboarding-hub/admin/documents/:id/bank-info
// @desc    Admin: view decrypted Direct Deposit banking info
// @access  Admin only
// ---------------------------------------------------------------------------
router.get('/admin/documents/:id/bank-info', authenticate, authorize('admin'), async (req, res) => {
  try {
    const doc = await OnboardingDocument.findOne({ _id: req.params.id, deletedAt: null })
      .populate('agent', 'name email')
      .populate('docType', 'name hasDirectDepositFields');
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    if (!doc.bankRoutingNumber || !doc.bankAccountNumber) {
      return res.status(404).json({ message: 'No banking information on this document' });
    }

    const bankInfo = {
      routingNumber: decrypt(doc.bankRoutingNumber),
      accountNumber: decrypt(doc.bankAccountNumber),
      accountType: doc.bankAccountType,
      agentName: doc.agent?.name,
      agentEmail: doc.agent?.email
    };

    await auditLog(req.user._id, doc.agent?._id, 'VIEW_BANK_INFO', {
      documentId: doc._id,
      docType: doc.docType?.name
    });

    res.json(bankInfo);
  } catch (error) {
    console.error('Error fetching bank info:', error);
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
    const { name, description, required, agentCanUpload, agentCanDelete, isReadOnlyLink, hasDirectDepositFields, sortOrder } = req.body;
    if (!name) return res.status(400).json({ message: 'Document type name is required' });

    const docType = await OnboardingDocType.create({
      name, description, required, agentCanUpload, agentCanDelete, isReadOnlyLink, hasDirectDepositFields, sortOrder
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

    const fields = ['name', 'description', 'required', 'agentCanUpload', 'agentCanDelete', 'isReadOnlyLink', 'hasDirectDepositFields', 'sortOrder', 'isActive'];
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
      .populate('docType', 'name isReadOnlyLink agentCanDelete hasDirectDepositFields')
      .populate('uploadedBy', 'name')
      .populate('reviewedBy', 'name')
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
router.post('/documents', authenticate, (req, res, next) => {
  docUpload.single('docFile')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ message: 'File too large. Maximum size is 15MB.' });
      }
      return res.status(400).json({ message: err.message || 'File upload failed' });
    }
    next();
  });
}, async (req, res) => {
  try {
    const { docTypeId, agentId, externalLink, notes, routingNumber, accountNumber, accountType } = req.body;
    if (!docTypeId) return res.status(400).json({ message: 'docTypeId is required' });

    const docType = await OnboardingDocType.findById(docTypeId);
    if (!docType || !docType.isActive) return res.status(404).json({ message: 'Document type not found' });

    // Validate Direct Deposit fields if required
    if (docType.hasDirectDepositFields) {
      if (!routingNumber || !accountNumber || !accountType) {
        return res.status(400).json({ message: 'Routing number, account number, and account type are required for Direct Deposit' });
      }
      if (!/^\d{9}$/.test(routingNumber)) {
        return res.status(400).json({ message: 'Routing number must be exactly 9 digits' });
      }
      if (!/^\d{4,17}$/.test(accountNumber)) {
        return res.status(400).json({ message: 'Account number must be 4-17 digits' });
      }
      if (!['checking', 'savings'].includes(accountType)) {
        return res.status(400).json({ message: 'Account type must be checking or savings' });
      }
    }

    // Determine target agent
    const targetAgentId = (req.user.role === 'admin' && agentId) ? agentId : req.user._id.toString();

    // Enforce agent upload permission
    if (req.user.role !== 'admin' && !docType.agentCanUpload) {
      return res.status(403).json({ message: 'You are not allowed to upload this document type' });
    }

    if (!req.file && !externalLink) {
      return res.status(400).json({ message: 'A document file or external link is required' });
    }

    let doc = await OnboardingDocument.findOne({
      agent: targetAgentId,
      docType: docTypeId,
      deletedAt: null
    });

    if (!doc) {
      doc = new OnboardingDocument({
        agent: targetAgentId,
        docType: docTypeId
      });
    }

    doc.uploadedBy = req.user._id;
    doc.uploadedAt = new Date();
    doc.notes = notes || '';
    doc.status = 'pending';
    doc.adminComment = '';
    doc.reviewedBy = null;
    doc.reviewedAt = null;
    doc.history = Array.isArray(doc.history) ? doc.history : [];
    doc.history.push({
      status: 'pending',
      comment: 'Document uploaded',
      updatedBy: req.user._id,
      updatedAt: new Date()
    });

    if (req.file) {
      // Remove previous file if replacing existing upload
      if (doc.filePath) {
        const oldFullPath = path.join(__dirname, '..', doc.filePath);
        if (fs.existsSync(oldFullPath)) {
          try { fs.unlinkSync(oldFullPath); } catch (_) {}
        }
      }
      doc.filePath = `uploads/onboarding-docs/${req.file.filename}`;
      doc.originalFileName = req.file.originalname;
    }
    if (externalLink) {
      doc.externalLink = externalLink;
    }

    // Encrypt and store Direct Deposit banking info
    if (docType.hasDirectDepositFields && routingNumber && accountNumber) {
      doc.bankRoutingNumber = encrypt(routingNumber);
      doc.bankAccountNumber = encrypt(accountNumber);
      doc.bankAccountType = accountType;
    }

    await doc.save();
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

    // Soft-deleted documents are never surfaced again (every query filters
    // deletedAt: null) and re-uploading creates a brand-new document rather
    // than reusing this one, so the on-disk file would otherwise be orphaned.
    if (doc.filePath) {
      const fullPath = path.join(__dirname, '..', doc.filePath);
      if (fs.existsSync(fullPath)) {
        try { fs.unlinkSync(fullPath); } catch (_) {}
      }
    }

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
