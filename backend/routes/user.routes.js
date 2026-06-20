const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const Payment = require('../models/Payment');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const APAApplication = require('../models/APAApplication');
const { protect } = require('../middleware/auth.middleware');
const { sendResponse, errorResponse, paginate } = require('../utils/helpers');
const { downloadSignedDocument } = require('../utils/docusign');
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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

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

    // Owner or admin only
    const isOwner = payment.user && payment.user.toString() === req.user._id.toString();
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

// @route   POST /api/user/apa-application/fetch-signed-document
// @desc    Fetch signed document from DocuSign if status is completed but PDF is missing
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

    // Check if DocuSign status is completed but document URL is missing
    if (application.docusign?.status !== 'completed') {
      return sendResponse(res, 400, { message: 'Document not yet signed' });
    }

    if (!application.docusign?.envelopeId) {
      return sendResponse(res, 400, { message: 'No DocuSign envelope ID found' });
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
      // Download from DocuSign
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
