/**
 * QuickBooks agent-sync service.
 *
 * Single place that turns an agent into a QuickBooks Online 1099 contractor
 * (a Vendor record with Vendor1099=true — agents are independent contractors,
 * not W-2 employees). Agents are only synced AFTER they become licensed (that
 * is when W-9 collection and direct deposit setup become relevant), so this
 * is gated on licensing by default.
 *
 * This deliberately does NOT send SSN or bank details to QuickBooks. Once the
 * Vendor record exists, an admin sends QuickBooks' own "invite contractor to
 * complete their W-9" email from inside QuickBooks Online — the contractor
 * then submits their own tax info and direct-deposit details directly to
 * QuickBooks via Intuit's hosted form, so RHP never has to collect, transmit,
 * or store that data itself. (There is no documented REST API endpoint to
 * trigger that invite email, so sending it remains a manual step for the
 * admin inside QuickBooks — this service only creates/links the contractor.)
 *
 * Used by:
 *  - the licensing flow (auto-sync the moment an agent becomes licensed)
 *  - the admin QuickBooks routes (manual single / bulk sync)
 */
const User = require('../models/User');
const APAApplication = require('../models/APAApplication');
const AuditLog = require('../models/AuditLog');
const qbo = require('./quickbooks');
const { isAgentLicensedById } = require('./licensing');

async function writeAudit(performedBy, targetUser, action, details) {
  try {
    await AuditLog.create({ performedBy, targetUser, action, details });
  } catch (_) { /* audit failures must never break the sync */ }
}

/**
 * Build the QBO Vendor (contractor) payload from agent + APA data.
 * Name/email/phone/address only — no SSN, no banking info. The contractor
 * supplies those themselves via QuickBooks' own W-9 invite flow.
 */
function buildVendorData(agent, apa) {
  let givenName = '';
  let middleName = '';
  let familyName = '';

  if (apa && apa.personalInfo) {
    givenName = apa.personalInfo.legalFirstName || '';
    middleName = apa.personalInfo.legalMiddleName || '';
    familyName = apa.personalInfo.legalLastName || '';
  }
  if (!givenName && !familyName) {
    const nameParts = (agent.name || '').trim().split(/\s+/);
    givenName = nameParts[0] || 'Unknown';
    familyName = nameParts.slice(1).join(' ') || 'Agent';
  }

  const vendorData = {
    givenName,
    middleName: middleName || undefined,
    familyName,
    email: agent.email,
    phone: apa?.personalInfo?.mobilePhone || agent.phone || undefined
  };

  const addr = apa?.personalInfo?.homeAddress;
  if (addr) {
    vendorData.address = { line1: addr.street, city: addr.city, state: addr.state, zip: addr.zipCode };
  } else if (agent.address) {
    vendorData.address = {
      line1: agent.address.street || agent.address.line1,
      city: agent.address.city,
      state: agent.address.state,
      zip: agent.address.zip || agent.address.zipCode
    };
  }

  return vendorData;
}

const INVITE_INSTRUCTIONS = 'Open this contractor in QuickBooks Online (Expenses > Vendors, or Payroll > Contractors) '
  + 'and send them the "Invite to complete W-9" email so they can submit their own tax info and direct deposit '
  + 'details directly to QuickBooks.';

/**
 * Sync a single agent to QuickBooks as a 1099 contractor (Vendor).
 *
 * @param {string} agentId
 * @param {string|null} actorId   admin who triggered it (null for system/auto)
 * @param {Object} [opts]
 * @param {boolean} [opts.requireLicensed=true]  gate on licensing (the core rule)
 * @returns {Promise<Object>} result with `status`, one of:
 *   'created' | 'already_exists' | 'skipped_unlicensed' |
 *   'skipped_not_connected' | 'not_found'
 *   (throws on unexpected QBO/API errors so callers can surface them)
 */
async function syncAgentToQBO(agentId, actorId = null, opts = {}) {
  const requireLicensed = opts.requireLicensed !== false;

  const agent = await User.findById(agentId).lean();
  if (!agent || agent.role !== 'agent') {
    return { status: 'not_found', message: 'Agent not found' };
  }

  // Core rule: never sync an agent who is not yet licensed.
  if (requireLicensed) {
    const licensed = await isAgentLicensedById(agentId);
    if (!licensed) {
      return {
        status: 'skipped_unlicensed',
        message: 'Agent must be licensed before they can be synced to QuickBooks.'
      };
    }
  }

  // Don't attempt API calls if QuickBooks isn't connected.
  const conn = await qbo.getConnectionStatus();
  if (!conn.connected) {
    return { status: 'skipped_not_connected', message: 'QuickBooks is not connected.' };
  }

  const apa = await APAApplication.findOne({ userId: agentId }).select('personalInfo').lean();
  const vendorData = buildVendorData(agent, apa);
  const displayName = [vendorData.givenName, vendorData.middleName, vendorData.familyName].filter(Boolean).join(' ');

  try {
    // Already present in QBO? Link instead of duplicating. QBO enforces
    // DisplayName as globally unique across Customer/Employee/Vendor, so it's
    // a reliable dedup key (PrimaryEmailAddr isn't queryable at all).
    const existing = await qbo.findVendorByDisplayName(displayName);
    if (existing) {
      await User.findByIdAndUpdate(agentId, {
        qboVendorId: existing.Id, qboSyncedAt: new Date(), qboSyncError: null, qboSyncErrorAt: null
      });
      await writeAudit(actorId, agentId, 'QBO_CONTRACTOR_SYNCED', {
        qboVendorId: existing.Id, linkedExisting: true
      });
      return {
        status: 'already_exists',
        qboVendorId: existing.Id,
        displayName: existing.DisplayName,
        nextStep: INVITE_INSTRUCTIONS
      };
    }

    const qboVendor = await qbo.createVendor(vendorData);

    await User.findByIdAndUpdate(agentId, {
      qboVendorId: qboVendor.Id, qboSyncedAt: new Date(), qboSyncError: null, qboSyncErrorAt: null
    });

    const dataIncluded = { email: !!vendorData.email, phone: !!vendorData.phone, address: !!vendorData.address };
    await writeAudit(actorId, agentId, 'QBO_CONTRACTOR_SYNCED', {
      qboVendorId: qboVendor.Id, displayName: qboVendor.DisplayName, ...dataIncluded
    });

    return {
      status: 'created',
      qboVendorId: qboVendor.Id,
      displayName: qboVendor.DisplayName,
      email: qboVendor.PrimaryEmailAddr?.Address,
      dataIncluded,
      nextStep: INVITE_INSTRUCTIONS
    };
  } catch (err) {
    // Persist so the failure is visible in the UI at any time (sync-status),
    // not just in the one-off response of whatever action triggered it.
    await User.findByIdAndUpdate(agentId, { qboSyncError: err.message, qboSyncErrorAt: new Date() }).catch(() => {});
    throw err;
  }
}

module.exports = { syncAgentToQBO, buildVendorData };
