/**
 * Shared recruiting-hierarchy helpers, built on User.referredBy (the single
 * "who recruited this agent" pointer). Single source of truth for "is X an
 * upline of Y" / "who is in X's downline" so permission checks (licensing,
 * ExamFX) and list views never disagree on what counts as someone's downline.
 */
const User = require('../models/User');

// Generous cap against a malformed/circular referredBy chain — recruiting
// trees in practice are nowhere near this deep.
const MAX_DEPTH = 25;

/**
 * True if uplineId is anywhere above agentId in the recruiting chain
 * (their direct recruiter, that recruiter's recruiter, etc. — any depth).
 * A user is never their own upline.
 * @param {string|ObjectId} uplineId
 * @param {string|ObjectId} agentId
 * @returns {Promise<boolean>}
 */
async function isUplineOf(uplineId, agentId) {
  if (!uplineId || !agentId) return false;
  if (uplineId.toString() === agentId.toString()) return false;

  let current = await User.findById(agentId).select('referredBy').lean();
  let depth = 0;
  while (current && current.referredBy && depth < MAX_DEPTH) {
    if (current.referredBy.toString() === uplineId.toString()) return true;
    current = await User.findById(current.referredBy).select('referredBy').lean();
    depth++;
  }
  return false;
}

/**
 * All of agentId's recursive downline (recruits, their recruits, etc.),
 * flattened to a plain array of ids. Does not include agentId itself.
 * @param {string|ObjectId} agentId
 * @returns {Promise<ObjectId[]>}
 */
async function getDownlineIds(agentId) {
  const result = [];
  let frontier = [agentId];
  let depth = 0;

  while (frontier.length > 0 && depth < MAX_DEPTH) {
    const children = await User.find({ referredBy: { $in: frontier } }).select('_id').lean();
    if (children.length === 0) break;
    const ids = children.map(c => c._id);
    result.push(...ids);
    frontier = ids;
    depth++;
  }
  return result;
}

module.exports = { isUplineOf, getDownlineIds };
