const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const Payment = require('../models/Payment');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const APAApplication = require('../models/APAApplication');
const Notification = require('../models/Notification');
const { protect } = require('../middleware/auth.middleware');
const { sendResponse, errorResponse, paginate } = require('../utils/helpers');
const { downloadSignedDocument } = require('../utils/zohosign'); // migrated from docusign.js
const { initiateDocuSign, buildSnapshot, shapeVersionHistory } = require('../utils/apaSigning');
const { resolveStripeReceiptUrl, listInvoices } = require('../utils/stripe');

// Reconcile a user's paid Stripe invoices into Payment records so every monthly
// renewal shows up as a transaction (with a receipt) — independent of whether
// the invoice.paid webhook was delivered. Idempotent (keyed by invoice id) and
// best-effort: never throws, never clobbers an existing record (e.g. the
// initial registration payment keeps its type/description via $setOnInsert).
async function reconcileSubscriptionInvoices(user) {
  if (!user?.stripeCustomerId) return;
  try {
    const invoices = await listInvoices(user.stripeCustomerId, 100);
    for (const inv of invoices) {
      if (inv.status !== 'paid' || !inv.amount_paid) continue;
      await Payment.updateOne(
        { stripeInvoiceId: inv.id },
        {
          $setOnInsert: {
            user: user._id,
            type: 'subscription',
            amount: inv.amount_paid,
            currency: inv.currency || 'usd',
            stripeInvoiceId: inv.id,
            stripeChargeId: inv.charge || undefined,
            stripeCustomerId: inv.customer || undefined,
            receiptUrl: inv.hosted_invoice_url || '',
            status: 'succeeded',
            description: 'Monthly subscription payment',
            paidAt: new Date((inv.status_transitions?.paid_at || inv.created) * 1000)
          }
        },
        { upsert: true }
      );
    }
  } catch (err) {
    console.error('[Billing] Invoice reconciliation failed:', err.message);
  }
}

// @route   GET /api/user/payments
// @desc    Get user's payment history
// @access  Private
router.get('/payments', protect, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 20));

    // Backfill any subscription renewals that Stripe charged but we haven't
    // recorded yet (e.g. a missed webhook), so the history is always complete.
    await reconcileSubscriptionInvoices(req.user);

    const query = Payment.find({ user: req.user._id })
      .sort('-createdAt');

    const payments = await paginate(query, page, limit);
    const total = await Payment.countDocuments({ user: req.user._id });

    sendResponse(res, 200, {
      payments,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/user/payments/:id/receipt
// @desc    Get (resolving + caching from Stripe if needed) the receipt URL for
//          a payment. Works for every payment type — charge receipts for
//          one-time/PI payments and hosted invoice URLs for subscriptions.
// @access  Private (owner or admin)
router.get('/payments/:id/receipt', protect, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return sendResponse(res, 404, { message: 'Payment not found' });
    }

    // Owner or admin only. `payment.user` may be a raw ObjectId or, if a future
    // change adds `.populate('user')` here, a populated document — resolve
    // its id either way instead of assuming an ObjectId shape.
    const paymentUserId = payment.user?._id || payment.user;
    const isOwner = paymentUserId && paymentUserId.toString() === req.user._id.toString();
    if (!isOwner && req.user.role !== 'admin') {
      return sendResponse(res, 403, { message: 'Access denied' });
    }

    // Receipts only make sense for paid transactions
    if (!['succeeded', 'completed'].includes(payment.status)) {
      return sendResponse(res, 400, { message: 'No receipt is available for this transaction.' });
    }

    if (payment.receiptUrl) {
      return sendResponse(res, 200, { url: payment.receiptUrl });
    }

    const url = await resolveStripeReceiptUrl({
      paymentIntentId: payment.stripePaymentIntentId,
      invoiceId: payment.stripeInvoiceId,
      chargeId: payment.stripeChargeId,
      sessionId: payment.metadata?.sessionId
    });

    if (!url) {
      return sendResponse(res, 404, { message: 'Receipt is not available yet. Please try again shortly.' });
    }

    // Cache so we don't hit Stripe again next time
    payment.receiptUrl = url;
    await payment.save();

    sendResponse(res, 200, { url });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/user/subscription
// @desc    Get user's subscription details
// @access  Private
router.get('/subscription', protect, async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ user: req.user._id });

    // Return null subscription instead of 404 so UI can handle it gracefully
    sendResponse(res, 200, { subscription: subscription || null });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/user/apa-application
// @desc    Get user's APA application details
// @access  Private
router.get('/apa-application', protect, async (req, res) => {
  try {
    let application = await APAApplication.findOne({ userId: req.user._id })
      .sort({ createdAt: -1 });

    if (!application && req.user.email) {
      application = await APAApplication.findOne({ 'personalInfo.email': req.user.email.toLowerCase() })
        .sort({ createdAt: -1 });
    }

    if (!application) {
      return sendResponse(res, 404, { message: 'No APA application found' });
    }

    // Build full document URL if signed document exists
    const appData = application.toObject();
    if (appData.docusign?.documentUrl) {
      const baseUrl = process.env.API_URL || `${req.protocol}://${req.get('host')}`;
      appData.docusign.documentUrl = `${baseUrl}${appData.docusign.documentUrl}`;
    }

    // Get user's subscription if exists
    const subscription = await Subscription.findOne({ user: req.user._id });
    if (subscription) {
      appData.subscriptionInfo = {
        status: subscription.status,
        amount: subscription.amount,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd
      };
    }

    sendResponse(res, 200, { application: appData });
  } catch (error) {
    errorResponse(res, error);
  }
});

async function findOwnApplication(user) {
  let application = await APAApplication.findOne({ userId: user._id, deletedAt: null }).sort({ createdAt: -1 });
  if (!application && user.email) {
    application = await APAApplication.findOne({ 'personalInfo.email': user.email.toLowerCase(), deletedAt: null }).sort({ createdAt: -1 });
  }
  return application;
}

async function notifyAdmins(payload) {
  try {
    const admins = await User.find({ role: 'admin', isActive: true, deletedAt: null }).select('_id').lean();
    for (const admin of admins) {
      await Notification.createNotification({ ...payload, userId: admin._id });
    }
  } catch (err) {
    console.error('[APA Edit] Failed to notify admins:', err.message);
  }
}

const str = (v) => (v == null ? '' : String(v).trim());
const MASK_FIELDS = new Set(['personalInfo.ssn']);

function flatten(obj, prefix = '', out = {}) {
  if (obj == null) return out;
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v instanceof Date) out[key] = v.toISOString().slice(0, 10);
    else if (Array.isArray(v)) out[key] = v.join(', ');
    else if (v && typeof v === 'object') flatten(v, key, out);
    else out[key] = v == null ? '' : String(v);
  }
  return out;
}

