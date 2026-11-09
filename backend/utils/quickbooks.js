/**
 * QuickBooks Online Integration Service
 * 
 * Handles OAuth2 token management and QBO API operations.
 * Tokens are stored in SystemConfig for persistence across restarts.
 */

const OAuthClient = require('intuit-oauth');
const SystemConfig = require('../models/SystemConfig');

// ---------------------------------------------------------------------------
// OAuth Client singleton
// ---------------------------------------------------------------------------
let _oauthClient = null;

function getOAuthClient() {
  if (!_oauthClient) {
    _oauthClient = new OAuthClient({
      clientId: process.env.QBO_CLIENT_ID,
      clientSecret: process.env.QBO_CLIENT_SECRET,
      environment: process.env.QBO_ENVIRONMENT || 'sandbox',
      redirectUri: process.env.QBO_REDIRECT_URI,
      logging: process.env.NODE_ENV !== 'production'
    });
  }
  return _oauthClient;
}

// ---------------------------------------------------------------------------
// Token persistence via SystemConfig
// ---------------------------------------------------------------------------
async function saveTokens(tokenData) {
  const payload = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    realmId: tokenData.realmId,
    expires_at: tokenData.expires_at || (Date.now() + (tokenData.expires_in || 3600) * 1000),
    refresh_expires_at: tokenData.refresh_expires_at || (Date.now() + 100 * 24 * 60 * 60 * 1000) // ~100 days
  };

  await SystemConfig.findOneAndUpdate(
    { key: 'qbo_tokens' },
    {
      key: 'qbo_tokens',
      value: JSON.stringify(payload),
      category: 'application',
      description: 'QuickBooks Online OAuth tokens',
      isSecret: true,
      isEditable: false
    },
    { upsert: true, new: true }
  );

  // A successful save means we're connected again — drop any disconnect warning.
  await SystemConfig.deleteOne({ key: 'qbo_disconnect_state' });

  return payload;
}

async function loadTokens() {
  const cfg = await SystemConfig.findOne({ key: 'qbo_tokens' });
  if (!cfg) return null;
  try {
    return JSON.parse(cfg.value);
  } catch {
    return null;
  }
}

async function clearTokens() {
  await SystemConfig.deleteOne({ key: 'qbo_tokens' });
}

// ---------------------------------------------------------------------------
// Disconnected-state flag
//
// When Intuit rejects the refresh token (invalid_grant: expired, revoked, or
// already rotated) the connection is unrecoverable without an admin
// re-authorizing. We drop the dead tokens and persist a flag so the admin UI
// can show a "QuickBooks disconnected" warning instead of a silent
// "Not Connected". The flag is cleared by saveTokens() on a successful connect.
// ---------------------------------------------------------------------------
async function markDisconnected(reason) {
  await clearTokens();
  await SystemConfig.findOneAndUpdate(
    { key: 'qbo_disconnect_state' },
    {
      key: 'qbo_disconnect_state',
      value: JSON.stringify({ reason, at: new Date().toISOString() }),
      category: 'application',
      description: 'QuickBooks Online forced-disconnect marker (refresh token rejected)',
      isSecret: false,
      isEditable: false
    },
    { upsert: true, new: true }
  );
  await notifyAdminsDisconnected(reason);
}

async function loadDisconnectState() {
  const cfg = await SystemConfig.findOne({ key: 'qbo_disconnect_state' });
  if (!cfg) return null;
  try {
    return JSON.parse(cfg.value);
  } catch {
    return null;
  }
}

async function clearDisconnectState() {
  await SystemConfig.deleteOne({ key: 'qbo_disconnect_state' });
}

async function notifyAdminsDisconnected(reason) {
  try {
    const User = require('../models/User');
    const Notification = require('../models/Notification');
    const admins = await User.find({ role: 'admin', isActive: true }).select('_id').lean();
    for (const admin of admins) {
      Notification.createNotification({
        userId: admin._id,
        type: 'qbo_disconnected',
        title: 'QuickBooks disconnected',
        message: 'The QuickBooks Online connection has expired or was revoked. '
          + 'Reconnect it in System Config to resume contractor sync.',
        link: '/admin/config',
        data: { reason }
      }, true).catch(() => {});
    }
  } catch (err) {
    console.error('[QBO] Failed to notify admins of disconnect:', err.message);
  }
}

/**
 * True only when Intuit definitively rejected the refresh token. Transient
 * failures (network, 5xx, rate limit) must NOT disconnect — the stored
 * refresh token is still good and the next attempt can succeed.
 */
function isInvalidGrant(err) {
  const body = err?.authResponse?.json || err?.authResponse?.getJson?.() || {};
  const text = [err?.error, err?.originalMessage, err?.message, err?.intuit_tid, body.error]
    .filter(Boolean).join(' ').toLowerCase();
  return text.includes('invalid_grant');
}

