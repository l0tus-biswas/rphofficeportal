const express = require('express');
const router = express.Router();
const axios = require('axios');
const SystemConfig = require('../models/SystemConfig');
const { protect: authenticate, authorize } = require('../middleware/auth.middleware');
const { sendResponse, errorResponse } = require('../utils/helpers');

// ---------------------------------------------------------------------------
// Printful API Configuration
// ---------------------------------------------------------------------------
const PRINTFUL_BASE_URL = 'https://api.printful.com';

const KEYS = {
  API_KEY:     'printful_api_key',
  STORE_ID:    'printful_store_id',
  ENABLED:     'printful_enabled',
  TEXT_FIELDS: 'printful_text_fields' // JSON array of {id, label, required}
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

// ===========================================================================
// AGENT ROUTES
// ===========================================================================

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
// @route   POST /api/business-cards/order
// @desc    Place an order for a specific product variant
// @access  Private (agent)
// ---------------------------------------------------------------------------
router.post('/order', authenticate, async (req, res) => {
  try {
    const { variantId, quantity, shippingAddress, textValues } = req.body;

    // Validate
    if (!variantId) {
      return sendResponse(res, 400, { message: 'Product variant ID is required.' });
    }
    if (!quantity || quantity < 1 || quantity > 5000) {
      return sendResponse(res, 400, { message: 'Quantity must be between 1 and 5000.' });
    }
    if (!shippingAddress || !shippingAddress.name || !shippingAddress.address1 ||
        !shippingAddress.city || !shippingAddress.state || !shippingAddress.zip) {
      return sendResponse(res, 400, { message: 'Complete shipping address is required (name, address1, city, state, zip).' });
    }

    const config = await getPrintfulConfig();
    if (!config.enabled) {
      return sendResponse(res, 503, { message: 'Business cards ordering is not currently available.' });
    }
    if (!config.apiKey) {
      return sendResponse(res, 503, { message: 'Printful integration is not configured. Contact admin.' });
    }

    const printful = getPrintfulClient(config.apiKey, config.storeId);

    // Build order item
    const orderItem = {
      sync_variant_id: parseInt(variantId),
      quantity: parseInt(quantity)
    };

    const orderPayload = {
      recipient: {
        name: shippingAddress.name,
        address1: shippingAddress.address1,
        address2: shippingAddress.address2 || '',
        city: shippingAddress.city,
        state_code: shippingAddress.state,
        country_code: shippingAddress.country || 'US',
        zip: shippingAddress.zip,
        phone: shippingAddress.phone || '',
        email: req.user.email
      },
      items: [orderItem]
    };

    // If agent provided personalization text, add as packing slip note
    if (textValues && typeof textValues === 'object' && Object.keys(textValues).length > 0) {
      const noteLines = Object.entries(textValues)
        .filter(([, val]) => val)
        .map(([key, val]) => `${key}: ${val}`);
      if (noteLines.length > 0) {
        orderPayload.packing_slip = {
          message: 'CARD PERSONALIZATION:\n' + noteLines.join('\n')
        };
      }
    }

    // Create order as draft (admin confirms in Printful dashboard)
    const response = await printful.post('/orders', orderPayload);
    const order = response.data?.result;

    return sendResponse(res, 201, {
      message: 'Order placed successfully! It will be reviewed and shipped soon.',
      order: {
        id: order?.id,
        status: order?.status || 'draft',
        costs: order?.retail_costs || order?.costs || null,
        items: order?.items?.length || 1
      }
    });
  } catch (err) {
    if (err.response && err.response.data) {
      const pfError = err.response.data;
      return sendResponse(res, err.response.status || 500, {
        message: pfError.result || pfError.error?.message || 'Order failed.',
        code: pfError.code
      });
    }
    return errorResponse(res, err);
  }
});

// ---------------------------------------------------------------------------
// @route   GET /api/business-cards/orders
// @desc    Get order history for the current agent
// @access  Private (agent)
// ---------------------------------------------------------------------------
router.get('/orders', authenticate, async (req, res) => {
  try {
    const config = await getPrintfulConfig();
    if (!config.apiKey) {
      return sendResponse(res, 200, { orders: [] });
    }

    const printful = getPrintfulClient(config.apiKey, config.storeId);
    const response = await printful.get('/orders', { params: { limit: 50 } });

    const allOrders = response.data?.result || [];
    // Filter to this agent's orders by email
    const agentOrders = allOrders.filter(
      o => o.recipient && o.recipient.email === req.user.email
    );

    return sendResponse(res, 200, {
      orders: agentOrders.map(o => ({
        id: o.id,
        status: o.status,
        created: o.created ? new Date(o.created * 1000).toISOString() : null,
        shipping: o.shipping_service_name || o.shipping || 'Standard',
        costs: o.retail_costs || o.costs,
        dashboardUrl: o.dashboard_url || null,
        recipient: o.recipient ? {
          name: o.recipient.name,
          city: o.recipient.city,
          state: o.recipient.state_code || o.recipient.state_name || ''
        } : null,
        items: (o.items || []).map(i => ({ name: i.name || i.product?.name || 'Item', quantity: i.quantity }))
      }))
    });
  } catch (err) {
    if (err.response && err.response.data) {
      return sendResponse(res, err.response.status || 500, {
        message: err.response.data.result || 'Failed to fetch orders.'
      });
    }
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

    return sendResponse(res, 200, {
      config: { ...config, apiKey: maskedKey, hasApiKey: !!config.apiKey, textFields }
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
    const { apiKey, storeId, enabled, textFields } = req.body;

    if (apiKey !== undefined) await upsertConfig(KEYS.API_KEY, apiKey, req.user._id);
    if (storeId !== undefined) await upsertConfig(KEYS.STORE_ID, storeId, req.user._id);
    if (enabled !== undefined) await upsertConfig(KEYS.ENABLED, String(enabled), req.user._id);
    if (textFields !== undefined) {
      // textFields is an array of {id, label, required}
      await upsertConfig(KEYS.TEXT_FIELDS, JSON.stringify(textFields), req.user._id);
    }

    const config = await getPrintfulConfig();
    const maskedKey = config.apiKey ? '••••••••' + config.apiKey.slice(-4) : '';

    // Get current text fields
    const tfRecord = await SystemConfig.findOne({ key: KEYS.TEXT_FIELDS }).lean();
    let currentTextFields = [];
    try { currentTextFields = tfRecord?.value ? JSON.parse(tfRecord.value) : []; } catch (_) {}

    return sendResponse(res, 200, {
      message: 'Printful configuration updated.',
      config: { ...config, apiKey: maskedKey, hasApiKey: !!config.apiKey, textFields: currentTextFields }
    });
  } catch (err) {
    return errorResponse(res, err);
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

module.exports = router;
