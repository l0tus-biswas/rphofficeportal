/**
 * QuickBooks agent-sync service.
 *
 * Single place that turns an agent into a QuickBooks Online employee. Agents are
 * only synced AFTER they become licensed (that is when W-9 collection and direct
 * deposit setup become relevant), so this is gated on licensing by default.
 *
 * Used by:
 *  - the licensing flow (auto-sync the moment an agent becomes licensed)
 *  - the admin QuickBooks routes (manual single / bulk sync)
 */
const User = require('../models/User');
const APAApplication = require('../models/APAApplication');
const OnboardingDocType = require('../models/OnboardingDocType');
const OnboardingDocument = require('../models/OnboardingDocument');
const AuditLog = require('../models/AuditLog');
const qbo = require('./quickbooks');
const { decrypt } = require('./encryption');
const { isAgentLicensedById } = require('./licensing');

async function writeAudit(performedBy, targetUser, action, details) {
  try {
    await AuditLog.create({ performedBy, targetUser, action, details });
  } catch (_) { /* audit failures must never break the sync */ }
}

/**
 * Build the QBO employee payload from agent + APA (W-9) data.
 */
function buildEmployeeData(agent, apa) {
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

  const employeeData = {
    givenName,
    middleName: middleName || undefined,
    familyName,
    email: agent.email,
    phone: apa?.personalInfo?.mobilePhone || agent.phone || undefined,
    ssn: apa?.personalInfo?.ssn || undefined,
    birthDate: apa?.personalInfo?.dateOfBirth || undefined,
    gender: apa?.personalInfo?.gender || undefined
  };

  const addr = apa?.personalInfo?.homeAddress;
  if (addr) {
    employeeData.address = { line1: addr.street, city: addr.city, state: addr.state, zip: addr.zipCode };
  } else if (agent.address) {
    employeeData.address = {
      line1: agent.address.street || agent.address.line1,
      city: agent.address.city,
      state: agent.address.state,
      zip: agent.address.zip || agent.address.zipCode
    };
  }

  return employeeData;
}

/**
 * Fetch decrypted direct-deposit bank info for an agent, if collected.
 * (QBO Accounting API can't store these — used only for reporting which data
 * was available; full direct deposit requires a QBO Payroll subscription.)
 */
async function getBankInfo(agentId) {
  const ddDocType = await OnboardingDocType.findOne({ hasDirectDepositFields: true, isActive: true })
    .select('_id').lean();
  if (!ddDocType) return null;

  const ddDoc = await OnboardingDocument.findOne({
    agent: agentId,
    docType: ddDocType._id,
    deletedAt: null,
    bankRoutingNumber: { $ne: null }
  }).select('bankRoutingNumber bankAccountNumber bankAccountType').lean();
  if (!ddDoc) return null;

  try {
    return {
      routingNumber: decrypt(ddDoc.bankRoutingNumber),
      accountNumber: decrypt(ddDoc.bankAccountNumber),
      accountType: ddDoc.bankAccountType
    };
  } catch (_) {
    return null;
  }
}

/**
 * Sync a single agent to QuickBooks as an employee.
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

  // Already present in QBO? Link instead of duplicating.
  const existing = await qbo.findEmployeeByEmail(agent.email);
  if (existing) {
    await User.findByIdAndUpdate(agentId, { qboEmployeeId: existing.Id, qboSyncedAt: new Date() });
    await writeAudit(actorId, agentId, 'QBO_EMPLOYEE_SYNCED', {
      qboEmployeeId: existing.Id, linkedExisting: true
    });
    return { status: 'already_exists', qboEmployeeId: existing.Id, displayName: existing.DisplayName };
  }

  const apa = await APAApplication.findOne({ userId: agentId }).select('personalInfo').lean();
  const employeeData = buildEmployeeData(agent, apa);
  const bankInfo = await getBankInfo(agentId);

  const qboEmployee = await qbo.createEmployee(employeeData);

  await User.findByIdAndUpdate(agentId, { qboEmployeeId: qboEmployee.Id, qboSyncedAt: new Date() });

  const dataIncluded = { ssn: !!employeeData.ssn, address: !!employeeData.address, bankInfo: !!bankInfo };
  await writeAudit(actorId, agentId, 'QBO_EMPLOYEE_SYNCED', {
    qboEmployeeId: qboEmployee.Id, displayName: qboEmployee.DisplayName, ...dataIncluded
  });

  return {
    status: 'created',
    qboEmployeeId: qboEmployee.Id,
    displayName: qboEmployee.DisplayName,
    email: qboEmployee.PrimaryEmailAddr?.Address,
    dataIncluded,
    bankInfoNote: bankInfo
      ? 'Bank info retrieved but QBO Accounting API does not support direct deposit fields. Requires QBO Payroll subscription.'
      : 'No bank info on file'
  };
}

module.exports = { syncAgentToQBO, buildEmployeeData };
