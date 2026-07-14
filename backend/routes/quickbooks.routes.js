/**
 * QuickBooks Online Integration Routes
 *
 * Admin-only OAuth flow + 1099 contractor (Vendor) sync.
 * Agents never interact with QBO directly.
 */

const express = require('express');
const router = express.Router();
const { protect: authenticate, authorize } = require('../middleware/auth.middleware');
const { logAction } = require('../middleware/audit.middleware');
const User = require('../models/User');
const OnboardingDocument = require('../models/OnboardingDocument');
const OnboardingDocType = require('../models/OnboardingDocType');
const AuditLog = require('../models/AuditLog');
const APAApplication = require('../models/APAApplication');
const OAuthClient = require('intuit-oauth');
const crypto = require('crypto');
const qbo = require('../utils/quickbooks');
const { syncAgentToQBO } = require('../utils/quickbooksSync');
const { isAgentLicensed } = require('../utils/licensing');
const LicensingProgress = require('../models/LicensingProgress');

// ---------------------------------------------------------------------------
// Helper: audit log
// ---------------------------------------------------------------------------
async function auditLog(performedBy, targetUser, action, details) {
  try {
    await AuditLog.create({ performedBy, targetUser, action, details });
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// @route   GET /api/quickbooks/status
// @desc    Check QBO connection status
// @access  Admin only
// ---------------------------------------------------------------------------
router.get('/status', authenticate, authorize('admin'), async (req, res) => {
  try {
    const status = await qbo.getConnectionStatus();
    if (status.connected) {
      try {
        const company = await qbo.getCompanyInfo();
        status.companyName = company.CompanyName;
      } catch (_) {
        // Token may be invalid — still return status
      }
    }
    res.json(status);
  } catch (error) {
    console.error('[QBO] Status error:', error.message);
    res.status(500).json({ message: 'Failed to check QuickBooks status', error: error.message });
  }
});

// ---------------------------------------------------------------------------
// @route   GET /api/quickbooks/connect
// @desc    Start OAuth2 authorization flow (redirects to Intuit)
// @access  Admin only
// ---------------------------------------------------------------------------
router.get('/connect', authenticate, authorize('admin'), async (req, res) => {
  try {
    const oauthClient = qbo.getOAuthClient();
    
    // Generate a cryptographic state nonce to prevent CSRF
    const stateNonce = crypto.randomBytes(24).toString('hex');
    const SystemConfig = require('../models/SystemConfig');
    await SystemConfig.findOneAndUpdate(
      { key: 'qbo_oauth_state' },
      { key: 'qbo_oauth_state', value: { nonce: stateNonce, userId: req.user._id.toString(), createdAt: new Date() } },
      { upsert: true }
    );
    
    const authUri = oauthClient.authorizeUri({
      scope: [OAuthClient.scopes.Accounting],
      state: stateNonce
    });
    res.json({ authUri });
  } catch (error) {
    console.error('[QBO] Connect error:', error.message);
    res.status(500).json({ message: 'Failed to generate authorization URL', error: error.message });
  }
});


// ---------------------------------------------------------------------------
// @route   GET /api/quickbooks/callback
// @desc    OAuth2 callback — exchange code for tokens
// @access  Public (Intuit redirects here)
// ---------------------------------------------------------------------------
router.get('/callback', async (req, res) => {
  try {
    // Validate OAuth state parameter to prevent CSRF
    const state = req.query.state;
    const SystemConfig = require('../models/SystemConfig');
    const storedState = await SystemConfig.findOne({ key: 'qbo_oauth_state' });
    
    if (!state || !storedState || storedState.value.nonce !== state) {
      console.error('[QBO] Callback: invalid or missing state parameter');
      const appUrl = process.env.APP_URL || 'http://localhost:4200';
      return res.redirect(`${appUrl}/admin/config?qbo=error&message=${encodeURIComponent('Invalid OAuth state - possible CSRF attack')}`);
    }
    
    // Check if state is expired (10 minute window)
    const stateAge = Date.now() - new Date(storedState.value.createdAt).getTime();
    if (stateAge > 10 * 60 * 1000) {
      await SystemConfig.deleteOne({ key: 'qbo_oauth_state' });
      const appUrl = process.env.APP_URL || 'http://localhost:4200';
      return res.redirect(`${appUrl}/admin/config?qbo=error&message=${encodeURIComponent('OAuth state expired - please try again')}`);
    }
    
    // Clear the used state nonce (single-use)
    await SystemConfig.deleteOne({ key: 'qbo_oauth_state' });

    const oauthClient = qbo.getOAuthClient();
    const authResponse = await oauthClient.createToken(req.url);
    const tokenData = authResponse.getJson();
    const realmId = req.query.realmId;

    await qbo.saveTokens({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      realmId,
      expires_in: tokenData.expires_in
    });

    console.log('[QBO] Connected successfully, realmId:', realmId);

    // Redirect admin back to the settings page
    const appUrl = process.env.APP_URL || 'http://localhost:4200';
    res.redirect(`${appUrl}/admin/config?qbo=connected`);
  } catch (error) {
    console.error('[QBO] Callback error:', error.message);
    const appUrl = process.env.APP_URL || 'http://localhost:4200';
    res.redirect(`${appUrl}/admin/config?qbo=error&message=${encodeURIComponent(error.message)}`);
  }
});

// ---------------------------------------------------------------------------
// @route   POST /api/quickbooks/disconnect
// @desc    Disconnect from QuickBooks
// @access  Admin only
// ---------------------------------------------------------------------------
router.post('/disconnect', authenticate, authorize('admin'), async (req, res) => {
  try {
    // Try to revoke the token first
    const tokens = await qbo.loadTokens();
    if (tokens) {
      try {
        const oauthClient = qbo.getOAuthClient();
        oauthClient.setToken({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_type: 'bearer'
        });
        await oauthClient.revoke({ token_type_hint: 'access_token' });
      } catch (_) {
        // Revoke may fail if token already expired — that's OK
      }
    }

    await qbo.clearTokens();
    await auditLog(req.user._id, null, 'QBO_DISCONNECTED', {});
    res.json({ message: 'QuickBooks disconnected successfully' });
  } catch (error) {
    console.error('[QBO] Disconnect error:', error.message);
    res.status(500).json({ message: 'Failed to disconnect', error: error.message });
  }
});

// ---------------------------------------------------------------------------
// @route   POST /api/quickbooks/sync-contractor/:agentId
// @desc    Create a 1099 contractor (Vendor) in QBO from agent data.
//          Only permitted once the agent is licensed. Does not send SSN or
//          banking info — QuickBooks collects that directly from the
//          contractor via its own W-9 invite flow.
// @access  Admin only
// ---------------------------------------------------------------------------
router.post('/sync-contractor/:agentId', authenticate, authorize('admin'), async (req, res) => {
  try {
    const result = await syncAgentToQBO(req.params.agentId, req.user._id);

    switch (result.status) {
      case 'not_found':
        return res.status(404).json({ message: 'Agent not found' });
      case 'skipped_unlicensed':
        return res.status(400).json({ message: result.message });
      case 'skipped_not_connected':
        return res.status(400).json({ message: result.message });
      case 'already_exists':
        return res.status(409).json({
          message: 'Contractor already exists in QuickBooks',
          qboVendorId: result.qboVendorId,
          displayName: result.displayName,
          nextStep: result.nextStep
        });
      case 'created':
        return res.json({
          message: 'Contractor created in QuickBooks',
          contractor: {
            id: result.qboVendorId,
            displayName: result.displayName,
            email: result.email
          },
          dataIncluded: result.dataIncluded,
          nextStep: result.nextStep
        });
      default:
        return res.status(500).json({ message: 'Unexpected sync result' });
    }
  } catch (error) {
    console.error('[QBO] Sync contractor error:', error.message);
    res.status(500).json({ message: error.message });
  }
});

// ---------------------------------------------------------------------------
// @route   POST /api/quickbooks/resync-contractor/:agentId
// @desc    Re-sync (update) an already-synced contractor in QBO with latest
//          name/email/phone/address. Never sends SSN or banking info.
// @access  Admin only
// ---------------------------------------------------------------------------
router.post('/resync-contractor/:agentId', authenticate, authorize('admin'), async (req, res) => {
  try {
    const agent = await User.findById(req.params.agentId).lean();
    if (!agent) return res.status(404).json({ message: 'Agent not found' });
    if (!agent.qboVendorId) return res.status(400).json({ message: 'Agent has not been synced to QuickBooks yet' });

    // Fetch APA Application for name/contact data
    const apa = await APAApplication.findOne({ userId: req.params.agentId })
      .select('personalInfo').lean();

    let givenName, middleName, familyName;
    if (apa?.personalInfo) {
      givenName = apa.personalInfo.legalFirstName || '';
      middleName = apa.personalInfo.legalMiddleName || '';
      familyName = apa.personalInfo.legalLastName || '';
    } else {
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
        city: agent.address.city, state: agent.address.state,
        zip: agent.address.zip || agent.address.zipCode
      };
    }

    const qboVendor = await qbo.updateVendor(agent.qboVendorId, vendorData);

    await User.findByIdAndUpdate(req.params.agentId, { qboSyncedAt: new Date() });

    await auditLog(req.user._id, req.params.agentId, 'QBO_CONTRACTOR_RESYNCED', {
      qboVendorId: qboVendor.Id,
      displayName: qboVendor.DisplayName
    });

    res.json({
      message: 'Contractor updated in QuickBooks',
      contractor: {
        id: qboVendor.Id,
        displayName: qboVendor.DisplayName,
        email: qboVendor.PrimaryEmailAddr?.Address
      }
    });
  } catch (error) {
    console.error('[QBO] Resync contractor error:', error.message);
    res.status(500).json({ message: error.message });
  }
});

// ---------------------------------------------------------------------------
// @route   POST /api/quickbooks/sync-all-contractors
// @desc    Bulk sync all LICENSED, not-yet-synced agents to QBO as contractors.
//          Unlicensed agents are intentionally skipped.
// @access  Admin only
// ---------------------------------------------------------------------------
router.post('/sync-all-contractors', authenticate, authorize('admin'), async (req, res) => {
  try {
    const conn = await qbo.getConnectionStatus();
    if (!conn.connected) {
      return res.status(400).json({ message: 'QuickBooks is not connected.' });
    }

    // Candidate agents: active and not yet synced
    const candidates = await User.find({
      role: 'agent',
      isActive: true,
      qboVendorId: { $exists: false }
    }).select('_id name email metadata').lean();

    if (candidates.length === 0) {
      return res.json({ message: 'All agents are already synced', synced: 0, errors: 0, skippedUnlicensed: 0, total: 0, results: [] });
    }

    // Bulk-load licensing data to filter down to licensed agents only
    const ids = candidates.map(a => a._id);
    const [progresses, apaApps] = await Promise.all([
      LicensingProgress.find({ agent: { $in: ids } }).lean(),
      APAApplication.find({ userId: { $in: ids } }).select('userId licensingStatus').lean()
    ]);
    const progressByAgent = {};
    progresses.forEach(p => { progressByAgent[p.agent.toString()] = p; });
    const apaByUser = {};
    apaApps.forEach(a => { apaByUser[a.userId.toString()] = a; });

    const licensed = [];
    let skippedUnlicensed = 0;
    for (const agent of candidates) {
      const id = agent._id.toString();
      if (isAgentLicensed(progressByAgent[id], apaByUser[id], agent.metadata)) {
        licensed.push(agent);
      } else {
        skippedUnlicensed++;
      }
    }

    let synced = 0;
    let errors = 0;
    const results = [];

    for (const agent of licensed) {
      try {
        // Already pre-filtered as licensed, so skip the per-agent re-check
        const r = await syncAgentToQBO(agent._id, req.user._id, { requireLicensed: false });
        if (r.status === 'created' || r.status === 'already_exists') {
          results.push({ agentId: agent._id, name: agent.name, status: r.status, qboId: r.qboVendorId });
          synced++;
        } else {
          results.push({ agentId: agent._id, name: agent.name, status: r.status, message: r.message });
        }
      } catch (err) {
        results.push({ agentId: agent._id, name: agent.name, status: 'error', error: err.message });
        errors++;
      }
    }

    await auditLog(req.user._id, null, 'QBO_BULK_SYNC', { synced, errors, skippedUnlicensed, total: candidates.length });

    res.json({
      message: `Synced ${synced} licensed contractor(s). Skipped ${skippedUnlicensed} unlicensed agent(s).`,
      synced, errors, skippedUnlicensed, total: candidates.length, results
    });
  } catch (error) {
    console.error('[QBO] Bulk sync error:', error.message);
    res.status(500).json({ message: error.message });
  }
});

// ---------------------------------------------------------------------------
// @route   GET /api/quickbooks/sync-status
// @desc    Get sync status for all agents
// @access  Admin only
// ---------------------------------------------------------------------------
router.get('/sync-status', authenticate, authorize('admin'), async (req, res) => {
  try {
    const agents = await User.find({ role: 'agent', isActive: true })
      .select('_id name email qboVendorId qboSyncedAt qboSyncError qboSyncErrorAt metadata')
      .sort('name')
      .lean();

    // Bulk-load licensing data so we can flag who is eligible to sync
    const ids = agents.map(a => a._id);
    const [progresses, apaApps] = await Promise.all([
      LicensingProgress.find({ agent: { $in: ids } }).lean(),
      APAApplication.find({ userId: { $in: ids } }).select('userId licensingStatus').lean()
    ]);
    const progressByAgent = {};
    progresses.forEach(p => { progressByAgent[p.agent.toString()] = p; });
    const apaByUser = {};
    apaApps.forEach(a => { apaByUser[a.userId.toString()] = a; });

    const synced = [];
    const unsynced = [];       // licensed but not yet synced (eligible)
    const notLicensed = [];    // not eligible until licensed
    for (const a of agents) {
      const id = a._id.toString();
      const licensed = isAgentLicensed(progressByAgent[id], apaByUser[id], a.metadata);
      const view = {
        _id: a._id, name: a.name, email: a.email, qboVendorId: a.qboVendorId, qboSyncedAt: a.qboSyncedAt,
        qboSyncError: a.qboSyncError || null, qboSyncErrorAt: a.qboSyncErrorAt || null, licensed
      };
      if (a.qboVendorId) synced.push(view);
      else if (licensed) unsynced.push(view);
      else notLicensed.push(view);
    }

    const failedCount = unsynced.filter(a => a.qboSyncError).length;

    res.json({
      total: agents.length,
      syncedCount: synced.length,
      unsyncedCount: unsynced.length,       // licensed & awaiting sync
      notLicensedCount: notLicensed.length, // not yet eligible
      failedCount,                          // subset of unsynced with a stored error
      synced,
      unsynced,
      notLicensed
    });
  } catch (error) {
    console.error('[QBO] Sync status error:', error.message);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
