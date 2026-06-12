/**
 * QuickBooks Online Integration Routes
 * 
 * Admin-only OAuth flow + employee sync.
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
const { decrypt } = require('../utils/encryption');

// ---------------------------------------------------------------------------
// Helper: audit log
// ---------------------------------------------------------------------------
async function auditLog(actor, target, action, details) {
  try {
    await AuditLog.create({ actor, targetAgent: target, action, details });
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
// @route   POST /api/quickbooks/sync-employee/:agentId
// @desc    Create/update employee in QBO from agent data + Direct Deposit info
// @access  Admin only
// ---------------------------------------------------------------------------
router.post('/sync-employee/:agentId', authenticate, authorize('admin'), async (req, res) => {
  try {
    const agent = await User.findById(req.params.agentId).lean();
    if (!agent) return res.status(404).json({ message: 'Agent not found' });

    // Check if already synced
    const existing = await qbo.findEmployeeByEmail(agent.email);
    if (existing) {
      // Link existing QBO employee to our user
      await User.findByIdAndUpdate(req.params.agentId, {
        qboEmployeeId: existing.Id,
        qboSyncedAt: new Date()
      });
      return res.status(409).json({
        message: 'Employee already exists in QuickBooks',
        qboEmployeeId: existing.Id,
        displayName: existing.DisplayName
      });
    }

    // Fetch APA Application for W-9 data (SSN, legal name, address, DOB)
    const apa = await APAApplication.findOne({ userId: req.params.agentId })
      .select('personalInfo')
      .lean();

    // Use legal name from APA if available, otherwise parse from User
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

    // Build employee data with W-9 fields
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

    // Address from APA application (more complete than User model)
    const addr = apa?.personalInfo?.homeAddress;
    if (addr) {
      employeeData.address = {
        line1: addr.street,
        city: addr.city,
        state: addr.state,
        zip: addr.zipCode
      };
    } else if (agent.address) {
      employeeData.address = {
        line1: agent.address.street || agent.address.line1,
        city: agent.address.city,
        state: agent.address.state,
        zip: agent.address.zip || agent.address.zipCode
      };
    }

    // Fetch Direct Deposit bank info (encrypted)
    const ddDocType = await OnboardingDocType.findOne({
      hasDirectDepositFields: true,
      isActive: true
    }).select('_id').lean();

    let bankInfo = null;
    if (ddDocType) {
      const ddDoc = await OnboardingDocument.findOne({
        agent: req.params.agentId,
        docType: ddDocType._id,
        deletedAt: null,
        bankRoutingNumber: { $ne: null }
      }).select('bankRoutingNumber bankAccountNumber bankAccountType').lean();

      if (ddDoc) {
        bankInfo = {
          routingNumber: decrypt(ddDoc.bankRoutingNumber),
          accountNumber: decrypt(ddDoc.bankAccountNumber),
          accountType: ddDoc.bankAccountType
        };
      }
    }

    const qboEmployee = await qbo.createEmployee(employeeData);

    // Mark agent as synced
    await User.findByIdAndUpdate(req.params.agentId, {
      qboEmployeeId: qboEmployee.Id,
      qboSyncedAt: new Date()
    });

    const syncDetails = {
      qboEmployeeId: qboEmployee.Id,
      displayName: qboEmployee.DisplayName,
      includedSSN: !!employeeData.ssn,
      includedAddress: !!employeeData.address,
      includedBankInfo: !!bankInfo
    };
    await auditLog(req.user._id, req.params.agentId, 'QBO_EMPLOYEE_SYNCED', syncDetails);

    res.json({
      message: 'Employee created in QuickBooks',
      employee: {
        id: qboEmployee.Id,
        displayName: qboEmployee.DisplayName,
        email: qboEmployee.PrimaryEmailAddr?.Address
      },
      dataIncluded: {
        ssn: !!employeeData.ssn,
        address: !!employeeData.address,
        bankInfo: !!bankInfo,
        bankInfoNote: bankInfo
          ? 'Bank info retrieved but QBO Accounting API does not support direct deposit fields. Requires QBO Payroll subscription.'
          : 'No bank info on file'
      }
    });
  } catch (error) {
    console.error('[QBO] Sync employee error:', error.message);
    res.status(500).json({ message: error.message });
  }
});

// ---------------------------------------------------------------------------
// @route   POST /api/quickbooks/resync-employee/:agentId
// @desc    Re-sync (update) an already-synced employee in QBO with latest data
// @access  Admin only
// ---------------------------------------------------------------------------
router.post('/resync-employee/:agentId', authenticate, authorize('admin'), async (req, res) => {
  try {
    const agent = await User.findById(req.params.agentId).lean();
    if (!agent) return res.status(404).json({ message: 'Agent not found' });
    if (!agent.qboEmployeeId) return res.status(400).json({ message: 'Agent has not been synced to QuickBooks yet' });

    // Fetch APA Application for W-9 data
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
        city: agent.address.city, state: agent.address.state,
        zip: agent.address.zip || agent.address.zipCode
      };
    }

    const qboEmployee = await qbo.updateEmployee(agent.qboEmployeeId, employeeData);

    await User.findByIdAndUpdate(req.params.agentId, { qboSyncedAt: new Date() });

    await auditLog(req.user._id, req.params.agentId, 'QBO_EMPLOYEE_RESYNCED', {
      qboEmployeeId: qboEmployee.Id,
      displayName: qboEmployee.DisplayName
    });

    res.json({
      message: 'Employee updated in QuickBooks',
      employee: {
        id: qboEmployee.Id,
        displayName: qboEmployee.DisplayName,
        email: qboEmployee.PrimaryEmailAddr?.Address
      }
    });
  } catch (error) {
    console.error('[QBO] Resync employee error:', error.message);
    res.status(500).json({ message: error.message });
  }
});

// ---------------------------------------------------------------------------
// @route   POST /api/quickbooks/sync-all-employees
// @desc    Bulk sync all licensed agents to QBO
// @access  Admin only
// ---------------------------------------------------------------------------
router.post('/sync-all-employees', authenticate, authorize('admin'), async (req, res) => {
  try {
    // Find all active agents without a QBO employee ID
    const agents = await User.find({
      role: 'agent',
      isActive: true,
      qboEmployeeId: { $exists: false }
    }).select('_id name email phone address').lean();

    if (agents.length === 0) {
      return res.json({ message: 'All agents are already synced', synced: 0, errors: 0 });
    }

    // Pre-fetch all APA applications for these agents
    const agentIds = agents.map(a => a._id);
    const apaApps = await APAApplication.find({ userId: { $in: agentIds } })
      .select('userId personalInfo')
      .lean();
    const apaByUser = {};
    apaApps.forEach(a => { apaByUser[a.userId.toString()] = a; });

    let synced = 0;
    let errors = 0;
    const results = [];

    for (const agent of agents) {
      try {
        // Check if already in QBO by email
        const existing = await qbo.findEmployeeByEmail(agent.email);
        if (existing) {
          await User.findByIdAndUpdate(agent._id, {
            qboEmployeeId: existing.Id,
            qboSyncedAt: new Date()
          });
          results.push({ agentId: agent._id, name: agent.name, status: 'already_exists', qboId: existing.Id });
          synced++;
          continue;
        }

        // Build employee data from APA Application (W-9 data)
        const apa = apaByUser[agent._id.toString()];
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

        const qboEmployee = await qbo.createEmployee(employeeData);

        await User.findByIdAndUpdate(agent._id, {
          qboEmployeeId: qboEmployee.Id,
          qboSyncedAt: new Date()
        });

        results.push({
          agentId: agent._id, name: agent.name, status: 'created',
          qboId: qboEmployee.Id, includedSSN: !!employeeData.ssn
        });
        synced++;
      } catch (err) {
        results.push({ agentId: agent._id, name: agent.name, status: 'error', error: err.message });
        errors++;
      }
    }

    await auditLog(req.user._id, null, 'QBO_BULK_SYNC', { synced, errors, total: agents.length });

    res.json({ message: `Synced ${synced} employees`, synced, errors, total: agents.length, results });
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
      .select('_id name email qboEmployeeId qboSyncedAt')
      .sort('name')
      .lean();

    const synced = agents.filter(a => a.qboEmployeeId);
    const unsynced = agents.filter(a => !a.qboEmployeeId);

    res.json({
      total: agents.length,
      syncedCount: synced.length,
      unsyncedCount: unsynced.length,
      synced,
      unsynced
    });
  } catch (error) {
    console.error('[QBO] Sync status error:', error.message);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
