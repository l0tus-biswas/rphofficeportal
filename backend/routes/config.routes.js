const express = require('express');
const router = express.Router();
const SystemConfig = require('../models/SystemConfig');
const { protect, authorize } = require('../middleware/auth.middleware');
const { sendResponse, errorResponse } = require('../utils/helpers');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// Configure multer for logo upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads/branding');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'logo-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|svg/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

const SITE_ACCESS_KEY = 'site_access_enabled';
const SITE_ACCESS_MESSAGE_KEY = 'site_access_message';
const DEFAULT_SITE_ACCESS_MESSAGE = 'RHP Office is temporarily under maintenance. Please check back shortly.';

async function getSiteAccessState() {
  const [enabledConfig, messageConfig] = await Promise.all([
    SystemConfig.findOne({ key: SITE_ACCESS_KEY }).lean(),
    SystemConfig.findOne({ key: SITE_ACCESS_MESSAGE_KEY }).lean()
  ]);

  const enabled = (enabledConfig?.value || 'true').toLowerCase() !== 'false';
  const message = messageConfig?.value || DEFAULT_SITE_ACCESS_MESSAGE;

  return { enabled, message };
}

// @route   GET /api/admin/config/branding
// @desc    Get branding configuration (public)
// @access  Public
router.get('/branding', async (req, res) => {
  try {
    const appName = await SystemConfig.findOne({ key: 'app_name' });
    const appLogo = await SystemConfig.findOne({ key: 'app_logo' });
    
    sendResponse(res, 200, {
      appName: appName?.value || 'Escape',
      appLogo: appLogo?.value || null
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/admin/config/site-access/public
// @desc    Get site access status for public pages
// @access  Public
router.get('/site-access/public', async (req, res) => {
  try {
    const siteAccess = await getSiteAccessState();
    sendResponse(res, 200, {
      siteAccessEnabled: siteAccess.enabled,
      siteAccessMessage: siteAccess.message
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/admin/config/site-access
// @desc    Get site access status (admin)
// @access  Private/Admin
router.get('/site-access', protect, authorize('admin'), async (req, res) => {
  try {
    const siteAccess = await getSiteAccessState();
    sendResponse(res, 200, {
      siteAccessEnabled: siteAccess.enabled,
      siteAccessMessage: siteAccess.message
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   PUT /api/admin/config/site-access
// @desc    Toggle emergency site access and update maintenance message
// @access  Private/Admin
router.put('/site-access', protect, authorize('admin'), async (req, res) => {
  try {
    const { enabled, message } = req.body;

    if (typeof enabled !== 'boolean') {
      return sendResponse(res, 400, { message: 'enabled (boolean) is required' });
    }

    const sanitizedMessage = (message || '').trim() || DEFAULT_SITE_ACCESS_MESSAGE;

    await Promise.all([
      SystemConfig.findOneAndUpdate(
        { key: SITE_ACCESS_KEY },
        {
          key: SITE_ACCESS_KEY,
          value: String(enabled),
          category: 'application',
          description: 'Emergency switch to allow/deny non-admin portal access',
          isEditable: true,
          updatedBy: req.user._id
        },
        { upsert: true, new: true }
      ),
      SystemConfig.findOneAndUpdate(
        { key: SITE_ACCESS_MESSAGE_KEY },
        {
          key: SITE_ACCESS_MESSAGE_KEY,
          value: sanitizedMessage,
          category: 'application',
          description: 'Message shown when site access is temporarily disabled',
          isEditable: true,
          updatedBy: req.user._id
        },
        { upsert: true, new: true }
      )
    ]);

    sendResponse(res, 200, {
      message: enabled ? 'Site access enabled for users' : 'Site access disabled (maintenance mode active)',
      siteAccessEnabled: enabled,
      siteAccessMessage: sanitizedMessage
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/admin/config/branding
// @desc    Update branding configuration
// @access  Private/Admin
router.post('/branding', protect, authorize('admin'), upload.single('logo'), async (req, res) => {
  try {
    const { appName } = req.body;
    
    if (appName) {
      await SystemConfig.findOneAndUpdate(
        { key: 'app_name' },
        {
          key: 'app_name',
          value: appName,
          category: 'application',
          description: 'Application name',
          updatedBy: req.user._id
        },
        { upsert: true, new: true }
      );
    }
    
    if (req.file) {
      const logoUrl = `/uploads/branding/${req.file.filename}`;
      
      // Delete old logo file if exists
      const oldLogo = await SystemConfig.findOne({ key: 'app_logo' });
      if (oldLogo && oldLogo.value) {
        const oldPath = path.join(__dirname, '..', oldLogo.value);
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }
      
      await SystemConfig.findOneAndUpdate(
        { key: 'app_logo' },
        {
          key: 'app_logo',
          value: logoUrl,
          category: 'application',
          description: 'Application logo URL',
          updatedBy: req.user._id
        },
        { upsert: true, new: true }
      );
    }
    
    const updatedAppName = await SystemConfig.findOne({ key: 'app_name' });
    const updatedAppLogo = await SystemConfig.findOne({ key: 'app_logo' });
    
    sendResponse(res, 200, {
      message: 'Branding updated successfully',
      appName: updatedAppName?.value || 'Escape',
      appLogo: updatedAppLogo?.value || null
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/admin/config
// @desc    Get all system configurations
// @access  Private/Admin
router.get('/', protect, authorize('admin'), async (req, res) => {
  try {
    const configs = await SystemConfig.find().sort({ category: 1, key: 1 });
    
    // Group by category
    const groupedConfigs = configs.reduce((acc, config) => {
      if (!acc[config.category]) {
        acc[config.category] = [];
      }
      acc[config.category].push({
        _id: config._id,
        key: config.key,
        value: config.isSecret ? '••••••••' : config.value,
        actualValue: config.value, // Send actual value for editing
        category: config.category,
        description: config.description,
        isSecret: config.isSecret,
        isEditable: config.isEditable,
        updatedAt: config.updatedAt
      });
      return acc;
    }, {});
    
    sendResponse(res, 200, { configs: groupedConfigs });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/admin/config
// @desc    Create or update a configuration
// @access  Private/Admin
router.post('/', protect, authorize('admin'), async (req, res) => {
  try {
    const { key, value, category, description, isSecret, isEditable } = req.body;
    
    if (!key || value === undefined) {
      return sendResponse(res, 400, { message: 'Key and value are required' });
    }
    
    // Update or create config in database
    let config = await SystemConfig.findOne({ key });
    
    if (config) {
      if (!config.isEditable) {
        return sendResponse(res, 403, { message: 'This configuration is not editable' });
      }
      config.value = value;
      config.category = category || config.category;
      config.description = description || config.description;
      config.isSecret = isSecret !== undefined ? isSecret : config.isSecret;
      config.updatedBy = req.user._id;
      await config.save();
    } else {
      config = await SystemConfig.create({
        key,
        value,
        category: category || 'other',
        description,
        isSecret: isSecret || false,
        isEditable: isEditable !== undefined ? isEditable : true,
        updatedBy: req.user._id
      });
    }
    
    // Update .env file
    await updateEnvFile(key, value);
    
    // Update process.env
    process.env[key] = value;
    
    sendResponse(res, 200, { 
      message: 'Configuration updated successfully',
      config: {
        _id: config._id,
        key: config.key,
        value: config.isSecret ? '••••••••' : config.value,
        category: config.category,
        description: config.description,
        isSecret: config.isSecret,
        isEditable: config.isEditable
      }
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   PUT /api/admin/config/bulk
// @desc    Update multiple configurations at once
// @access  Private/Admin
router.put('/bulk', protect, authorize('admin'), async (req, res) => {
  try {
    const { configs } = req.body;
    
    if (!Array.isArray(configs) || configs.length === 0) {
      return sendResponse(res, 400, { message: 'Configs array is required' });
    }
    
    const updates = [];
    const envUpdates = {};
    
    for (const item of configs) {
      const { key, value } = item;
      
      if (!key || value === undefined) continue;
      
      const config = await SystemConfig.findOne({ key });
      
      if (config && !config.isEditable) {
        continue; // Skip non-editable configs
      }
      
      if (config) {
        config.value = value;
        config.updatedBy = req.user._id;
        await config.save();
        updates.push(config);
      }
      
      envUpdates[key] = value;
      process.env[key] = value;
    }
    
    // Update .env file with all changes
    await updateEnvFileMultiple(envUpdates);
    
    sendResponse(res, 200, { 
      message: `${updates.length} configurations updated successfully`,
      updated: updates.length
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   DELETE /api/admin/config/:id
// @desc    Delete a configuration
// @access  Private/Admin
router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const config = await SystemConfig.findById(req.params.id);
    
    if (!config) {
      return sendResponse(res, 404, { message: 'Configuration not found' });
    }
    
    if (!config.isEditable) {
      return sendResponse(res, 403, { message: 'This configuration cannot be deleted' });
    }
    
    const key = config.key;
    await config.deleteOne();
    
    // Remove from .env file
    await removeFromEnvFile(key);
    
    sendResponse(res, 200, { message: 'Configuration deleted successfully' });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/admin/config/sync-from-env
// @desc    Sync configurations from .env file to database
// @access  Private/Admin
router.post('/sync-from-env', protect, authorize('admin'), async (req, res) => {
  try {
    const envPath = path.join(__dirname, '../.env');
    
    if (!fs.existsSync(envPath)) {
      return sendResponse(res, 404, { message: '.env file not found' });
    }
    
    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');
    
    let synced = 0;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Skip comments and empty lines
      if (!trimmedLine || trimmedLine.startsWith('#')) continue;
      
      const [key, ...valueParts] = trimmedLine.split('=');
      const value = valueParts.join('=').trim();
      
      if (!key || !value) continue;
      
      // Check if config exists
      let config = await SystemConfig.findOne({ key: key.trim() });
      
      if (!config) {
        // Determine category and if it's secret
        const category = categorizeKey(key.trim());
        const isSecret = isSecretKey(key.trim());
        
        await SystemConfig.create({
          key: key.trim(),
          value: value.replace(/^["']|["']$/g, ''), // Remove quotes
          category,
          isSecret,
          isEditable: true,
          updatedBy: req.user._id
        });
        synced++;
      }
    }
    
    sendResponse(res, 200, { 
      message: `Synced ${synced} new configurations from .env file`,
      synced
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// Helper function to update .env file
async function updateEnvFile(key, value) {
  const envPath = path.join(__dirname, '../.env');
  
  let envContent = '';
  
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  }
  
  const lines = envContent.split('\n');
  let found = false;
  
  const newLines = lines.map(line => {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith(`${key}=`)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  
  if (!found) {
    newLines.push(`${key}=${value}`);
  }
  
  fs.writeFileSync(envPath, newLines.join('\n'), 'utf8');
}

// Helper function to update multiple env variables
async function updateEnvFileMultiple(updates) {
  const envPath = path.join(__dirname, '../.env');
  
  let envContent = '';
  
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  }
  
  const lines = envContent.split('\n');
  const updatedKeys = new Set();
  
  const newLines = lines.map(line => {
    const trimmedLine = line.trim();
    for (const [key, value] of Object.entries(updates)) {
      if (trimmedLine.startsWith(`${key}=`)) {
        updatedKeys.add(key);
        return `${key}=${value}`;
      }
    }
    return line;
  });
  
  // Add keys that weren't found
  for (const [key, value] of Object.entries(updates)) {
    if (!updatedKeys.has(key)) {
      newLines.push(`${key}=${value}`);
    }
  }
  
  fs.writeFileSync(envPath, newLines.join('\n'), 'utf8');
}

// Helper function to remove from .env file
async function removeFromEnvFile(key) {
  const envPath = path.join(__dirname, '../.env');
  
  if (!fs.existsSync(envPath)) return;
  
  const envContent = fs.readFileSync(envPath, 'utf8');
  const lines = envContent.split('\n');
  
  const newLines = lines.filter(line => {
    const trimmedLine = line.trim();
    return !trimmedLine.startsWith(`${key}=`);
  });
  
  fs.writeFileSync(envPath, newLines.join('\n'), 'utf8');
}

// Helper function to categorize keys
function categorizeKey(key) {
  if (key.includes('DB') || key.includes('MONGO')) return 'database';
  if (key.includes('PORT') || key.includes('HOST') || key.includes('NODE_ENV')) return 'server';
  if (key.includes('EMAIL') || key.includes('SMTP') || key.includes('MAIL')) return 'email';
  if (key.includes('JWT') || key.includes('TOKEN') || key.includes('SECRET')) return 'jwt';
  return 'application';
}

// Helper function to check if key is secret
function isSecretKey(key) {
  const secretKeys = ['PASSWORD', 'SECRET', 'KEY', 'TOKEN', 'PRIVATE'];
  return secretKeys.some(secret => key.toUpperCase().includes(secret));
}

module.exports = router;
