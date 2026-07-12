const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const DocumentFolder = require('../models/DocumentFolder');
const DocumentHubFile = require('../models/DocumentHubFile');
const DocumentRequest = require('../models/DocumentRequest');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { sendNotificationEmail } = require('../utils/neuzmail');
const { protect: authenticate, authorize } = require('../middleware/auth.middleware');

// ---------------------------------------------------------------------------
// Multer config for RHP Vault uploads
// ---------------------------------------------------------------------------
const uploadDir = path.join(__dirname, '../uploads/document-hub');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Allowed MIME types mapped to extensions
const ALLOWED_MIMES = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/csv': 'csv',
  'text/plain': 'txt',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
  'application/octet-stream': null // allow if extension matches
};

const ALLOWED_EXTENSIONS = /\.(pdf|jpg|jpeg|png|gif|doc|docx|xls|xlsx|ppt|pptx|csv|txt|zip)$/i;
const REQUEST_ALLOWED_EXTENSIONS = /\.(pdf|jpg|jpeg|png|doc|docx|xls|xlsx|ppt|pptx|csv|txt|zip)$/i;

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
    const extMatch = ALLOWED_EXTENSIONS.test(file.originalname);
    const mimeKnown = file.mimetype in ALLOWED_MIMES;
    if (extMatch && (mimeKnown || file.mimetype === 'application/octet-stream')) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.originalname}`), false);
    }
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
    const extMatch = REQUEST_ALLOWED_EXTENSIONS.test(file.originalname);
    const mimeKnown = file.mimetype in ALLOWED_MIMES;
    if (extMatch && (mimeKnown || file.mimetype === 'application/octet-stream')) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.originalname}`), false);
    }
  }
});

// Multer error handler wrapper
function handleMulterError(multerMiddleware) {
  return (req, res, next) => {
    multerMiddleware(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ message: 'File too large. Maximum size is 25MB.' });
        }
        return res.status(400).json({ message: `Upload error: ${err.message}` });
      } else if (err) {
        return res.status(400).json({ message: err.message || 'File upload failed' });
      }
      next();
    });
  };
}

// Resolve a sensible Content-Type from a filename so files render inline
// (e.g. PDFs/images open in a browser tab) and downloads carry a real type.
const EXT_MIME = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.zip': 'application/zip',
};
function mimeFromName(name) {
  return EXT_MIME[path.extname(name || '').toLowerCase()] || 'application/octet-stream';
}

