const multer = require('../utils/multer');
const path = require('path');
const { getUserOnboardingDir } = require('../utils/storage');

const ONBOARDING_FIELDS = [
  'stateLicense',
  'driversLicense',
  'fingerprintBackground',
  'cmsCertificate',
  'directDeposit'
];

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      // Files belong to the user the document is FOR, not whoever uploads it: an admin uploading
      // on behalf of an agent uses /users/:userId/upload, and the download routes look in that
      // user's folder.
      const userId = req.params?.userId || req.user?._id || req.body.userId;
      if (!userId) {
        return cb(new Error('User ID missing for upload'));
      }
      const dir = getUserOnboardingDir(userId.toString());
      cb(null, dir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const safeExt = path.extname(file.originalname)?.toLowerCase() || '.pdf';
    const baseName = file.fieldname.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    cb(null, `${baseName}-${timestamp}${safeExt}`);
  }
});

// The stored name keeps the original extension, so the extension must be checked too: a client
// can declare application/pdf for "page.html".
const fileFilter = (req, file, cb) => {
  const isPdf = file.mimetype === 'application/pdf' &&
    path.extname(file.originalname || '').toLowerCase() === '.pdf';
  if (!isPdf) {
    return cb(new Error('Only PDF documents are allowed'));
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10 MB
  }
});

const uploadFields = upload.fields(
  ONBOARDING_FIELDS.map(field => ({ name: field, maxCount: 1 }))
);

// Upload problems are the caller's mistake: answer 4xx instead of letting the generic error
// handler turn them into a 500.
const onboardingUpload = (req, res, next) => {
  uploadFields(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ success: false, message: 'File too large. Maximum size is 10MB.' });
    }
    return res.status(400).json({ success: false, message: err.message || 'File upload failed' });
  });
};

module.exports = {
  onboardingUpload,
  ONBOARDING_FIELDS
};
