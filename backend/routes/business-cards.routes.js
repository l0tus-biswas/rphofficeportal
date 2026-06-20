const express = require('express');
const router = express.Router();
const axios = require('axios');
const SystemConfig = require('../models/SystemConfig');
const PrintfulOrder = require('../models/PrintfulOrder');
const { protect: authenticate, authorize } = require('../middleware/auth.middleware');
const { sendResponse, errorResponse } = require('../utils/helpers');
const { stripe, createPaymentIntent } = require('../utils/stripe');
const { renderCard } = require('../services/cardRenderer');

// ---------------------------------------------------------------------------
// Printful API Configuration
// ---------------------------------------------------------------------------
const PRINTFUL_BASE_URL = 'https://api.printful.com';

const KEYS = {
  API_KEY:     'printful_api_key',
  STORE_ID:    'printful_store_id',
  ENABLED:     'printful_enabled',
  TEXT_FIELDS: 'printful_text_fields', // JSON array of {id, label, required}
  TEMPLATES:   'printful_card_templates' // JSON array of CardTemplate (see cardRenderer.js)
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function getPrintfulConfig() {
  const records = await SystemConfig.find({ key: { $in: Object.values(KEYS) } }).lean();
  const map = {};
  for (const r of records) {
    map[r.key] = (r.value && r.value !== 'not_configured') ? r.value : '';
  }
  return {
    apiKey:  map[KEYS.API_KEY] || '',
    storeId: map[KEYS.STORE_ID] || '',
    enabled: map[KEYS.ENABLED] === 'true'
  };
}

async function upsertConfig(key, value, updatedBy) {
  const storedValue = (value && String(value).trim()) ? String(value).trim() : 'not_configured';
  return SystemConfig.findOneAndUpdate(
    { key },
    { key, value: storedValue, category: 'application', description: `Printful: ${key}`, updatedBy },
    { upsert: true, new: true }
  );
}

async function getCardTemplates() {
  const rec = await SystemConfig.findOne({ key: KEYS.TEMPLATES }).lean();
  try { return rec?.value ? JSON.parse(rec.value) : []; } catch (_) { return []; }
}

async function getTemplateById(id) {
  const all = await getCardTemplates();
  return all.find(t => t.id === id) || null;
}

function buildPrintFileUrl(filename) {
  const base = (process.env.API_URL || '').replace(/\/$/, '');
  return `${base}/uploads/business-card-prints/${filename}`;
}

function getPrintfulClient(apiKey, storeId) {
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };
  if (storeId) {
    headers['X-PF-Store-Id'] = storeId;
  }
  return axios.create({
    baseURL: PRINTFUL_BASE_URL,
    headers,
    timeout: 30000
  });
}

