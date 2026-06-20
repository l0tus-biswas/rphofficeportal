/**
 * Shared licensing helpers — single source of truth for whether an agent
 * counts as "licensed". Used by the licensing routes, the QuickBooks sync
 * (agents are only synced once licensed), the dashboard, and detail endpoints
 * so they never disagree.
 */
const LicensingProgress = require('../models/LicensingProgress');
const APAApplication = require('../models/APAApplication');
const User = require('../models/User');

/**
 * Pure check. An agent is licensed if ANY of:
 *  - their LicensingProgress.isLicensed flag is set
 *  - the final checklist step (state appointment) is approved
 *  - their APA application self-reports a current license / license types
 *  - their user metadata flags currentlyLicensed (imported/migrated agents)
 *
 * @param {Object} progress       LicensingProgress doc (or lean object) or null
 * @param {Object} apa            APAApplication doc (or lean object) or null
 * @param {Map|Object} agentMetadata  User.metadata (Map on a hydrated doc, plain object when lean)
 * @returns {boolean}
 */
function isAgentLicensed(progress, apa, agentMetadata) {
  if (progress) {
    if (progress.isLicensed) return true;
    if (progress.checklist?.stateAppointment?.approved) return true;
  }
  if (apa?.licensingStatus?.currentlyLicensed) return true;
  if (apa?.licensingStatus?.licenseTypes?.length > 0) return true;
  if (agentMetadata) {
    const meta = agentMetadata.get
      ? agentMetadata.get('currentlyLicensed')
      : agentMetadata.currentlyLicensed;
    if (meta === 'true' || meta === true) return true;
  }
  return false;
}

/**
 * Async check by agent id — loads the records needed and applies isAgentLicensed.
 * @param {string} agentId
 * @returns {Promise<boolean>}
 */
async function isAgentLicensedById(agentId) {
  const [progress, apa, user] = await Promise.all([
    LicensingProgress.findOne({ agent: agentId }).lean(),
    APAApplication.findOne({ userId: agentId }).select('licensingStatus').lean(),
    User.findById(agentId).select('metadata').lean()
  ]);
  return isAgentLicensed(progress, apa, user?.metadata);
}

module.exports = { isAgentLicensed, isAgentLicensedById };
