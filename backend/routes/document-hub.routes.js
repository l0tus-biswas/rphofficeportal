const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const DocumentFolder = require('../models/DocumentFolder');
const DocumentHubFile = require('../models/DocumentHubFile');
const DocumentRequest = require('../models/DocumentRequest');
const Notification = require('../models/Notification');
const { protect: authenticate, authorize } = require('../middleware/auth.middleware');

// ---------------------------------------------------------------------------
// Multer config for document hub uploads
// ---------------------------------------------------------------------------
const uploadDir = path.join(__dirname, '../uploads/document-hub');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
  fileFilter: (req, file, cb) => {
    const allowed = /pdf|jpg|jpeg|png|gif|doc|docx|xls|xlsx|ppt|pptx|csv|txt|zip/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    if (ext) cb(null, true);
    else cb(new Error('File type not allowed'), false);
  }
});

// Multer for document request responses (agent uploads)
const requestUploadDir = path.join(__dirname, '../uploads/document-requests');
if (!fs.existsSync(requestUploadDir)) fs.mkdirSync(requestUploadDir, { recursive: true });

const requestStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, requestUploadDir),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  }
});
const requestUpload = multer({
  storage: requestStorage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /pdf|jpg|jpeg|png|doc|docx|xls|xlsx/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    if (ext) cb(null, true);
    else cb(new Error('File type not allowed'), false);
  }
});

// =====================================================================
//  FOLDERS
// =====================================================================