// ---------------------------------------------------------------------------
// Refresh (single-flight)
//
// Intuit rotates the refresh token on every refresh and invalidates the old
// one, so two concurrent refreshes would break the connection. Serialize them
// in-process, and re-read tokens after taking the lock in case another caller
// just refreshed.
// ---------------------------------------------------------------------------
let _refreshInFlight = null;

async function refreshTokens({ force = false } = {}) {
  if (_refreshInFlight) return _refreshInFlight;

  _refreshInFlight = (async () => {
    const tokens = await loadTokens();
    if (!tokens) throw new Error('QuickBooks is not connected. Admin must authorize first.');

    if (!force && tokens.expires_at && tokens.expires_at > Date.now() + 60000) {
      return tokens; // someone else already refreshed
    }

    if (!tokens.refresh_token) {
      await markDisconnected('refresh_token_missing');
      throw new Error('QuickBooks refresh token missing. Please reconnect.');
    }

    if (tokens.refresh_expires_at && tokens.refresh_expires_at < Date.now()) {
      await markDisconnected('refresh_token_expired');
      throw new Error('QuickBooks refresh token expired. Please reconnect.');
    }

    console.log('[QBO] Refreshing tokens...');
    const oauthClient = getOAuthClient();
    oauthClient.setToken({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type: 'bearer',
      realmId: tokens.realmId
    });

    try {
      const authResponse = await oauthClient.refresh();
      const newToken = authResponse.getJson();
      // Persist the ROTATED refresh token (and reset the 100-day window).
      // Fall back to the old one only if Intuit omitted it.
      const saved = await saveTokens({
        access_token: newToken.access_token,
        refresh_token: newToken.refresh_token || tokens.refresh_token,
        realmId: tokens.realmId,
        expires_in: newToken.expires_in
      });
      console.log('[QBO] Token refreshed successfully');
      return saved;
    } catch (err) {
      console.error('[QBO] Token refresh failed:', err.message);
      if (isInvalidGrant(err)) {
        await markDisconnected('invalid_grant');
        throw new Error('QuickBooks connection expired (invalid_grant). Please reconnect.');
      }
      // Transient failure: keep the tokens so a later attempt can succeed.
      throw new Error(`QuickBooks token refresh failed: ${err.message}`);
    }
  })().finally(() => { _refreshInFlight = null; });

  return _refreshInFlight;
}

// ---------------------------------------------------------------------------
// Ensure valid access token (auto-refresh if expired)
// ---------------------------------------------------------------------------
async function getValidToken() {
  const tokens = await loadTokens();
  if (!tokens) throw new Error('QuickBooks is not connected. Admin must authorize first.');

  // Token still valid (with 60s buffer)
  if (tokens.expires_at && tokens.expires_at > Date.now() + 60000) {
    return tokens;
  }

  return refreshTokens();
}

// ---------------------------------------------------------------------------
// QBO API helpers
// ---------------------------------------------------------------------------
function getBaseUrl(realmId) {
  const env = process.env.QBO_ENVIRONMENT || 'sandbox';
  const base = env === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com';
  return `${base}/v3/company/${realmId}`;
}