// Photo upload for business card personalization
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const uploadDir = path.join(__dirname, '..', 'uploads', 'business-card-photos');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${req.user._id}-${Date.now()}${ext}`);
  }
});
const photoUpload = multer({
  storage: photoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only JPG/PNG images allowed'));
  }
});

// Template assets (background art + fonts) — admin only, stored privately.
const templateDir = path.join(__dirname, '..', 'uploads', 'card-templates');
if (!fs.existsSync(templateDir)) fs.mkdirSync(templateDir, { recursive: true });
const templateStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, templateDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext).replace(/[^a-z0-9_-]/gi, '');
    cb(null, `${base}-${Date.now()}${ext}`);
  }
});
const templateUpload = multer({
  storage: templateStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.svg', '.ttf', '.otf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only PNG/JPG/SVG images or TTF/OTF fonts allowed'));
  }
});

// ===========================================================================
// AGENT ROUTES
// ===========================================================================

// ---------------------------------------------------------------------------
// @route   POST /api/business-cards/upload-photo
// @desc    Upload a headshot/photo for business card personalization
// @access  Private (agent + admin)
// ---------------------------------------------------------------------------
router.post('/upload-photo', authenticate, photoUpload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return sendResponse(res, 400, { message: 'No photo uploaded' });
    }
    const photoUrl = `${process.env.API_URL || ''}/uploads/business-card-photos/${req.file.filename}`;
    sendResponse(res, 200, { photoUrl, message: 'Photo uploaded successfully' });
  } catch (error) {
    errorResponse(res, error);
  }
});

// ---------------------------------------------------------------------------
// @route   GET /api/business-cards/templates
// @desc    Get the agent-facing card templates (without internal-only data)
// @access  Private (agent + admin)
// ---------------------------------------------------------------------------
router.get('/templates', authenticate, async (req, res) => {
  try {
    const templates = await getCardTemplates();
    // Expose only what the agent UI needs to render the form + order.
    const safe = templates.map(t => ({
      id: t.id,
      name: t.name,
      syncProductId: t.syncProductId,
      variants: t.variants || [],
      orientation: t.orientation || 'portrait',
      printFile: t.printFile,
      sides: (t.sides || []).map(s => ({
        placement: s.placement,
        label: s.label || s.placement,
        hasPhoto: !!s.photo,
        fields: (s.fields || []).map(f => ({ key: f.key, label: f.label || f.key, required: !!f.required }))
      }))
    }));
    return sendResponse(res, 200, { templates: safe });
  } catch (err) {
    return errorResponse(res, err);
  }
});

// ---------------------------------------------------------------------------
// @route   POST /api/business-cards/render-preview
// @desc    Render the agent's personalized card to PNG(s) for live preview
// @access  Private (agent + admin)
// ---------------------------------------------------------------------------
router.post('/render-preview', authenticate, async (req, res) => {
  try {
    const { templateId, fieldValues, photoUrl } = req.body;
    const template = await getTemplateById(templateId);
    if (!template) return sendResponse(res, 404, { message: 'Card template not found.' });

    const rendered = await renderCard(
      template, fieldValues || {}, photoUrl || '', `preview-${req.user._id}`);

    const previews = rendered.map(r => ({
      placement: r.placement,
      url: buildPrintFileUrl(r.filename)
    }));
    return sendResponse(res, 200, {
      previews,
      previewUrl: previews[0]?.url || ''
    });
  } catch (err) {
    return errorResponse(res, err);
  }
});

// ---------------------------------------------------------------------------
// @route   GET /api/business-cards/products
// @desc    Fetch all products from the Printful store for agents to browse
// @access  Private (agent + admin)
// ---------------------------------------------------------------------------
router.get('/products', authenticate, async (req, res) => {
  try {
    const config = await getPrintfulConfig();

    if (!config.enabled) {
      return sendResponse(res, 200, { enabled: false, products: [] });
    }
    if (!config.apiKey) {
      return sendResponse(res, 503, { message: 'Printful integration is not configured.' });
    }

    const printful = getPrintfulClient(config.apiKey, config.storeId);
    const response = await printful.get('/store/products');
    const products = response.data?.result || [];

    // Return simplified product list with thumbnails
    const simplified = products.map(p => ({
      id: p.id,
      externalId: p.external_id,
      name: p.name,
      variants: p.variants || 0,
      synced: p.synced,
      thumbnail: p.thumbnail_url || ''
    }));

    return sendResponse(res, 200, { enabled: true, products: simplified });
  } catch (err) {
    if (err.response && err.response.data) {
      return sendResponse(res, err.response.status || 500, {
        message: err.response.data.result || 'Failed to fetch products from Printful.'
      });
    }
    return errorResponse(res, err);
  }
});

// ---------------------------------------------------------------------------
// @route   GET /api/business-cards/products/:id
// @desc    Get product details including variants and pricing
// @access  Private (agent + admin)
// ---------------------------------------------------------------------------
// @route   GET /api/business-cards/products/:id/raw
// @desc    DEBUG: Return raw Printful response to inspect structure
// @access  Admin
// ---------------------------------------------------------------------------
router.get('/products/:id/raw', authenticate, authorize('admin'), async (req, res) => {
  try {
    const config = await getPrintfulConfig();
    if (!config.apiKey) {
      return sendResponse(res, 503, { message: 'Printful integration not configured.' });
    }
    const printful = getPrintfulClient(config.apiKey, config.storeId);
    const response = await printful.get(`/store/products/${req.params.id}`);
    return res.json(response.data?.result);
  } catch (err) {
    return res.status(500).json({ error: err.response?.data || err.message });
  }
});

// ---------------------------------------------------------------------------
router.get('/products/:id', authenticate, async (req, res) => {
  try {
    const config = await getPrintfulConfig();
    if (!config.apiKey) {
      return sendResponse(res, 503, { message: 'Printful integration not configured.' });
    }

    const printful = getPrintfulClient(config.apiKey, config.storeId);
    const response = await printful.get(`/store/products/${req.params.id}`);
    const product = response.data?.result;

    if (!product) {
      return sendResponse(res, 404, { message: 'Product not found.' });
    }

    // Get admin-configured text fields for personalization
    const textFieldsRecord = await SystemConfig.findOne({ key: KEYS.TEXT_FIELDS }).lean();
    let textFields = [];
    try {
      textFields = textFieldsRecord?.value ? JSON.parse(textFieldsRecord.value) : [];
    } catch (_) { /* ignore parse errors */ }

    return sendResponse(res, 200, {
      product: {
        id: product.sync_product?.id,
        name: product.sync_product?.name,
        thumbnail: product.sync_product?.thumbnail_url || '',
        textFields,
        variants: (product.sync_variants || []).map(v => ({
          id: v.id,
          variantId: v.variant_id,
          name: v.name,
          sku: v.sku,
          price: v.retail_price,
          currency: v.currency || 'USD',
          thumbnail: v.files?.find(f => f.type === 'preview')?.preview_url ||
                     v.files?.find(f => f.type === 'preview')?.thumbnail_url ||
                     v.product?.image || ''
        }))
      }
    });
  } catch (err) {
    if (err.response && err.response.data) {
      return sendResponse(res, err.response.status || 500, {
        message: err.response.data.result || 'Failed to fetch product details.'
      });
    }
    return errorResponse(res, err);
  }
});

// ---------------------------------------------------------------------------
// @route   POST /api/business-cards/mockup
// @desc    Generate a product mockup with customization text/image overlays
// @access  Private (agent + admin)
// ---------------------------------------------------------------------------
router.post('/mockup', authenticate, async (req, res) => {
  try {
    const { productId, variantIds, textValues, imageUrl } = req.body;

    if (!productId) {
      return sendResponse(res, 400, { message: 'Product ID is required.' });
    }

    const config = await getPrintfulConfig();
    if (!config.apiKey) {
      return sendResponse(res, 503, { message: 'Printful integration not configured.' });
    }

    const printful = getPrintfulClient(config.apiKey, config.storeId);

    // First get the product's print files to find placement info
    const productRes = await printful.get(`/store/products/${productId}`);
    const product = productRes.data?.result;
    if (!product) {
      return sendResponse(res, 404, { message: 'Product not found.' });
    }

    // Get variant IDs from sync variants
    const syncVariants = product.sync_variants || [];
    const catalogVariantIds = variantIds?.length
      ? variantIds
      : syncVariants.slice(0, 1).map(v => v.variant_id);

    if (!catalogVariantIds.length) {
      return sendResponse(res, 400, { message: 'No variants available for mockup generation.' });
    }

    // Get print files to determine what image to use for mockup
    const printFiles = [];
    for (const sv of syncVariants.slice(0, 1)) {
      const files = sv.files || [];
      for (const f of files) {
        if (f.type === 'default' || f.type === 'front' || f.type === 'back') {
          printFiles.push({
            placement: f.type === 'default' ? 'front' : f.type,
            image_url: imageUrl || f.preview_url || f.url || f.thumbnail_url
          });
        }
      }
    }

    // If no print files found, try using the provided image or product thumbnail
    if (printFiles.length === 0 && (imageUrl || product.sync_product?.thumbnail_url)) {
      printFiles.push({
        placement: 'front',
        image_url: imageUrl || product.sync_product.thumbnail_url
      });
    }

    if (printFiles.length === 0) {
      // Return the product thumbnail as a fallback "mockup"
      return sendResponse(res, 200, {
        mockupUrl: product.sync_product?.thumbnail_url || '',
        status: 'fallback',
        message: 'No print files available for mockup. Showing product thumbnail.'
      });
    }

    // Create mockup generation task
    const mockupPayload = {
      variant_ids: catalogVariantIds.map(Number),
      files: printFiles.map(pf => ({
        placement: pf.placement,
        image_url: pf.image_url,
        position: {
          area_width: 1800,
          area_height: 1800,
          width: 1800,
          height: 1800,
          top: 0,
          left: 0
        }
      }))
    };

    // Get the catalog product ID (not sync product ID)
    const catalogProductId = syncVariants[0]?.product?.product_id || syncVariants[0]?.product_id;
    if (!catalogProductId) {
      return sendResponse(res, 200, {
        mockupUrl: product.sync_product?.thumbnail_url || '',
        status: 'fallback',
        message: 'Could not determine catalog product ID for mockup.'
      });
    }

    try {
      const mockupRes = await printful.post(`/mockup-generator/create-task/${catalogProductId}`, mockupPayload);
      const taskKey = mockupRes.data?.result?.task_key;

      if (!taskKey) {
        return sendResponse(res, 200, {
          mockupUrl: product.sync_product?.thumbnail_url || '',
          status: 'fallback'
        });
      }

      // Poll for mockup result (max 15 seconds)
      let mockupResult = null;
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 1500));
        try {
          const resultRes = await printful.get(`/mockup-generator/task?task_key=${taskKey}`);
          const task = resultRes.data?.result;
          if (task?.status === 'completed' && task?.mockups?.length) {
            mockupResult = task;
            break;
          }
          if (task?.status === 'failed') break;
        } catch (_) { /* retry */ }
      }

      if (mockupResult?.mockups?.length) {
        return sendResponse(res, 200, {
          mockupUrl: mockupResult.mockups[0].mockup_url || '',
          mockups: mockupResult.mockups.map(m => ({
            placement: m.placement,
            url: m.mockup_url,
            variantIds: m.variant_ids
          })),
          status: 'completed',
          taskKey
        });
      }

      // Task still pending — return task key for client polling
      return sendResponse(res, 200, {
        mockupUrl: product.sync_product?.thumbnail_url || '',
        status: 'pending',
        taskKey,
        message: 'Mockup generation in progress. Use task key to check status.'
      });
    } catch (mockupErr) {
      // Mockup API failed — return product thumbnail as fallback
      return sendResponse(res, 200, {
        mockupUrl: product.sync_product?.thumbnail_url || '',
        status: 'fallback',
        message: 'Mockup generation unavailable. Showing product image.'
      });
    }
  } catch (err) {
    if (err.response && err.response.data) {
      return sendResponse(res, err.response.status || 500, {
        message: err.response.data.result || 'Mockup generation failed.'
      });
    }
    return errorResponse(res, err);
  }
});

// ---------------------------------------------------------------------------
// @route   GET /api/business-cards/mockup/status/:taskKey
// @desc    Check mockup generation task status
// @access  Private
// ---------------------------------------------------------------------------
router.get('/mockup/status/:taskKey', authenticate, async (req, res) => {
  try {
    const config = await getPrintfulConfig();
    if (!config.apiKey) {
      return sendResponse(res, 503, { message: 'Not configured.' });
    }

    const printful = getPrintfulClient(config.apiKey, config.storeId);
    const response = await printful.get(`/mockup-generator/task?task_key=${encodeURIComponent(req.params.taskKey)}`);
    const task = response.data?.result;

    return sendResponse(res, 200, {
      status: task?.status || 'unknown',
      mockups: (task?.mockups || []).map(m => ({
        placement: m.placement,
        url: m.mockup_url,
        variantIds: m.variant_ids
      })),
      mockupUrl: task?.mockups?.[0]?.mockup_url || ''
    });
  } catch (err) {
    return errorResponse(res, err);
  }
});

// ---------------------------------------------------------------------------
// @route   POST /api/business-cards/estimate
// @desc    Get shipping cost estimate for an order
// @access  Private (agent)
// ---------------------------------------------------------------------------
router.post('/estimate', authenticate, async (req, res) => {
  try {
    const { variantId, quantity, shippingAddress } = req.body;

    if (!variantId || !quantity || !shippingAddress) {
      return sendResponse(res, 400, { message: 'Variant, quantity, and shipping address required.' });
    }

    const config = await getPrintfulConfig();
    if (!config.apiKey) {
      return sendResponse(res, 503, { message: 'Not configured.' });
    }

    const printful = getPrintfulClient(config.apiKey, config.storeId);

    // Get variant retail price
    // Use shipping rate estimation endpoint
    const estimatePayload = {
      recipient: {
        address1: shippingAddress.address1,
        city: shippingAddress.city,
        state_code: shippingAddress.state,
        country_code: shippingAddress.country || 'US',
        zip: shippingAddress.zip
      },
      items: [{
        sync_variant_id: parseInt(variantId),
        quantity: parseInt(quantity)
      }]
    };

    try {
      const response = await printful.post('/shipping/rates', estimatePayload);
      const rates = response.data?.result || [];
      const cheapest = rates.length > 0
        ? rates.reduce((a, b) => parseFloat(a.rate) < parseFloat(b.rate) ? a : b)
        : null;

      return sendResponse(res, 200, {
        shippingRates: rates.map(r => ({
          id: r.id,
          name: r.name,
          rate: r.rate,
          currency: r.currency,
          minDeliveryDays: r.minDeliveryDays,
          maxDeliveryDays: r.maxDeliveryDays
        })),
        cheapestRate: cheapest ? parseFloat(cheapest.rate) : 0
      });
    } catch (shippingErr) {
      // If shipping estimation fails, return zero (will be calculated at checkout)
      return sendResponse(res, 200, { shippingRates: [], cheapestRate: 0 });
    }
  } catch (err) {
    return errorResponse(res, err);
  }
});

// ---------------------------------------------------------------------------
// @route   POST /api/business-cards/checkout
// @desc    Create a Stripe PaymentIntent and local order record
// @access  Private (agent)
// ---------------------------------------------------------------------------
router.post('/checkout', authenticate, async (req, res) => {
  try {
    const { variantId, variantName, productName, productThumbnail,
            sku, unitPrice, quantity, shippingAddress, textValues, mockupUrl,
            templateId, photoUrl } = req.body;

    // Validate required fields
    if (!variantId) return sendResponse(res, 400, { message: 'Product variant ID is required.' });
    if (!quantity || quantity < 1 || quantity > 5000) {
      return sendResponse(res, 400, { message: 'Quantity must be between 1 and 5000.' });
    }
    if (!unitPrice || isNaN(parseFloat(unitPrice)) || parseFloat(unitPrice) <= 0) {
      return sendResponse(res, 400, { message: 'Valid unit price is required.' });
    }
    if (!shippingAddress || !shippingAddress.name || !shippingAddress.address1 ||
        !shippingAddress.city || !shippingAddress.state || !shippingAddress.zip) {
      return sendResponse(res, 400, { message: 'Complete shipping address is required.' });
    }

    const config = await getPrintfulConfig();
    if (!config.enabled) return sendResponse(res, 503, { message: 'Store is not currently available.' });
    if (!config.apiKey) return sendResponse(res, 503, { message: 'Printful integration not configured.' });

    // Calculate costs
    const qty = parseInt(quantity);
    const price = parseFloat(unitPrice);
    const subtotal = Math.round(price * qty * 100) / 100; // round to 2 decimals
    const shippingCost = 0; // Will be included in Printful fulfillment cost
    const total = subtotal + shippingCost;

    // Create local order record
    const order = await PrintfulOrder.create({
      user: req.user._id,
      userEmail: req.user.email,
      userName: req.user.firstName ? `${req.user.firstName} ${req.user.lastName || ''}`.trim() : req.user.email,
      product: {
        name: productName || 'Product',
        variantId: parseInt(variantId),
        variantName: variantName || '',
        sku: sku || '',
        thumbnail: productThumbnail || '',
        unitPrice: price,
        quantity: qty
      },
      textValues: textValues || {},
      mockupUrl: mockupUrl || '',
      templateId: templateId || '',
      photoUrl: photoUrl || '',
      shippingAddress: {
        name: shippingAddress.name,
        address1: shippingAddress.address1,
        address2: shippingAddress.address2 || '',
        city: shippingAddress.city,
        state: shippingAddress.state,
        zip: shippingAddress.zip,
        country: shippingAddress.country || 'US',
        phone: shippingAddress.phone || ''
      },
      subtotal,
      shipping: shippingCost,
      total,
      paymentStatus: 'pending'
    });

    // Create Stripe PaymentIntent
    const amountCents = Math.round(total * 100);
    const paymentIntent = await createPaymentIntent(
      amountCents,
      'usd',
      null, // no customer needed
      {
        orderId: order._id.toString(),
        userEmail: req.user.email,
        productName: productName || 'Printful Product'
      }
    );

    order.stripePaymentIntentId = paymentIntent.id;
    await order.save();

    return sendResponse(res, 201, {
      orderId: order._id,
      clientSecret: paymentIntent.client_secret,
      total,
      subtotal,
      shipping: shippingCost
    });
  } catch (err) {
    return errorResponse(res, err);
  }
});

// ---------------------------------------------------------------------------
// @route   POST /api/business-cards/checkout/confirm
// @desc    Confirm payment succeeded and submit order to Printful
// @access  Private (agent)
// ---------------------------------------------------------------------------
router.post('/checkout/confirm', authenticate, async (req, res) => {
  try {
    const { orderId, paymentIntentId } = req.body;

    if (!orderId) return sendResponse(res, 400, { message: 'Order ID is required.' });

    const order = await PrintfulOrder.findOne({
      _id: orderId,
      user: req.user._id,
      deletedAt: null
    });
    if (!order) return sendResponse(res, 404, { message: 'Order not found.' });

    // Verify payment with Stripe
    if (stripe && paymentIntentId) {
      try {
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (pi.status === 'succeeded') {
          order.paymentStatus = 'paid';
          order.paidAt = new Date();
          // Try to get receipt URL from the charge
          if (pi.latest_charge) {
            try {
              const charge = await stripe.charges.retrieve(pi.latest_charge);
              order.stripeReceiptUrl = charge.receipt_url || '';
            } catch (_) { /* ignore */ }
          }
        } else {
          order.paymentStatus = 'failed';
          await order.save();
          return sendResponse(res, 400, { message: 'Payment has not succeeded yet.' });
        }
      } catch (stripeErr) {
        order.paymentStatus = 'failed';
        await order.save();
        return sendResponse(res, 400, { message: 'Could not verify payment.' });
      }
    } else {
      // If Stripe not configured, just mark as paid (for testing)
      order.paymentStatus = 'paid';
      order.paidAt = new Date();
    }

    // Submit to Printful as draft
    const config = await getPrintfulConfig();
    if (config.apiKey) {
      try {
        const printful = getPrintfulClient(config.apiKey, config.storeId);

        const orderItem = {
          sync_variant_id: order.product.variantId,
          quantity: order.product.quantity
        };

        // Render the agent's personalized print files and override the sync
        // product's default files (front + back). If rendering fails, the order
        // is still created but left for admin review rather than auto-confirmed.
        if (order.templateId) {
          try {
            const template = await getTemplateById(order.templateId);
            if (template) {
              const rendered = await renderCard(
                template, order.textValues || {}, order.photoUrl || '', `order-${order._id}`);

              const printFiles = {};
              orderItem.files = rendered.map(r => {
                const url = buildPrintFileUrl(r.filename);
                printFiles[r.placement] = url;
                return { type: r.placement, url };
              });
              order.printFiles = printFiles;
            }
          } catch (renderErr) {
            console.error('Card render failed for order', String(order._id), '-', renderErr.message);
            // Leave orderItem without files; admin reviews before Printful confirm.
          }
        }

        const orderPayload = {
          recipient: {
            name: order.shippingAddress.name,
            address1: order.shippingAddress.address1,
            address2: order.shippingAddress.address2 || '',
            city: order.shippingAddress.city,
            state_code: order.shippingAddress.state,
            country_code: order.shippingAddress.country || 'US',
            zip: order.shippingAddress.zip,
            phone: order.shippingAddress.phone || '',
            email: order.userEmail
          },
          items: [orderItem]
        };

        // Add personalization notes
        if (order.textValues && Object.keys(order.textValues).length > 0) {
          const noteLines = Object.entries(order.textValues)
            .filter(([, val]) => val)
            .map(([key, val]) => `${key}: ${val}`);
          if (noteLines.length > 0) {
            orderPayload.packing_slip = {
              message: 'CARD PERSONALIZATION:\n' + noteLines.join('\n')
            };
          }
        }

        const pfResponse = await printful.post('/orders', orderPayload);
        const pfOrder = pfResponse.data?.result;
        if (pfOrder) {
          order.printfulOrderId = pfOrder.id;
          order.printfulStatus = pfOrder.status || 'draft';
        }
      } catch (pfErr) {
        // Log but don't fail — order is paid, admin can submit manually
        console.error('Printful order submission failed:', pfErr.response?.data || pfErr.message);
      }
    }

    await order.save();

    return sendResponse(res, 200, {
      message: 'Payment confirmed! Your order has been submitted.',
      order: {
        id: order._id,
        printfulOrderId: order.printfulOrderId,
        paymentStatus: order.paymentStatus,
        adminStatus: order.adminStatus,
        total: order.total,
        receiptUrl: order.stripeReceiptUrl || ''
      }
    });
  } catch (err) {
    return errorResponse(res, err);
  }
});

// ---------------------------------------------------------------------------
// @route   GET /api/business-cards/orders
// @desc    Get order history for the current agent (from local DB)
// @access  Private (agent)
// ---------------------------------------------------------------------------
router.get('/orders', authenticate, async (req, res) => {
  try {
    const orders = await PrintfulOrder.find({
      user: req.user._id,
      deletedAt: null
    })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

    return sendResponse(res, 200, {
      orders: orders.map(o => ({
        id: o._id,
        printfulOrderId: o.printfulOrderId,
        productName: o.product?.name || 'Product',
        variantName: o.product?.variantName || '',
        thumbnail: o.product?.thumbnail || '',
        quantity: o.product?.quantity || 1,
        unitPrice: o.product?.unitPrice || 0,
        total: o.total,
        subtotal: o.subtotal,
        paymentStatus: o.paymentStatus,
        adminStatus: o.adminStatus,
        printfulStatus: o.printfulStatus,
        receiptUrl: o.stripeReceiptUrl || '',
        shippingAddress: o.shippingAddress,
        textValues: o.textValues,
        mockupUrl: o.mockupUrl || '',
        adminNotes: o.adminNotes || '',
        created: o.createdAt,
        paidAt: o.paidAt
      }))
    });
  } catch (err) {
    return errorResponse(res, err);
  }
});

// ===========================================================================
// ADMIN ROUTES
// ===========================================================================

// ---------------------------------------------------------------------------
// @route   GET /api/business-cards/admin/config
// @desc    Get Printful configuration (admin only)
// @access  Admin
// ---------------------------------------------------------------------------
router.get('/admin/config', authenticate, authorize('admin'), async (req, res) => {
  try {
    const config = await getPrintfulConfig();
    const maskedKey = config.apiKey ? '••••••••' + config.apiKey.slice(-4) : '';

    // Get current text fields
    const tfRecord = await SystemConfig.findOne({ key: KEYS.TEXT_FIELDS }).lean();
    let textFields = [];
    try { textFields = tfRecord?.value ? JSON.parse(tfRecord.value) : []; } catch (_) {}

    const templates = await getCardTemplates();

    return sendResponse(res, 200, {
      config: { ...config, apiKey: maskedKey, hasApiKey: !!config.apiKey, textFields, templates }
    });
  } catch (err) {
    return errorResponse(res, err);
  }
});

// ---------------------------------------------------------------------------
// @route   POST /api/business-cards/admin/config
// @desc    Update Printful configuration (API key, store ID, enable/disable)
// @access  Admin only
// ---------------------------------------------------------------------------
router.post('/admin/config', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { apiKey, storeId, enabled, textFields, templates } = req.body;

    if (apiKey !== undefined) await upsertConfig(KEYS.API_KEY, apiKey, req.user._id);
    if (storeId !== undefined) await upsertConfig(KEYS.STORE_ID, storeId, req.user._id);
    if (enabled !== undefined) await upsertConfig(KEYS.ENABLED, String(enabled), req.user._id);
    if (textFields !== undefined) {
      // textFields is an array of {id, label, required}
      await upsertConfig(KEYS.TEXT_FIELDS, JSON.stringify(textFields), req.user._id);
    }
    if (templates !== undefined) {
      // templates is an array of CardTemplate objects (see cardRenderer.js)
      await upsertConfig(KEYS.TEMPLATES, JSON.stringify(templates), req.user._id);
    }

    const config = await getPrintfulConfig();
    const maskedKey = config.apiKey ? '••••••••' + config.apiKey.slice(-4) : '';

    // Get current text fields
    const tfRecord = await SystemConfig.findOne({ key: KEYS.TEXT_FIELDS }).lean();
    let currentTextFields = [];
    try { currentTextFields = tfRecord?.value ? JSON.parse(tfRecord.value) : []; } catch (_) {}

    const currentTemplates = await getCardTemplates();

    return sendResponse(res, 200, {
      message: 'Printful configuration updated.',
      config: { ...config, apiKey: maskedKey, hasApiKey: !!config.apiKey,
                textFields: currentTextFields, templates: currentTemplates }
    });
  } catch (err) {
    return errorResponse(res, err);
  }
});

// ---------------------------------------------------------------------------
// @route   POST /api/business-cards/admin/template-asset
// @desc    Upload a template background image or font; returns its /uploads URL
// @access  Admin only
// ---------------------------------------------------------------------------
router.post('/admin/template-asset', authenticate, authorize('admin'),
  templateUpload.single('asset'), (req, res) => {
    try {
      if (!req.file) return sendResponse(res, 400, { message: 'No asset uploaded.' });
      const url = `/uploads/card-templates/${req.file.filename}`;
      return sendResponse(res, 200, { url, message: 'Asset uploaded.' });
    } catch (error) {
      return errorResponse(res, error);
    }
  });

// ---------------------------------------------------------------------------
// @route   POST /api/business-cards/admin/test-connection
// @desc    Test Printful API connection and return store info
// @access  Admin only
// ---------------------------------------------------------------------------
router.post('/admin/test-connection', authenticate, authorize('admin'), async (req, res) => {
  try {
    const config = await getPrintfulConfig();
    if (!config.apiKey) {
      return sendResponse(res, 400, { message: 'No API key configured.' });
    }

    const printful = getPrintfulClient(config.apiKey, config.storeId);
    const response = await printful.get('/store');
    const store = response.data?.result;

    return sendResponse(res, 200, {
      message: 'Connection successful!',
      store: { id: store?.id, name: store?.name, type: store?.type }
    });
  } catch (err) {
    if (err.response && err.response.status === 401) {
      return sendResponse(res, 401, { message: 'Invalid API key.' });
    }
    if (err.response && err.response.data) {
      return sendResponse(res, err.response.status || 500, {
        message: err.response.data.result || 'Connection test failed.'
      });
    }
    return errorResponse(res, err);
  }
});

// ===========================================================================
// ADMIN ORDER MANAGEMENT ROUTES
// ===========================================================================

// ---------------------------------------------------------------------------
// @route   GET /api/business-cards/admin/orders
// @desc    Get all orders with filtering (admin)
// @access  Admin
// ---------------------------------------------------------------------------
router.get('/admin/orders', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { adminStatus, paymentStatus, page = 1, limit = 25, search } = req.query;

    const filter = { deletedAt: null };
    if (adminStatus && adminStatus !== 'all') filter.adminStatus = adminStatus;
    if (paymentStatus && paymentStatus !== 'all') filter.paymentStatus = paymentStatus;
    if (search) {
      filter.$or = [
        { userEmail: { $regex: search, $options: 'i' } },
        { userName: { $regex: search, $options: 'i' } },
        { 'product.name': { $regex: search, $options: 'i' } },
        { 'shippingAddress.name': { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [orders, total] = await Promise.all([
      PrintfulOrder.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('user', 'firstName lastName email')
        .populate('reviewedBy', 'firstName lastName')
        .lean(),
      PrintfulOrder.countDocuments(filter)
    ]);

    // Counts by status
    const [pendingCount, approvedCount, rejectedCount, totalAll] = await Promise.all([
      PrintfulOrder.countDocuments({ adminStatus: 'pending_review', deletedAt: null }),
      PrintfulOrder.countDocuments({ adminStatus: 'approved', deletedAt: null }),
      PrintfulOrder.countDocuments({ adminStatus: 'rejected', deletedAt: null }),
      PrintfulOrder.countDocuments({ deletedAt: null })
    ]);

    return sendResponse(res, 200, {
      orders: orders.map(o => ({
        id: o._id,
        user: o.user ? {
          id: o.user._id,
          name: `${o.user.firstName || ''} ${o.user.lastName || ''}`.trim() || o.userEmail,
          email: o.user.email || o.userEmail
        } : { name: o.userName, email: o.userEmail },
        product: o.product,
        textValues: o.textValues,
        mockupUrl: o.mockupUrl || '',
        shippingAddress: o.shippingAddress,
        subtotal: o.subtotal,
        shipping: o.shipping,
        total: o.total,
        paymentStatus: o.paymentStatus,
        adminStatus: o.adminStatus,
        adminNotes: o.adminNotes || '',
        printfulOrderId: o.printfulOrderId,
        printfulStatus: o.printfulStatus,
        stripePaymentIntentId: o.stripePaymentIntentId || '',
        receiptUrl: o.stripeReceiptUrl || '',
        reviewedBy: o.reviewedBy ? `${o.reviewedBy.firstName || ''} ${o.reviewedBy.lastName || ''}`.trim() : null,
        reviewedAt: o.reviewedAt,
        paidAt: o.paidAt,
        created: o.createdAt
      })),
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      counts: { pending: pendingCount, approved: approvedCount, rejected: rejectedCount, total: totalAll }
    });
  } catch (err) {
    return errorResponse(res, err);
  }
});

// ---------------------------------------------------------------------------
// @route   GET /api/business-cards/admin/orders/:id
// @desc    Get single order detail (admin)
// @access  Admin
// ---------------------------------------------------------------------------
router.get('/admin/orders/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const order = await PrintfulOrder.findById(req.params.id)
      .populate('user', 'firstName lastName email phone')
      .populate('reviewedBy', 'firstName lastName')
      .lean();

    if (!order) return sendResponse(res, 404, { message: 'Order not found.' });

    return sendResponse(res, 200, { order });
  } catch (err) {
    return errorResponse(res, err);
  }
});

// ---------------------------------------------------------------------------
// @route   PUT /api/business-cards/admin/orders/:id/approve
// @desc    Approve an order (admin)
// @access  Admin
// ---------------------------------------------------------------------------
router.put('/admin/orders/:id/approve', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { notes } = req.body;
    const order = await PrintfulOrder.findOne({ _id: req.params.id, deletedAt: null });
    if (!order) return sendResponse(res, 404, { message: 'Order not found.' });

    order.adminStatus = 'approved';
    order.reviewedBy = req.user._id;
    order.reviewedAt = new Date();
    if (notes !== undefined) order.adminNotes = notes;

    // If paid and has Printful order, try to confirm it
    if (order.paymentStatus === 'paid' && order.printfulOrderId) {
      try {
        const config = await getPrintfulConfig();
        if (config.apiKey) {
          const printful = getPrintfulClient(config.apiKey, config.storeId);
          await printful.post(`/orders/${order.printfulOrderId}/confirm`);
          order.printfulStatus = 'pending';
        }
      } catch (pfErr) {
        // Log but don't block approval
        console.error('Printful confirm failed:', pfErr.response?.data || pfErr.message);
      }
    }

    await order.save();
    return sendResponse(res, 200, { message: 'Order approved.', order: { id: order._id, adminStatus: order.adminStatus } });
  } catch (err) {
    return errorResponse(res, err);
  }
});

// ---------------------------------------------------------------------------
// @route   PUT /api/business-cards/admin/orders/:id/reject
// @desc    Reject an order (admin)
// @access  Admin
// ---------------------------------------------------------------------------
router.put('/admin/orders/:id/reject', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { notes } = req.body;
    const order = await PrintfulOrder.findOne({ _id: req.params.id, deletedAt: null });
    if (!order) return sendResponse(res, 404, { message: 'Order not found.' });

    order.adminStatus = 'rejected';
    order.reviewedBy = req.user._id;
    order.reviewedAt = new Date();
    if (notes !== undefined) order.adminNotes = notes;

    // If paid, initiate refund
    if (order.paymentStatus === 'paid' && order.stripePaymentIntentId && stripe) {
      try {
        await stripe.refunds.create({ payment_intent: order.stripePaymentIntentId });
        order.paymentStatus = 'refunded';
      } catch (refundErr) {
        console.error('Refund failed:', refundErr.message);
        // Append note about manual refund needed
        order.adminNotes = (order.adminNotes ? order.adminNotes + '\n' : '') +
          '[SYSTEM] Auto-refund failed. Manual refund needed for PI: ' + order.stripePaymentIntentId;
      }
    }

    await order.save();
    return sendResponse(res, 200, { message: 'Order rejected.', order: { id: order._id, adminStatus: order.adminStatus, paymentStatus: order.paymentStatus } });
  } catch (err) {
    return errorResponse(res, err);
  }
});

// ---------------------------------------------------------------------------
// @route   PUT /api/business-cards/admin/orders/:id/notes
// @desc    Update admin notes on an order
// @access  Admin
// ---------------------------------------------------------------------------
router.put('/admin/orders/:id/notes', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { notes } = req.body;
    if (notes === undefined) return sendResponse(res, 400, { message: 'Notes field required.' });

    const order = await PrintfulOrder.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      { adminNotes: notes },
      { new: true }
    );
    if (!order) return sendResponse(res, 404, { message: 'Order not found.' });

    return sendResponse(res, 200, { message: 'Notes updated.', order: { id: order._id, adminNotes: order.adminNotes } });
  } catch (err) {
    return errorResponse(res, err);
  }
});

// ---------------------------------------------------------------------------
// @route   DELETE /api/business-cards/admin/orders/:id
// @desc    Soft-delete an order (admin)
// @access  Admin
// ---------------------------------------------------------------------------
router.delete('/admin/orders/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const order = await PrintfulOrder.findOne({ _id: req.params.id, deletedAt: null });
    if (!order) return sendResponse(res, 404, { message: 'Order not found.' });

    order.deletedAt = new Date();
    order.deletedBy = req.user._id;
    order.adminStatus = 'deleted';
    await order.save();

    return sendResponse(res, 200, { message: 'Order deleted.' });
  } catch (err) {
    return errorResponse(res, err);
  }
});

// ---------------------------------------------------------------------------
// @route   GET /api/business-cards/admin/orders/:id/receipt
// @desc    Get payment receipt details for an order
// @access  Admin
// ---------------------------------------------------------------------------
router.get('/admin/orders/:id/receipt', authenticate, authorize('admin'), async (req, res) => {
  try {
    const order = await PrintfulOrder.findById(req.params.id).populate('user', 'firstName lastName email').lean();
    if (!order) return sendResponse(res, 404, { message: 'Order not found.' });

    let stripeData = null;
    if (order.stripePaymentIntentId && stripe) {
      try {
        const pi = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
        let chargeData = null;
        if (pi.latest_charge) {
          const charge = await stripe.charges.retrieve(pi.latest_charge);
          chargeData = {
            id: charge.id,
            amount: charge.amount,
            currency: charge.currency,
            status: charge.status,
            receiptUrl: charge.receipt_url,
            paymentMethod: charge.payment_method_details?.type || 'card',
            cardBrand: charge.payment_method_details?.card?.brand || '',
            cardLast4: charge.payment_method_details?.card?.last4 || '',
            created: new Date(charge.created * 1000).toISOString()
          };
        }
        stripeData = {
          paymentIntentId: pi.id,
          amount: pi.amount,
          currency: pi.currency,
          status: pi.status,
          charge: chargeData
        };
      } catch (_) { /* Stripe lookup failed */ }
    }

    return sendResponse(res, 200, {
      receipt: {
        orderId: order._id,
        user: order.user ? {
          name: `${order.user.firstName || ''} ${order.user.lastName || ''}`.trim(),
          email: order.user.email
        } : { name: order.userName, email: order.userEmail },
        product: order.product,
        shippingAddress: order.shippingAddress,
        subtotal: order.subtotal,
        shipping: order.shipping,
        total: order.total,
        paymentStatus: order.paymentStatus,
        paidAt: order.paidAt,
        stripeReceiptUrl: order.stripeReceiptUrl || '',
        stripe: stripeData,
        created: order.createdAt
      }
    });
  } catch (err) {
    return errorResponse(res, err);
  }
});

module.exports = router;