// @route   GET /api/document-hub/folders
// @desc    Get folder tree (active only for agents, all for admin)
// @access  Private
router.get('/folders', authenticate, async (req, res) => {
  try {
    const query = req.user.role === 'admin' && req.query.all === 'true'
      ? {}
      : { isActive: true };
    const folders = await DocumentFolder.find(query)
      .populate('createdBy', 'name')
      .sort({ sortOrder: 1, name: 1 });
    res.json(folders);
  } catch (error) {
    console.error('Error fetching folders:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/document-hub/folders
// @desc    Create a folder (admin)
// @access  Admin
router.post('/folders', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { name, parent, description, sortOrder } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Folder name is required' });
    }
    // Validate parent if provided
    if (parent) {
      const parentFolder = await DocumentFolder.findById(parent);
      if (!parentFolder) return res.status(400).json({ message: 'Parent folder not found' });
    }
    const folder = await DocumentFolder.create({
      name: name.trim(),
      parent: parent || null,
      description: description || '',
      sortOrder: sortOrder || 0,
      createdBy: req.user._id
    });
    await folder.populate('createdBy', 'name');
    res.status(201).json(folder);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'A folder with this name already exists in the same location' });
    }
    console.error('Error creating folder:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/document-hub/folders/:id
// @desc    Update folder (admin)
// @access  Admin
router.put('/folders/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const folder = await DocumentFolder.findById(req.params.id);
    if (!folder) return res.status(404).json({ message: 'Folder not found' });

    const { name, parent, description, sortOrder, isActive } = req.body;
    if (name !== undefined) folder.name = name.trim();
    if (parent !== undefined) {
      // Prevent setting parent to self or descendant
      if (parent && parent.toString() === folder._id.toString()) {
        return res.status(400).json({ message: 'Folder cannot be its own parent' });
      }
      folder.parent = parent || null;
    }
    if (description !== undefined) folder.description = description;
    if (sortOrder !== undefined) folder.sortOrder = sortOrder;
    if (isActive !== undefined) folder.isActive = isActive;

    await folder.save();
    await folder.populate('createdBy', 'name');
    res.json(folder);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'A folder with this name already exists in the same location' });
    }
    console.error('Error updating folder:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/document-hub/folders/:id
// @desc    Delete folder and move children to parent (admin)
// @access  Admin
router.delete('/folders/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const folder = await DocumentFolder.findById(req.params.id);
    if (!folder) return res.status(404).json({ message: 'Folder not found' });

    // Move child folders to parent
    await DocumentFolder.updateMany(
      { parent: folder._id },
      { parent: folder.parent }
    );
    // Move files to parent folder
    await DocumentHubFile.updateMany(
      { folder: folder._id },
      { folder: folder.parent }
    );

    await folder.deleteOne();
    res.json({ message: 'Folder deleted. Contents moved to parent.' });
  } catch (error) {
    console.error('Error deleting folder:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// =====================================================================
//  FILES
// =====================================================================

// @route   GET /api/document-hub/files
// @desc    List files (optionally in a folder)
// @access  Private
router.get('/files', authenticate, async (req, res) => {
  try {
    const query = { isActive: true };
    if (req.query.folder) {
      query.folder = req.query.folder;
    } else if (req.query.folder === '' || req.query.root === 'true') {
      query.folder = null; // root-level files
    }
    // Non-admin only sees 'all' visibility
    if (req.user.role !== 'admin') {
      query.visibility = 'all';
    }
    if (req.query.search) {
      query.$text = { $search: req.query.search };
    }

    const files = await DocumentHubFile.find(query)
      .populate('uploadedBy', 'name')
      .populate('folder', 'name')
      .sort({ sortOrder: 1, name: 1 });
    res.json(files);
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/document-hub/files
// @desc    Upload file(s) to document hub (admin)
// @access  Admin
router.post('/files', authenticate, authorize('admin'), upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    const folder = req.body.folder || null;
    const visibility = req.body.visibility || 'all';
    const description = req.body.description || '';

    // Validate folder if provided
    if (folder) {
      const folderExists = await DocumentFolder.findById(folder);
      if (!folderExists) return res.status(400).json({ message: 'Folder not found' });
    }

    const created = [];
    for (const file of req.files) {
      const doc = await DocumentHubFile.create({
        name: req.body.name && req.files.length === 1
          ? req.body.name
          : file.originalname.replace(/\.[^/.]+$/, ''),
        folder,
        filePath: `uploads/document-hub/${file.filename}`,
        originalFileName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        description,
        visibility,
        uploadedBy: req.user._id
      });
      created.push(doc);
    }

    res.status(201).json({ message: `${created.length} file(s) uploaded`, files: created });
  } catch (error) {
    console.error('Error uploading files:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/document-hub/files/:id
// @desc    Update file metadata (admin)
// @access  Admin
router.put('/files/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const file = await DocumentHubFile.findById(req.params.id);
    if (!file) return res.status(404).json({ message: 'File not found' });

    const { name, folder, description, visibility, isActive, sortOrder } = req.body;
    if (name !== undefined) file.name = name;
    if (folder !== undefined) file.folder = folder || null;
    if (description !== undefined) file.description = description;
    if (visibility !== undefined) file.visibility = visibility;
    if (isActive !== undefined) file.isActive = isActive;
    if (sortOrder !== undefined) file.sortOrder = sortOrder;

    await file.save();
    res.json(file);
  } catch (error) {
    console.error('Error updating file:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/document-hub/files/:id
// @desc    Delete file (admin)
// @access  Admin
router.delete('/files/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const file = await DocumentHubFile.findById(req.params.id);
    if (!file) return res.status(404).json({ message: 'File not found' });

    // Remove physical file
    const fullPath = path.join(__dirname, '..', file.filePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }

    await file.deleteOne();
    res.json({ message: 'File deleted' });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/document-hub/files/:id/download
// @desc    Download a file
// @access  Private
router.get('/files/:id/download', authenticate, async (req, res) => {
  try {
    const file = await DocumentHubFile.findById(req.params.id);
    if (!file || !file.isActive) return res.status(404).json({ message: 'File not found' });

    if (req.user.role !== 'admin' && file.visibility === 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const fullPath = path.join(__dirname, '..', file.filePath);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ message: 'File not found on server' });

    res.setHeader('Content-Disposition', `attachment; filename="${file.originalFileName}"`);
    if (file.mimeType) res.setHeader('Content-Type', file.mimeType);
    fs.createReadStream(fullPath).pipe(res);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// =====================================================================
//  DOCUMENT REQUESTS (10.5)
// =====================================================================

// @route   GET /api/document-hub/requests
// @desc    Get document requests (admin sees all, agent sees own)
// @access  Private
router.get('/requests', authenticate, async (req, res) => {
  try {
    let query = { isActive: true };
    if (req.user.role !== 'admin') {
      query.requestedFrom = req.user._id;
    }

    const requests = await DocumentRequest.find(query)
      .populate('requestedBy', 'name')
      .populate('requestedFrom', 'name email')
      .populate('responses.agent', 'name email')
      .populate('responses.reviewedBy', 'name')
      .populate('saveToFolder', 'name')
      .sort({ createdAt: -1 });

    // For agents, filter responses to only their own
    if (req.user.role !== 'admin') {
      requests.forEach(r => {
        r.responses = r.responses.filter(
          resp => resp.agent && resp.agent._id.toString() === req.user._id.toString()
        );
      });
    }

    res.json(requests);
  } catch (error) {
    console.error('Error fetching document requests:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/document-hub/requests
// @desc    Create a document request (admin)
// @access  Admin
router.post('/requests', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { title, description, dueDate, requestedFrom, saveToFolder } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ message: 'Title is required' });
    }
    if (!requestedFrom || !Array.isArray(requestedFrom) || requestedFrom.length === 0) {
      return res.status(400).json({ message: 'At least one agent is required' });
    }

    // Create response slots for each agent
    const responses = requestedFrom.map(agentId => ({
      agent: agentId,
      status: 'pending'
    }));

    const request = await DocumentRequest.create({
      requestedBy: req.user._id,
      requestedFrom,
      title: title.trim(),
      description: description || '',
      dueDate: dueDate || null,
      saveToFolder: saveToFolder || null,
      responses
    });

    await request.populate('requestedBy', 'name');
    await request.populate('requestedFrom', 'name email');
    await request.populate('responses.agent', 'name email');

    // Notify each agent
    for (const agentId of requestedFrom) {
      Notification.createNotification({
        userId: agentId,
        type: 'document_request',
        title: 'Document Requested',
        message: `Admin has requested: "${title}". ${dueDate ? 'Due: ' + new Date(dueDate).toLocaleDateString() : ''}`,
        link: '/document-hub'
      }, false).catch(() => {});
    }

    res.status(201).json(request);
  } catch (error) {
    console.error('Error creating document request:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/document-hub/requests/:id/respond
// @desc    Agent submits a file in response to a request
// @access  Private (targeted agent)
router.post('/requests/:id/respond', authenticate, requestUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'File is required' });

    const request = await DocumentRequest.findById(req.params.id);
    if (!request || !request.isActive) {
      return res.status(404).json({ message: 'Request not found' });
    }

    // Find agent's response slot
    const resp = request.responses.find(
      r => r.agent.toString() === req.user._id.toString()
    );
    if (!resp) {
      return res.status(403).json({ message: 'This request is not for you' });
    }

    resp.filePath = `uploads/document-requests/${req.file.filename}`;
    resp.originalFileName = req.file.originalname;
    resp.status = 'submitted';
    resp.submittedAt = new Date();

    await request.save();

    // Notify admin
    Notification.createNotification({
      userId: request.requestedBy,
      type: 'document_submitted',
      title: 'Document Submitted',
      message: `${req.user.name} responded to "${request.title}"`,
      link: '/document-hub'
    }, false).catch(() => {});

    res.json({ message: 'Document submitted successfully' });
  } catch (error) {
    console.error('Error responding to document request:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/document-hub/requests/:id/review/:agentId
// @desc    Admin reviews an agent's response (approve/reject)
// @access  Admin
router.put('/requests/:id/review/:agentId', authenticate, authorize('admin'), async (req, res) => {
  try {
    const request = await DocumentRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found' });

    const resp = request.responses.find(
      r => r.agent.toString() === req.params.agentId
    );
    if (!resp) return res.status(404).json({ message: 'Response not found' });

    const { status, reviewNotes } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Status must be approved or rejected' });
    }

    resp.status = status;
    resp.reviewedBy = req.user._id;
    resp.reviewedAt = new Date();
    resp.reviewNotes = reviewNotes || '';

    await request.save();

    // Notify agent
    Notification.createNotification({
      userId: req.params.agentId,
      type: 'document_reviewed',
      title: `Document ${status === 'approved' ? 'Approved' : 'Needs Revision'}`,
      message: `Your submission for "${request.title}" was ${status}.${reviewNotes ? ' Notes: ' + reviewNotes : ''}`,
      link: '/document-hub'
    }, false).catch(() => {});

    res.json({ message: `Response ${status}` });
  } catch (error) {
    console.error('Error reviewing document request:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/document-hub/requests/:id
// @desc    Deactivate a document request (admin)
// @access  Admin
router.delete('/requests/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const request = await DocumentRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found' });

    request.isActive = false;
    await request.save();
    res.json({ message: 'Request deactivated' });
  } catch (error) {
    console.error('Error deleting request:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/document-hub/requests/:requestId/responses/:agentId/download
// @desc    Download an agent's response file
// @access  Admin or the agent themselves
router.get('/requests/:requestId/responses/:agentId/download', authenticate, async (req, res) => {
  try {
    const request = await DocumentRequest.findById(req.params.requestId);
    if (!request) return res.status(404).json({ message: 'Request not found' });

    // Access control
    if (req.user.role !== 'admin' && req.user._id.toString() !== req.params.agentId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const resp = request.responses.find(r => r.agent.toString() === req.params.agentId);
    if (!resp || !resp.filePath) return res.status(404).json({ message: 'No file found' });

    const fullPath = path.join(__dirname, '..', resp.filePath);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ message: 'File not found on server' });

    res.setHeader('Content-Disposition', `attachment; filename="${resp.originalFileName || 'document'}"`);
    fs.createReadStream(fullPath).pipe(res);
  } catch (error) {
    console.error('Error downloading response:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
