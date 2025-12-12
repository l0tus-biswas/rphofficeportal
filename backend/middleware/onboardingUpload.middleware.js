const multer = require('multer');
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
      const userId = req.user?._id || req.body.userId;
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

const fileFilter = (req, file, cb) => {
  if (file.mimetype !== 'application/pdf') {
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

const onboardingUpload = upload.fields(
  ONBOARDING_FIELDS.map(field => ({ name: field, maxCount: 1 }))
);

module.exports = {
  onboardingUpload,
  ONBOARDING_FIELDS
};
