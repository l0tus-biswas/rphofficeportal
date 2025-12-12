const fs = require('fs');
const path = require('path');

const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads');
const ONBOARDING_ROOT = path.join(UPLOADS_ROOT, 'onboarding');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

function getUserOnboardingDir(userId) {
  if (!userId) {
    throw new Error('User ID required for onboarding uploads');
  }
  const userDir = path.join(ONBOARDING_ROOT, userId.toString());
  return ensureDir(userDir);
}

module.exports = {
  UPLOADS_ROOT,
  ONBOARDING_ROOT,
  getUserOnboardingDir,
  ensureDir
};