// Publish (or refresh) an agent's request response into the RHP Vault under the
// request's configured "Save Uploaded Files To" folder, so admins can find the
// collected document in the library. Admin-only visibility keeps an agent's
// submission from leaking to other agents. Idempotent on filePath.
async function publishRequestResponseToVault(request, response, uploadedBy) {
  if (!request || !response?.filePath) {
    return null;
  }

  let targetFolderId = null;
  if (request.saveToFolder) {
    const targetFolder = await DocumentFolder.findOne({
      _id: request.saveToFolder,
      isActive: true,
    }).select('_id');
    targetFolderId = targetFolder?._id || null;
  }

  const absolutePath = path.join(__dirname, '..', response.filePath);
  let fileSize = 0;
  if (fs.existsSync(absolutePath)) {
    try {
      fileSize = fs.statSync(absolutePath).size;
    } catch (_) {
      fileSize = 0;
    }
  }

  const mimeType = mimeFromName(response.originalFileName || response.filePath);

  const update = {
    name: request.title,
    folder: targetFolderId,
    filePath: response.filePath,
    originalFileName: response.originalFileName || path.basename(response.filePath),
    mimeType,
    fileSize,
    description: `Response to document request: ${request.title}`,
    notes: response.notes || '',
    visibility: 'admin',
    restrictedTo: [],
    uploadedBy,
    isActive: true,
  };

  return DocumentHubFile.findOneAndUpdate(
    { filePath: response.filePath },
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

// =====================================================================
//  FOLDERS
// =====================================================================

// @route   GET /api/document-hub/folders
// @desc    Get folder tree (active only for agents, all for admin)
// @access  Private
router.get('/folders', authenticate, async (req, res) => {
  try {
    let query;
    if (req.user.role === 'admin' && req.query.all === 'true') {
      query = {};
    } else if (req.user.role === 'admin') {
      query = { isActive: true };
    } else {
      // Non-admin: only active folders with visibility 'all'
      query = { isActive: true, visibility: { $in: ['all', null] } };
    }
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
    const { name, parent, description, sortOrder, visibility } = req.body;
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
      visibility: visibility || 'all',
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

    const { name, parent, description, sortOrder, isActive, visibility } = req.body;
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
    if (visibility !== undefined) folder.visibility = visibility;

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
      // Enforce folder visibility for non-admin users
      if (req.user.role !== 'admin') {
        const folder = await DocumentFolder.findById(req.query.folder);
        if (!folder || !folder.isActive || folder.visibility === 'admin') {
          return res.status(403).json({ message: 'Access denied: folder not accessible' });
        }
      }
      query.folder = req.query.folder;
    } else if (req.query.folder === '' || req.query.root === 'true') {
      query.folder = null; // root-level files
    }
    // Non-admin: only sees files they have access to
    if (req.user.role !== 'admin') {
      // visibility='all' OR (visibility='restricted' AND user is in restrictedTo)
      query.$or = [
        { visibility: 'all' },
        { visibility: { $exists: false } },
        { visibility: null },
        { visibility: 'restricted', restrictedTo: req.user._id }
      ];
    }
    if (req.query.search) {
      query.$text = { $search: req.query.search };
    }

    const files = await DocumentHubFile.find(query)
      .populate('uploadedBy', 'name')
      .populate('folder', 'name')
      .populate('restrictedTo', 'name')
      .sort({ sortOrder: 1, name: 1 });
    res.json(files);
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/document-hub/files
// @desc    Upload file(s) to RHP Vault (admin)
// @access  Admin
router.post('/files', authenticate, authorize('admin'), handleMulterError(upload.array('files', 10)), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    const folder = req.body.folder || null;
    const visibility = req.body.visibility || 'all';
    const description = req.body.description || '';
    const notes = req.body.notes || '';
    // Parse restrictedTo: comma-separated IDs or JSON array
    let restrictedTo = [];
    if (req.body.restrictedTo) {
      try {
        restrictedTo = JSON.parse(req.body.restrictedTo);
      } catch (e) {
        restrictedTo = req.body.restrictedTo.split(',').map(id => id.trim()).filter(Boolean);
      }
    }
    if (!['all', 'admin', 'restricted'].includes(visibility)) {
      return res.status(400).json({ message: 'Invalid visibility' });
    }
    if (visibility === 'restricted' && (!Array.isArray(restrictedTo) || restrictedTo.length === 0)) {
      return res.status(400).json({ message: 'Restricted files must include at least one user in restrictedTo' });
    }

    // Validate folder if provided
    if (folder) {
      const folderExists = await DocumentFolder.findById(folder);
      if (!folderExists || !folderExists.isActive) return res.status(400).json({ message: 'Folder not found' });
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
        notes,
        visibility,
        restrictedTo: visibility === 'restricted' ? restrictedTo : [],
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

    const { name, folder, description, visibility, isActive, sortOrder, restrictedTo } = req.body;
    if (name !== undefined) file.name = String(name || '').trim();
    if (folder !== undefined) {
      if (folder) {
        const folderExists = await DocumentFolder.findById(folder);
        if (!folderExists || !folderExists.isActive) {
          return res.status(400).json({ message: 'Folder not found' });
        }
      }
      file.folder = folder || null;
    }
    if (description !== undefined) file.description = description;
    if (visibility !== undefined) {
      if (!['all', 'admin', 'restricted'].includes(visibility)) {
        return res.status(400).json({ message: 'Invalid visibility' });
      }
      file.visibility = visibility;
    }
    if (isActive !== undefined) file.isActive = isActive;
    if (sortOrder !== undefined) file.sortOrder = sortOrder;
    if (restrictedTo !== undefined) {
      if (!Array.isArray(restrictedTo)) {
        return res.status(400).json({ message: 'restrictedTo must be an array' });
      }
      file.restrictedTo = restrictedTo;
    }
    // Clear restrictedTo if visibility changed away from 'restricted'
    if (visibility !== undefined && visibility !== 'restricted') {
      file.restrictedTo = [];
    }
    if (file.visibility === 'restricted' && (!Array.isArray(file.restrictedTo) || file.restrictedTo.length === 0)) {
      return res.status(400).json({ message: 'Restricted files must include at least one user in restrictedTo' });
    }

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

    const linkedRequestResponse = await DocumentRequest.findOne({
      'responses.filePath': file.filePath,
      isActive: true
    }).select('_id');

    // Remove physical file only when it is not still referenced by a document request response.
    if (!linkedRequestResponse) {
      const fullPath = path.join(__dirname, '..', file.filePath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
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

    // Access control for non-admins
    if (req.user.role !== 'admin') {
      if (file.visibility === 'admin') {
        return res.status(403).json({ message: 'Access denied' });
      }
      if (file.visibility === 'restricted') {
        const hasAccess = file.restrictedTo.some(
          id => id.toString() === req.user._id.toString()
        );
        if (!hasAccess) {
          return res.status(403).json({ message: 'Access denied' });
        }
      }
      // Check parent folder visibility
      if (file.folder) {
        const folder = await DocumentFolder.findById(file.folder);
        if (folder && folder.visibility === 'admin') {
          return res.status(403).json({ message: 'Access denied' });
        }
      }
    }

    const fullPath = path.join(__dirname, '..', file.filePath);
    // Path traversal protection
    const backendRoot = path.resolve(__dirname, '..');
    if (!fullPath.startsWith(backendRoot + path.sep)) {
      return res.status(403).json({ message: 'Access denied: invalid file path' });
    }
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
          resp => {
            if (!resp.agent) return false;
            const respAgentId = typeof resp.agent === 'object' && resp.agent._id
              ? resp.agent._id.toString()
              : resp.agent.toString();
            return respAgentId === req.user._id.toString();
          }
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

    const uniqueAgentIds = [...new Set(requestedFrom.map(id => String(id)).filter(Boolean))];
    const validAgents = await User.find({
      _id: { $in: uniqueAgentIds },
      role: 'agent',
      isActive: true,
      deletedAt: null
    }).select('_id name email');
    if (validAgents.length !== uniqueAgentIds.length) {
      return res.status(400).json({ message: 'One or more selected users are invalid or inactive agents' });
    }

    let normalizedDueDate = null;
    if (dueDate) {
      const parsedDueDate = new Date(dueDate);
      if (Number.isNaN(parsedDueDate.getTime())) {
        return res.status(400).json({ message: 'Invalid due date' });
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      parsedDueDate.setHours(0, 0, 0, 0);
      if (parsedDueDate < today) {
        return res.status(400).json({ message: 'Due date cannot be in the past' });
      }
      normalizedDueDate = parsedDueDate;
    }

    if (saveToFolder) {
      const folder = await DocumentFolder.findOne({ _id: saveToFolder, isActive: true });
      if (!folder) {
        return res.status(400).json({ message: 'Save-to folder not found' });
      }
    }

    // Create response slots for each agent
    const responses = uniqueAgentIds.map(agentId => ({
      agent: agentId,
      status: 'pending'
    }));

    const request = await DocumentRequest.create({
      requestedBy: req.user._id,
      requestedFrom: uniqueAgentIds,
      title: title.trim(),
      description: description || '',
      dueDate: normalizedDueDate,
      saveToFolder: saveToFolder || null,
      responses
    });

    await request.populate('requestedBy', 'name');
    await request.populate('requestedFrom', 'name email');
    await request.populate('responses.agent', 'name email');

    // Notify each agent (in-app + email)
    for (const agentId of uniqueAgentIds) {
      Notification.createNotification({
        userId: agentId,
        type: 'document_request',
        title: 'Document Requested',
        message: `Admin has requested: "${title}". Upload it from RHP Vault.${dueDate ? ' Due: ' + new Date(dueDate).toLocaleDateString() : ''}`,
        link: '/document-hub?section=requests'
      }, false).catch(() => {});
    }

    // Send email to each requested agent. Use `validAgents` (fetched directly
    // above with name/email) rather than `request.requestedFrom` post-populate —
    // relying on the populated subdocument left every agent's email undefined,
    // so this loop never actually sent anything even though it ran cleanly.
    for (const agent of validAgents) {
      if (agent && agent.email) {
        const dueLine = dueDate ? `\nDue date: ${new Date(dueDate).toLocaleDateString()}` : '';
        sendNotificationEmail({
          toEmail: agent.email,
          title: 'Document Requested',
          message: `Hello ${agent.name},\n\nA document has been requested from you: "${title}".${dueLine}\n\nUpload it directly from the RHP Vault page.\n\n${description || ''}`.trim(),
          link: '/document-hub?section=requests',
          actionLabel: 'Upload Document'
        }).catch(err => console.error('Failed to send document request email:', err.message));
      }
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
router.post('/requests/:id/respond', authenticate, handleMulterError(requestUpload.single('file')), async (req, res) => {
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
    if (resp.status === 'approved') {
      return res.status(400).json({ message: 'This response is already approved and cannot be replaced' });
    }

    const previousFilePath = resp.filePath;

    resp.filePath = `uploads/document-requests/${req.file.filename}`;
    resp.originalFileName = req.file.originalname;
    resp.notes = req.body.notes || '';
    resp.status = 'submitted';
    resp.submittedAt = new Date();

    await request.save();

    // Replacing a prior submission: remove the old Vault copy (it pointed to the
    // file being replaced) and the old physical file so nothing is orphaned.
    if (previousFilePath && previousFilePath !== resp.filePath) {
      await DocumentHubFile.deleteOne({ filePath: previousFilePath });
      const previousFullPath = path.join(__dirname, '..', previousFilePath);
      if (fs.existsSync(previousFullPath)) {
        fs.unlink(previousFullPath, () => {});
      }
    }

    // File the submitted document into the request's configured folder so it is
    // immediately available in RHP Vault (admin-only), as the request form
    // promises. Best-effort: a filing failure must not fail the submission.
    try {
      await publishRequestResponseToVault(request, resp, req.user._id);
    } catch (hubErr) {
      console.error('Failed to file submitted request document into RHP Vault:', hubErr.message);
    }

    // Notify admin
    Notification.createNotification({
      userId: request.requestedBy,
      type: 'document_submitted',
      title: 'Document Submitted',
      message: `${req.user.name} responded to "${request.title}"`,
      link: '/document-hub?section=requests'
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
    if (status === 'approved' && !resp.filePath) {
      return res.status(400).json({ message: 'Cannot approve without a submitted file' });
    }

    resp.status = status;
    resp.reviewedBy = req.user._id;
    resp.reviewedAt = new Date();
    resp.reviewNotes = reviewNotes || '';

    await request.save();

    // Refresh the Vault copy on review so its metadata/notes stay in sync.
    if (resp.filePath) {
      try {
        await publishRequestResponseToVault(request, resp, req.user._id);
      } catch (hubErr) {
        console.error('Failed to refresh request file in RHP Vault:', hubErr.message);
      }
    }

    // Notify agent
    Notification.createNotification({
      userId: req.params.agentId,
      type: 'document_reviewed',
      title: `Document ${status === 'approved' ? 'Approved' : 'Needs Revision'}`,
      message: `Your submission for "${request.title}" was ${status}.${reviewNotes ? ' Notes: ' + reviewNotes : ''}`,
      link: '/document-hub?section=requests'
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
    // Path traversal protection
    const backendRoot = path.resolve(__dirname, '..');
    if (!path.resolve(fullPath).startsWith(backendRoot + path.sep)) {
      return res.status(403).json({ message: 'Access denied: invalid file path' });
    }
    if (!fs.existsSync(fullPath)) return res.status(404).json({ message: 'File not found on server' });

    const fileName = resp.originalFileName || 'document';
    // `inline` lets the browser render it in a tab (View); the frontend still
    // forces a download when the user clicks Download. Content-Type is required
    // for inline rendering to work.
    res.setHeader('Content-Type', mimeFromName(fileName));
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    fs.createReadStream(fullPath).pipe(res);
  } catch (error) {
    console.error('Error downloading response:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
