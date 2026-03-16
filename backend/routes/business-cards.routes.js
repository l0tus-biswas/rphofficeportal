const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const SystemConfig = require('../models/SystemConfig');
const { protect: authenticate, authorize } = require('../middleware/auth.middleware');
const { sendResponse, errorResponse } = require('../utils/helpers');

// ---------------------------------------------------------------------------
// Vistaprint SystemConfig key names
// ---------------------------------------------------------------------------
const KEYS = {
  ENGLISH_URL:      'vistaprint_english_url',
  SPANISH_URL:      'vistaprint_spanish_url',
  AFFILIATE_ID:     'vistaprint_affiliate_id',
  ENGLISH_PREVIEW:  'vistaprint_english_preview',
  SPANISH_PREVIEW:  'vistaprint_spanish_preview'
};

// Default URLs — placeholder until admin sets real affiliate links
const DEFAULTS = {
  [KEYS.ENGLISH_URL]:     'https://www.vistaprint.com/business-cards',
  [KEYS.SPANISH_URL]:     'https://www.vistaprint.com/business-cards',
  [KEYS.AFFILIATE_ID]:    '',
  [KEYS.ENGLISH_PREVIEW]: '',
  [KEYS.SPANISH_PREVIEW]: ''
};

// ---------------------------------------------------------------------------
// Multer — preview image uploads (stored in uploads/vistaprint/)
// ---------------------------------------------------------------------------
const previewDir = path.join(__dirname, '../uploads/vistaprint');
if (!fs.existsSync(previewDir)) fs.mkdirSync(previewDir, { recursive: true });

const previewStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, previewDir),
  filename: (req, file, cb) => {
    const lang = req.body.language === 'spanish' ? 'spanish' : 'english';
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `preview-${lang}-${Date.now()}${ext}`);
  }
});

const previewUpload = multer({
  storage: previewStorage,
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG, PNG, or WebP images are allowed'), false);
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5 MB
});

// ---------------------------------------------------------------------------
// Helper: read all Vistaprint keys from SystemConfig at once
// ---------------------------------------------------------------------------
async function getVistaprintConfig() {
  const records = await SystemConfig.find({ key: { $in: Object.values(KEYS) } }).lean();
  const map = {};
  for (const r of records) {
    // 'not_configured' is a seed placeholder — treat as empty
    map[r.key] = (r.value && r.value !== 'not_configured') ? r.value : '';
  }
  return {
    englishUrl:      map[KEYS.ENGLISH_URL]     || DEFAULTS[KEYS.ENGLISH_URL],
    spanishUrl:      map[KEYS.SPANISH_URL]      || DEFAULTS[KEYS.SPANISH_URL],
    affiliateId:     map[KEYS.AFFILIATE_ID]     || '',
    englishPreview:  map[KEYS.ENGLISH_PREVIEW]  || '',
    spanishPreview:  map[KEYS.SPANISH_PREVIEW]  || ''
  };
}

async function upsertConfig(key, value, updatedBy) {
  // Schema requires a non-empty value — use sentinel for intentionally blank fields
  const storedValue = (value && value.trim()) ? value.trim() : 'not_configured';
  return SystemConfig.findOneAndUpdate(
    { key },
    { key, value: storedValue, category: 'application', description: `Vistaprint: ${key}`, updatedBy },
    { upsert: true, new: true }
  );
}

// ---------------------------------------------------------------------------
// @route   GET /api/business-cards/config
// @desc    Returns current Vistaprint template URLs and preview image paths
// @access  Private (agent + admin)
// ---------------------------------------------------------------------------
router.get('/config', authenticate, async (req, res) => {
  try {
    const config = await getVistaprintConfig();
    return sendResponse(res, 200, { config });
  } catch (err) {
    return errorResponse(res, err);
  }
});

// ---------------------------------------------------------------------------
// @route   POST /api/admin/business-cards/config
// @desc    Update Vistaprint URL/affiliate config (text fields)
// @access  Admin only
// ---------------------------------------------------------------------------
router.post('/admin/config', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { englishUrl, spanishUrl, affiliateId } = req.body;

    if (englishUrl !== undefined) await upsertConfig(KEYS.ENGLISH_URL, englishUrl, req.user._id);
    if (spanishUrl !== undefined) await upsertConfig(KEYS.SPANISH_URL, spanishUrl, req.user._id);
    if (affiliateId !== undefined) await upsertConfig(KEYS.AFFILIATE_ID, affiliateId, req.user._id);

    const config = await getVistaprintConfig();
    return sendResponse(res, 200, { message: 'Vistaprint configuration updated.', config });
  } catch (err) {
    return errorResponse(res, err);
  }
});

// ---------------------------------------------------------------------------
// @route   POST /api/admin/business-cards/upload-preview
// @desc    Upload a preview image for English or Spanish template
// @body    language: 'english' | 'spanish'
// @access  Admin only
// ---------------------------------------------------------------------------
router.post('/admin/upload-preview', authenticate, authorize('admin'), previewUpload.single('preview'), async (req, res) => {
  try {
    if (!req.file) {
      return sendResponse(res, 400, { message: 'No image file provided. Send image in field "preview".' });
    }

    const language = req.body.language === 'spanish' ? 'spanish' : 'english';
    const configKey = language === 'spanish' ? KEYS.SPANISH_PREVIEW : KEYS.ENGLISH_PREVIEW;
    const previewUrl = `/uploads/vistaprint/${req.file.filename}`;

    // Delete old preview file if one exists
    const existing = await SystemConfig.findOne({ key: configKey }).lean();
    if (existing && existing.value) {
      const oldPath = path.join(__dirname, '..', existing.value);
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch {}
      }
    }

    await upsertConfig(configKey, previewUrl, req.user._id);

    return sendResponse(res, 200, {
      message: `${language.charAt(0).toUpperCase() + language.slice(1)} preview image updated.`,
      previewUrl
    });
  } catch (err) {
    return errorResponse(res, err);
  }
});

module.exports = router;
