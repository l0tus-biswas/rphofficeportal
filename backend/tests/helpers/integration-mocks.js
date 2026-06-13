/**
 * Integration test mock helper.
 * Generates mock Mongoose model factories and shared utilities.
 * Each integration test file should call mockAllModels() at the top level.
 */

/**
 * List of all model files that server.js routes may require.
 * When adding new models, add them here too.
 */
const ALL_MODELS = [
  'User', 'SystemConfig', 'Notification', 'NotificationPreference',
  'Broadcast', 'ACAClientRecord', 'AcaTierConfig', 'AgentCarrierStatus',
  'APAApplication', 'AuditLog', 'Carrier', 'CommissionStatement',
  'Coupon', 'DocumentFolder', 'DocumentHubFile', 'DocumentRequest',
  'ExamFXProgress', 'LicensingProgress', 'Onboarding', 'OnboardingDocType',
  'OnboardingDocument', 'Payment', 'PrintfulOrder', 'ProductionSubmission',
  'ProductType', 'PromotionLevel', 'Subscription', 'TrainingCategory',
  'TrainingFolder', 'TrainingMaterial'
];

const ALL_UTILS = [
  'neuzmail', 'docusign', 'quickbooks'
];

module.exports = { ALL_MODELS, ALL_UTILS };
