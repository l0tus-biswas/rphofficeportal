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

/**
 * Bulk check — returns Map<agentIdString, boolean> using the same rule as
 * isAgentLicensed, for screens that list many agents (My Team, hierarchy).
 * @param {Array} agentIds
 * @returns {Promise<Map<string, boolean>>}
 */
async function getLicensedMap(agentIds) {
  const ids = (agentIds || []).filter(Boolean);
  const result = new Map();
  if (ids.length === 0) return result;

  const [progressDocs, apaDocs, users] = await Promise.all([
    LicensingProgress.find({ agent: { $in: ids } })
      .select('agent isLicensed checklist.stateAppointment.approved').lean(),
    APAApplication.find({ $or: [{ user: { $in: ids } }, { userId: { $in: ids } }] })
      .select('user userId licensingStatus').lean(),
    User.find({ _id: { $in: ids } }).select('metadata').lean()
  ]);

  const progressBy = new Map(progressDocs.map(p => [String(p.agent), p]));
  const apaBy = new Map();
  apaDocs.forEach(a => {
    const key = a.user || a.userId;
    if (key) apaBy.set(String(key), a);
  });
  const metaBy = new Map(users.map(u => [String(u._id), u.metadata]));

  ids.forEach(id => {
    const key = String(id);
    result.set(key, isAgentLicensed(progressBy.get(key), apaBy.get(key), metaBy.get(key)));
  });
  return result;
}

module.exports = { isAgentLicensed, isAgentLicensedById, getLicensedMap };