function diffSnapshots(before, after) {
  const changes = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if ((before[key] || '') !== (after[key] || '')) {
      const masked = MASK_FIELDS.has(key);
      changes.push({ field: key, from: masked ? '***' : (before[key] || ''), to: masked ? '***' : (after[key] || '') });
    }
  }
  return changes;
}

// Send (or re-send) the Zoho Sign request for an edited application, reusing
// the same launcher as the first signature. Never throws: on failure the
// application simply stays in pending_resignature and the agent can retry.
async function sendResignRequest(application) {
  try {
    const result = await initiateDocuSign(application);
    application.docusign.envelopeId = result.envelopeId;
    application.docusign.status = result.status;
    application.docusign.sentAt = new Date();
    await application.save();

    const agentId = application.userId || application.user;
    if (agentId) {
      Notification.createNotification({
        userId: agentId,
        type: 'apa_resign_required',
        title: 'Please Sign Your Updated APA Application',
        message: 'Your APA application was updated. Check your email from Zoho Sign and sign it again to send it back for admin review.',
        link: '/onboarding'
      }, true).catch(() => {});
    }
    return true;
  } catch (err) {
    console.error('[APA Resign] Could not send signature request:', err.message);
    return false;
  }
}

// @route   POST /api/user/apa-application/resign
// @desc    (Re)send the signature request for an edited application
// @access  Private
router.post('/apa-application/resign', protect, async (req, res) => {
  try {
    const application = await findOwnApplication(req.user);
    if (!application) {
      return sendResponse(res, 404, { message: 'No APA application found' });
    }
    if (!application.resign?.required || application.status !== 'pending_resignature') {
      return sendResponse(res, 400, { message: 'Your application does not need to be signed again.' });
    }
    if (application.docusign?.envelopeId && ['sent', 'delivered'].includes(application.docusign.status)) {
      return sendResponse(res, 400, { message: 'A signature request is already waiting in your email.' });
    }
    const sent = await sendResignRequest(application);
    if (!sent) {
      return sendResponse(res, 502, { message: 'Could not send the signature request. Please try again shortly.' });
    }
    sendResponse(res, 200, { message: 'Signature request sent. Check your email from Zoho Sign.' });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/user/apa-application/versions
// @desc    Agent's own APA version history
// @access  Private
router.get('/apa-application/versions', protect, async (req, res) => {
  try {
    const application = await findOwnApplication(req.user);
    if (!application) {
      return sendResponse(res, 404, { message: 'No APA application found' });
    }
    const baseUrl = process.env.API_URL || `${req.protocol}://${req.get('host')}`;
    sendResponse(res, 200, shapeVersionHistory(application, baseUrl));
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/user/apa-application/edit-request
// @desc    Agent asks an admin to unlock their APA application for editing
// @access  Private
router.post('/apa-application/edit-request', protect, async (req, res) => {
  try {
    const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
    if (reason.length < 5 || reason.length > 1000) {
      return sendResponse(res, 400, { message: 'Please describe what needs to be corrected (5-1000 characters).' });
    }

    const application = await findOwnApplication(req.user);
    if (!application) {
      return sendResponse(res, 404, { message: 'No APA application found' });
    }

    const current = application.editRequest?.status;
    if (current === 'pending') {
      return sendResponse(res, 400, { message: 'You already have an edit request awaiting admin review.' });
    }
    if (current === 'approved') {
      return sendResponse(res, 400, { message: 'Editing is already unlocked for your application.' });
    }

    application.editRequest = {
      status: 'pending',
      reason,
      requestedAt: new Date()
    };
    await application.save();

    const name = [application.personalInfo?.legalFirstName, application.personalInfo?.legalLastName].filter(Boolean).join(' ') || req.user.name;
    await notifyAdmins({
      type: 'apa_edit_requested',
      title: 'APA Edit Request',
      message: `${name} requested to edit their APA application: "${reason.slice(0, 200)}"`,
      data: { agentId: String(req.user._id), applicationId: String(application._id) },
      link: '/admin/onboarding?tab=edit-requests'
    });

    sendResponse(res, 200, { message: 'Edit request sent to admin.', editRequest: application.editRequest });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   PUT /api/user/apa-application
// @desc    Agent edits their APA application (only while an admin has unlocked it)
// @access  Private
router.put('/apa-application', protect, async (req, res) => {
  try {
    const application = await findOwnApplication(req.user);
    if (!application) {
      return sendResponse(res, 404, { message: 'No APA application found' });
    }
    // Editing opens two ways: an admin approved an edit request, or an admin
    // rejected the application (the agent corrects it and resubmits).
    const isRejectionResubmit = application.status === 'rejected';
    if (application.editRequest?.status !== 'approved' && !isRejectionResubmit) {
      return sendResponse(res, 403, { message: 'Editing is locked. Request edit access from an admin first.' });
    }
    if (application.status === 'pending_resignature') {
      return sendResponse(res, 403, { message: 'Please sign your updated application before making further changes.' });
    }

    // recruitingInfo is intentionally ignored: it is locked to the agent's hierarchy.
    const { personalInfo: p, complianceQuestions: c, financialBackground: f, licensingStatus: l } = req.body;
    if (!p || !c || !f || !l) {
      return sendResponse(res, 400, { message: 'Incomplete application data.' });
    }

    const required = [p.legalFirstName, p.legalLastName, p.dateOfBirth, p.mobilePhone, p.homeAddress?.street, p.homeAddress?.city, p.homeAddress?.state, p.homeAddress?.zipCode];
    if (required.some(v => !str(v))) {
      return sendResponse(res, 400, { message: 'Please fill in all required personal information fields.' });
    }
    if (!['M', 'F'].includes(p.gender)) {
      return sendResponse(res, 400, { message: 'Gender is required.' });
    }
    const dob = new Date(p.dateOfBirth);
    if (isNaN(dob.getTime()) || dob > new Date() || dob.getFullYear() < 1900) {
      return sendResponse(res, 400, { message: 'Please enter a valid date of birth.' });
    }
    if (str(p.ssn) && !/^\d{3}-?\d{2}-?\d{4}$/.test(str(p.ssn))) {
      return sendResponse(res, 400, { message: 'Please enter a valid Social Security Number.' });
    }
    if (!/^\d{5}(-\d{4})?$/.test(str(p.homeAddress.zipCode))) {
      return sendResponse(res, 400, { message: 'Please enter a valid home zip code.' });
    }

    const snapshotBefore = buildSnapshot(application);
    const before = flatten({
      personalInfo: application.personalInfo?.toObject?.() ?? application.personalInfo,
      recruitingInfo: application.recruitingInfo?.toObject?.() ?? application.recruitingInfo,
      complianceQuestions: application.complianceQuestions?.toObject?.() ?? application.complianceQuestions,
      financialBackground: application.financialBackground?.toObject?.() ?? application.financialBackground,
      licensingStatus: application.licensingStatus?.toObject?.() ?? application.licensingStatus
    });

    const hasMailing = p.mailingAddress && str(p.mailingAddress.street);
    application.personalInfo = {
      legalFirstName: str(p.legalFirstName),
      legalMiddleName: str(p.legalMiddleName),
      legalLastName: str(p.legalLastName),
      agencyLegalName: str(p.agencyLegalName) || 'N/A',
      gender: p.gender,
      dateOfBirth: dob,
      ssn: str(p.ssn) || application.personalInfo.ssn,
      mobilePhone: str(p.mobilePhone),
      email: application.personalInfo.email, // login identity — not editable here
      homeAddress: {
        street: str(p.homeAddress.street),
        city: str(p.homeAddress.city),
        state: str(p.homeAddress.state),
        zipCode: str(p.homeAddress.zipCode)
      },
      mailingAddress: hasMailing ? {
        street: str(p.mailingAddress.street),
        city: str(p.mailingAddress.city),
        state: str(p.mailingAddress.state),
        zipCode: str(p.mailingAddress.zipCode)
      } : undefined,
      previouslyContracted: !!p.previouslyContracted
    };

    const questionKeys = ['previouslyContractedOther', 'felonyConviction', 'misdemeanorFraud', 'civilAction', 'licenseDenied', 'bondIssues'];
    const compliance = {};
    for (const key of questionKeys) {
      const answer = c[key]?.answer;
      if (typeof answer !== 'boolean') {
        return sendResponse(res, 400, { message: 'Please answer every compliance question.' });
      }
      compliance[key] = {
        answer,
        explanation: answer ? str(c[key].explanation) : '',
        documentUrl: application.complianceQuestions?.[key]?.documentUrl
      };
    }
    application.complianceQuestions = compliance;

    for (const key of ['unsatisfiedJudgments', 'unsatisfiedLiens']) {
      if (typeof f[key] !== 'boolean') {
        return sendResponse(res, 400, { message: 'Please answer every financial background question.' });
      }
    }
    if (typeof f.bankruptcy?.filed !== 'boolean') {
      return sendResponse(res, 400, { message: 'Please answer every financial background question.' });
    }
    application.financialBackground = {
      unsatisfiedJudgments: f.unsatisfiedJudgments,
      unsatisfiedJudgmentsExplanation: f.unsatisfiedJudgments ? str(f.unsatisfiedJudgmentsExplanation) : '',
      unsatisfiedLiens: f.unsatisfiedLiens,
      unsatisfiedLiensExplanation: f.unsatisfiedLiens ? str(f.unsatisfiedLiensExplanation) : '',
      bankruptcy: {
        filed: f.bankruptcy.filed,
        chapter: f.bankruptcy.filed ? (f.bankruptcy.chapter || null) : null,
        status: f.bankruptcy.filed ? (f.bankruptcy.status || null) : null
      }
    };

    if (typeof l.currentlyLicensed !== 'boolean') {
      return sendResponse(res, 400, { message: 'Please answer the licensing question.' });
    }
    const licensed = l.currentlyLicensed;
    application.licensingStatus = {
      currentlyLicensed: licensed,
      licenseTypes: licensed && Array.isArray(l.licenseTypes) ? l.licenseTypes : [],
      statesLicensed: licensed && Array.isArray(l.statesLicensed) ? l.statesLicensed.map(str).filter(Boolean) : [],
      licenseNumber: licensed ? str(l.licenseNumber) : '',
      licenseStatus: licensed ? (l.licenseStatus || null) : null,
      licenseOtherDescription: licensed ? (str(l.licenseOtherDescription) || undefined) : undefined
    };

    const after = flatten({
      personalInfo: application.personalInfo.toObject ? application.personalInfo.toObject() : application.personalInfo,
      recruitingInfo: application.recruitingInfo.toObject ? application.recruitingInfo.toObject() : application.recruitingInfo,
      complianceQuestions: application.complianceQuestions.toObject ? application.complianceQuestions.toObject() : application.complianceQuestions,
      financialBackground: application.financialBackground.toObject ? application.financialBackground.toObject() : application.financialBackground,
      licensingStatus: application.licensingStatus.toObject ? application.licensingStatus.toObject() : application.licensingStatus
    });
    const changes = diffSnapshots(before, after);

    // One-shot access: a confirmed save locks the application again, so the
    // agent has to file a new edit request for any further change.
    application.editRequest.lastEditedAt = new Date();
    if (application.editRequest.status === 'approved') application.editRequest.status = 'locked';
    if (changes.length) {
      application.editHistory.push({ editedAt: new Date(), editedBy: req.user._id, changes });
    }

    // Version history: the version being replaced is kept as a read-only
    // snapshot, then the edited data becomes the new current version, which
    // must be signed again and re-approved by an admin.
    let signatureSent = false;
    if (changes.length || isRejectionResubmit) {
      const versionReason = isRejectionResubmit ? 'rejection_resubmit' : 'edit_request';
      application.versions.push({
        version: application.currentVersion || 1,
        reason: application.currentVersionReason || 'original',
        snapshot: snapshotBefore,
        signedDocumentUrl: application.docusign?.documentUrl,
        signedAt: application.docusign?.signedAt || application.docusign?.sentAt,
        rejectionReason: isRejectionResubmit ? application.rejectionReason : undefined,
        supersededAt: new Date(),
        supersededBy: req.user._id
      });
      application.currentVersion = (application.currentVersion || 1) + 1;
      application.currentVersionReason = versionReason;
      application.resign = { required: true, source: versionReason, requestedAt: new Date() };
      application.status = 'pending_resignature';
      application.rejectionReason = undefined;
      application.docusign.envelopeId = undefined;
      application.docusign.status = 'draft';
    }
    await application.save();

    if (application.resign?.required) {
      signatureSent = await sendResignRequest(application);
    }

    // Keep the agent's account profile in sync with the corrected details
    const account = await User.findById(application.userId || req.user._id);
    if (account) {
      account.name = `${application.personalInfo.legalFirstName} ${application.personalInfo.legalLastName}`.trim();
      account.phone = application.personalInfo.mobilePhone;
      account.dateOfBirth = application.personalInfo.dateOfBirth;
      account.address = application.personalInfo.homeAddress.street;
      account.city = application.personalInfo.homeAddress.city;
      account.state = application.personalInfo.homeAddress.state;
      account.zipCode = application.personalInfo.homeAddress.zipCode;
      account.updatedBy = req.user._id;
      await account.save();
    }

    if (changes.length) {
      await notifyAdmins({
        type: 'apa_edited',
        title: 'APA Application Updated',
        message: `${account?.name || req.user.name} updated their APA application (${changes.length} field${changes.length > 1 ? 's' : ''} changed).`,
        data: { agentId: String(req.user._id), applicationId: String(application._id) },
        link: `/admin/onboarding/${req.user._id}`
      });
    }

    sendResponse(res, 200, {
      message: application.resign?.required
        ? 'Application updated. Please sign the updated agreement to finish; it will then go back to admin review.'
        : 'Application updated successfully. Editing is now locked.',
      changed: changes.length,
      resignRequired: !!application.resign?.required,
      signatureSent,
      version: application.currentVersion
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/user/apa-application/fetch-signed-document
// @desc    Fetch signed document from Zoho Sign if status is completed but PDF is missing
// @access  Private
router.post('/apa-application/fetch-signed-document', protect, async (req, res) => {
  try {
    let application = await APAApplication.findOne({ userId: req.user._id })
      .sort({ createdAt: -1 });

    if (!application && req.user.email) {
      application = await APAApplication.findOne({ 'personalInfo.email': req.user.email.toLowerCase() })
        .sort({ createdAt: -1 });
    }

    if (!application) {
      return sendResponse(res, 404, { message: 'No APA application found' });
    }

    // Check if Zoho Sign status is completed but document URL is missing
    if (application.docusign?.status !== 'completed') {
      return sendResponse(res, 400, { message: 'Document not yet signed' });
    }

    if (!application.docusign?.envelopeId) {
      return sendResponse(res, 400, { message: 'No Zoho Sign envelope ID found' });
    }

    // Check if file already exists
    const signedDocPath = path.join(
      __dirname,
      '../uploads/apa-signed',
      `${application._id}_signed_apa.pdf`
    );

    if (fs.existsSync(signedDocPath)) {
      // File exists, just update the URL if missing
      if (!application.docusign.documentUrl) {
        application.docusign.documentUrl = `/uploads/apa-signed/${application._id}_signed_apa.pdf`;
        await application.save();
      }
    } else {
      // Download from Zoho Sign
      await downloadSignedDocument(application.docusign.envelopeId, signedDocPath);
      application.docusign.documentUrl = `/uploads/apa-signed/${application._id}_signed_apa.pdf`;
      await application.save();
    }

    // Return full URL
    const baseUrl = process.env.API_URL || `${req.protocol}://${req.get('host')}`;
    const fullDocumentUrl = `${baseUrl}${application.docusign.documentUrl}`;

    sendResponse(res, 200, { 
      message: 'Document fetched successfully',
      documentUrl: fullDocumentUrl 
    });
  } catch (error) {
    console.error('Fetch signed document error:', error);
    errorResponse(res, error);
  }
});

module.exports = router;
