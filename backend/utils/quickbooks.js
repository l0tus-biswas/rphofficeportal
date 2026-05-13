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
// Ensure valid access token (auto-refresh if expired)
// ---------------------------------------------------------------------------
async function getValidToken() {
  const tokens = await loadTokens();
  if (!tokens) throw new Error('QuickBooks is not connected. Admin must authorize first.');

  const now = Date.now();

  // Token still valid (with 60s buffer)
  if (tokens.expires_at && tokens.expires_at > now + 60000) {
    return tokens;
  }

  // Token expired — try refresh
  if (!tokens.refresh_token) {
    await clearTokens();
    throw new Error('QuickBooks refresh token missing. Please reconnect.');
  }

  // Check if refresh token itself expired (~100 days)
  if (tokens.refresh_expires_at && tokens.refresh_expires_at < now) {
    await clearTokens();
    throw new Error('QuickBooks refresh token expired. Please reconnect.');
  }

  console.log('[QBO] Access token expired, refreshing...');
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
    const saved = await saveTokens({
      access_token: newToken.access_token,
      refresh_token: newToken.refresh_token,
      realmId: tokens.realmId,
      expires_in: newToken.expires_in
    });
    console.log('[QBO] Token refreshed successfully');
    return saved;
  } catch (err) {
    console.error('[QBO] Token refresh failed:', err.message);
    await clearTokens();
    throw new Error('QuickBooks token refresh failed. Please reconnect.');
  }
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
// Employee operations
// ---------------------------------------------------------------------------

/**
 * Create an employee in QuickBooks Online
 * @param {Object} employeeData - { givenName, middleName, familyName, email, ssn, phone, address, birthDate, gender }
 */
async function createEmployee(employeeData) {
  const payload = {
    GivenName: employeeData.givenName,
    MiddleName: employeeData.middleName || undefined,
    FamilyName: employeeData.familyName,
    DisplayName: [employeeData.givenName, employeeData.middleName, employeeData.familyName]
      .filter(Boolean).join(' '),
    PrintOnCheckName: `${employeeData.familyName}, ${employeeData.givenName}`,
    PrimaryEmailAddr: employeeData.email ? { Address: employeeData.email } : undefined,
    PrimaryPhone: employeeData.phone ? { FreeFormNumber: employeeData.phone } : undefined,
    SSN: employeeData.ssn || undefined,
    BirthDate: employeeData.birthDate
      ? new Date(employeeData.birthDate).toISOString().split('T')[0]
      : undefined,
    Gender: employeeData.gender === 'M' ? 'Male' : employeeData.gender === 'F' ? 'Female' : undefined,
    PrimaryAddr: employeeData.address ? {
      Line1: employeeData.address.line1,
      City: employeeData.address.city,
      CountrySubDivisionCode: employeeData.address.state,
      PostalCode: employeeData.address.zip
    } : undefined
  };

  // Remove undefined fields
  Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

  const result = await qboRequest('POST', '/employee', payload);
  return result.Employee;
}

/**
 * Update an existing employee in QuickBooks Online
 * QBO requires SyncToken for optimistic locking.
 */
async function updateEmployee(employeeId, employeeData) {
  // Fetch current employee to get SyncToken
  const current = await qboRequest('GET', `/employee/${employeeId}`);
  const existing = current.Employee;

  const payload = {
    Id: employeeId,
    SyncToken: existing.SyncToken,
    GivenName: employeeData.givenName || existing.GivenName,
    MiddleName: employeeData.middleName || existing.MiddleName,
    FamilyName: employeeData.familyName || existing.FamilyName,
    DisplayName: [employeeData.givenName, employeeData.middleName, employeeData.familyName]
      .filter(Boolean).join(' ') || existing.DisplayName,
    PrintOnCheckName: employeeData.familyName
      ? `${employeeData.familyName}, ${employeeData.givenName}`
      : existing.PrintOnCheckName,
    PrimaryEmailAddr: employeeData.email ? { Address: employeeData.email } : existing.PrimaryEmailAddr,
    PrimaryPhone: employeeData.phone ? { FreeFormNumber: employeeData.phone } : existing.PrimaryPhone,
    SSN: employeeData.ssn || existing.SSN || undefined,
    BirthDate: employeeData.birthDate
      ? new Date(employeeData.birthDate).toISOString().split('T')[0]
      : existing.BirthDate,
    Gender: employeeData.gender === 'M' ? 'Male' : employeeData.gender === 'F' ? 'Female'
      : existing.Gender,
    PrimaryAddr: employeeData.address ? {
      Line1: employeeData.address.line1,
      City: employeeData.address.city,
      CountrySubDivisionCode: employeeData.address.state,
      PostalCode: employeeData.address.zip
    } : existing.PrimaryAddr
  };

  Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

  const result = await qboRequest('POST', '/employee', payload);
  return result.Employee;
}

/**
 * Query employees by email
 */
async function findEmployeeByEmail(email) {
  const safeEmail = email.replace(/'/g, "\\'");
  const query = encodeURIComponent(`SELECT * FROM Employee WHERE PrimaryEmailAddr = '${safeEmail}'`);
  const result = await qboRequest('GET', `/query?query=${query}`);
  const employees = result.QueryResponse?.Employee || [];
  return employees.length > 0 ? employees[0] : null;
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
    return { connected: false };
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
  getValidToken,
  qboRequest,
  createEmployee,
  updateEmployee,
  findEmployeeByEmail,
  getCompanyInfo,
  getConnectionStatus
};
