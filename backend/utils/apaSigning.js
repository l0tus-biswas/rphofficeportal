// Shared Zoho Sign launcher for APA agreements. Used both by the initial
// signing flow (apa.routes.js) and by the agent re-sign flow after an edit or a
// rejection (user.routes.js), so both go through the same configuration checks
// and the same production guard against mock signing.
const { createAPAEnvelope } = require('./zohosign');

async function initiateDocuSign(application) {
  try {
    const hasClientId = !!process.env.ZOHO_CLIENT_ID;
    const hasClientSecret = !!process.env.ZOHO_CLIENT_SECRET;
    const hasRefreshToken = !!process.env.ZOHO_REFRESH_TOKEN;
    const hasTemplateId = !!process.env.ZOHO_SIGN_TEMPLATE_ID;

    console.log('=== Zoho Sign Configuration Check ===');
    console.log('Client ID:', hasClientId ? 'SET' : 'MISSING');
    console.log('Client Secret:', hasClientSecret ? 'SET' : 'MISSING');
    console.log('Refresh Token:', hasRefreshToken ? 'SET' : 'MISSING');
    console.log('Template ID:', hasTemplateId ? 'SET' : 'MISSING');

    // Use real Zoho Sign integration if ALL required variables are configured
    if (hasClientId && hasClientSecret && hasRefreshToken && hasTemplateId) {
      console.log('✓ Zoho Sign fully configured - Creating real request');
      console.log('Creating Zoho Sign request for application:', application._id);
      const result = await createAPAEnvelope(application);
      console.log('Zoho Sign request created successfully:', result.envelopeId);
      console.log('Zoho Sign will send signing email automatically');
      return result; // Returns { envelopeId, status }
    }

    // Mock mode lets anyone "sign" without a provider, so it must never run in production.
    if (process.env.NODE_ENV === 'production') {
      throw new Error('E-signature is not configured');
    }
    console.warn('⚠ Zoho Sign NOT fully configured - using mock mode');
    console.warn('Missing configuration(s):');
    if (!hasClientId) console.warn('  - ZOHO_CLIENT_ID');
    if (!hasClientSecret) console.warn('  - ZOHO_CLIENT_SECRET');
    if (!hasRefreshToken) console.warn('  - ZOHO_REFRESH_TOKEN');
    if (!hasTemplateId) console.warn('  - ZOHO_SIGN_TEMPLATE_ID');

    return {
      envelopeId: 'MOCK_' + Date.now(),
      status: 'sent'
    };
  } catch (error) {
    console.error('Zoho Sign initiation error:', error);
    console.error('Error details:', error.response?.body || error.message);
    throw new Error('Failed to initiate document signing: ' + error.message);
  }
}

// Read-only copy of the editable application sections for the version history.
// The SSN is deliberately left out so it is never duplicated across versions.
function buildSnapshot(application) {
  const plain = (v) => (v && typeof v.toObject === 'function' ? v.toObject() : v);
  const personalInfo = { ...(plain(application.personalInfo) || {}) };
  delete personalInfo.ssn;
  const strip = (o) => JSON.parse(JSON.stringify(o ?? null));
  return strip({
    personalInfo,
    recruitingInfo: plain(application.recruitingInfo),
    complianceQuestions: plain(application.complianceQuestions),
    financialBackground: plain(application.financialBackground),
    licensingStatus: plain(application.licensingStatus)
  });
}

// Version history as returned by the agent and admin APIs. The current version
// comes first, followed by the superseded snapshots, newest first.
function shapeVersionHistory(application, baseUrl) {
  const absolute = (u) => (u ? `${baseUrl}${u}` : null);
  const current = {
    version: application.currentVersion || 1,
    reason: application.currentVersionReason || 'original',
    isCurrent: true,
    signedDocumentUrl: absolute(application.docusign?.documentUrl),
    signedAt: application.docusign?.signedAt || null,
    awaitingSignature: !!application.resign?.required
  };
  const past = (application.versions || []).map((v) => ({
    version: v.version,
    reason: v.reason,
    isCurrent: false,
    snapshot: v.snapshot,
    signedDocumentUrl: absolute(v.signedDocumentUrl),
    signedAt: v.signedAt || null,
    rejectionReason: v.rejectionReason || null,
    supersededAt: v.supersededAt
  }));
  return { currentVersion: current.version, versions: [current, ...past.sort((a, b) => b.version - a.version)] };
}

module.exports = { initiateDocuSign, buildSnapshot, shapeVersionHistory };
