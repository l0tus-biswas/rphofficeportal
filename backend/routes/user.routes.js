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

// @route   GET /api/user/payments
// @desc    Get user's payment history
// @access  Private
router.get('/payments', protect, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const query = Payment.find({ user: req.user._id })
      .sort('-createdAt');

    const rawPayments = await paginate(query, page, limit);
    const payments = rawPayments.map(payment => {
      const record = payment.toObject ? payment.toObject() : payment;
      if (record.amount && typeof record.amount === 'number' && record.amount % 100 !== 0) {
        record.amount = Math.round(record.amount * 100);
      }
      return record;
    });
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