async function qboRequest(method, endpoint, data = null) {
  const tokens = await getValidToken();
  const url = `${getBaseUrl(tokens.realmId)}${endpoint}`;
  const axios = require('axios');

  const config = {
    method,
    url,
    headers: {
      'Authorization': `Bearer ${tokens.access_token}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    timeout: 15000
  };

  if (data && (method === 'POST' || method === 'PUT')) {
    config.data = data;
  }

  try {
    const response = await axios(config);
    return response.data;
  } catch (err) {
    const msg = err.response?.data?.Fault?.Error?.[0]?.Detail
      || err.response?.data?.Fault?.Error?.[0]?.Message
      || err.message;
    console.error(`[QBO] API error ${method} ${endpoint}:`, msg);
    throw new Error(`QuickBooks API error: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Vendor (1099 contractor) operations
//
// Agents are independent 1099 contractors, not W-2 employees, so they are
// created in QBO as Vendor records with Vendor1099=true — NOT as Employee
// records. This is what makes them show up under QuickBooks' Contractors
// list, where an admin can send the built-in "invite to complete W-9" email:
// QuickBooks (not RHP) then collects the contractor's SSN/tax info and
// direct-deposit bank details directly from the contractor via Intuit's own
// hosted form. That invite-send action is a QuickBooks Online UI step (no
// documented REST API endpoint for it as of this writing) — this integration
// only creates/links the Vendor record; sending the invite itself is a
// manual one-click step for the admin inside QuickBooks.
// ---------------------------------------------------------------------------

/**
 * Create a 1099 contractor (Vendor) in QuickBooks Online.
 * Deliberately does NOT send SSN/tax ID — the contractor supplies that
 * themselves via QuickBooks' own W-9 invite flow, not through this app.
 * @param {Object} vendorData - { givenName, middleName, familyName, email, phone, address }
 */
async function createVendor(vendorData) {
  const displayName = [vendorData.givenName, vendorData.middleName, vendorData.familyName]
    .filter(Boolean).join(' ');

  const payload = {
    GivenName: vendorData.givenName,
    MiddleName: vendorData.middleName || undefined,
    FamilyName: vendorData.familyName,
    DisplayName: displayName,
    PrintOnCheckName: `${vendorData.familyName}, ${vendorData.givenName}`,
    PrimaryEmailAddr: vendorData.email ? { Address: vendorData.email } : undefined,
    PrimaryPhone: vendorData.phone ? { FreeFormNumber: vendorData.phone } : undefined,
    Vendor1099: true,
    BillAddr: vendorData.address ? {
      Line1: vendorData.address.line1,
      City: vendorData.address.city,
      CountrySubDivisionCode: vendorData.address.state,
      PostalCode: vendorData.address.zip
    } : undefined
  };

  // Remove undefined fields
  Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

  const result = await qboRequest('POST', '/vendor', payload);
  return result.Vendor;
}

/**
 * Update an existing 1099 contractor (Vendor) in QuickBooks Online.
 * QBO requires SyncToken for optimistic locking.
 */
async function updateVendor(vendorId, vendorData) {
  // Fetch current vendor to get SyncToken
  const current = await qboRequest('GET', `/vendor/${vendorId}`);
  const existing = current.Vendor;

  const payload = {
    Id: vendorId,
    SyncToken: existing.SyncToken,
    GivenName: vendorData.givenName || existing.GivenName,
    MiddleName: vendorData.middleName || existing.MiddleName,
    FamilyName: vendorData.familyName || existing.FamilyName,
    DisplayName: [vendorData.givenName, vendorData.middleName, vendorData.familyName]
      .filter(Boolean).join(' ') || existing.DisplayName,
    PrintOnCheckName: vendorData.familyName
      ? `${vendorData.familyName}, ${vendorData.givenName}`
      : existing.PrintOnCheckName,
    PrimaryEmailAddr: vendorData.email ? { Address: vendorData.email } : existing.PrimaryEmailAddr,
    PrimaryPhone: vendorData.phone ? { FreeFormNumber: vendorData.phone } : existing.PrimaryPhone,
    Vendor1099: true,
    BillAddr: vendorData.address ? {
      Line1: vendorData.address.line1,
      City: vendorData.address.city,
      CountrySubDivisionCode: vendorData.address.state,
      PostalCode: vendorData.address.zip
    } : existing.BillAddr
  };

  Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

  const result = await qboRequest('POST', '/vendor', payload);
  return result.Vendor;
}

/**
 * Query vendors by display name. PrimaryEmailAddr is NOT a queryable field on
 * the QBO Vendor entity (confirmed via Intuit's API docs — querying it throws
 * "QueryValidationError: property 'PrimaryEmailAddr' is not queryable").
 * DisplayName is queryable and QBO enforces it to be globally unique across
 * Customer/Employee/Vendor, making it a reliable dedup key instead.
 */
async function findVendorByDisplayName(displayName) {
  const safeName = displayName.replace(/'/g, "\\'");
  const query = encodeURIComponent(`SELECT * FROM Vendor WHERE DisplayName = '${safeName}'`);
  const result = await qboRequest('GET', `/query?query=${query}`);
  const vendors = result.QueryResponse?.Vendor || [];
  return vendors.length > 0 ? vendors[0] : null;
}

/**
 * Get company info to verify connection
 */
async function getCompanyInfo() {
  const tokens = await getValidToken();
  const result = await qboRequest('GET', `/companyinfo/${tokens.realmId}`);
  return result.CompanyInfo;
}

// ---------------------------------------------------------------------------
// Connection status
// ---------------------------------------------------------------------------
async function getConnectionStatus() {
  const tokens = await loadTokens();
  if (!tokens) {
    const disconnectState = await loadDisconnectState();
    return disconnectState
      ? { connected: false, disconnected: true, disconnectReason: disconnectState.reason, disconnectedAt: disconnectState.at }
      : { connected: false };
  }

  const now = Date.now();
  const tokenValid = tokens.expires_at > now;
  const refreshValid = tokens.refresh_expires_at > now;

  return {
    connected: true,
    realmId: tokens.realmId,
    tokenValid,
    refreshValid,
    expiresAt: new Date(tokens.expires_at).toISOString(),
    refreshExpiresAt: new Date(tokens.refresh_expires_at).toISOString()
  };
}

module.exports = {
  getOAuthClient,
  saveTokens,
  loadTokens,
  clearTokens,
  clearDisconnectState,
  refreshTokens,
  isInvalidGrant,
  getValidToken,
  qboRequest,
  createVendor,
  updateVendor,
  findVendorByDisplayName,
  getCompanyInfo,
  getConnectionStatus
};
