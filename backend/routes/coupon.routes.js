const express = require('express');
const router = express.Router();
const Coupon = require('../models/Coupon');
const { protect, admin } = require('../middleware/auth.middleware');
const { sendResponse, errorResponse } = require('../utils/helpers');
const { schemas, validateRequest } = require('../middleware/validation.middleware');

// @route   GET /api/admin/coupons
// @desc    Get all coupons with pagination and filters
// @access  Private/Admin
router.get('/', protect, admin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build filter
    const filter = {};
    if (req.query.status === 'active') filter.isActive = true;
    if (req.query.status === 'inactive') filter.isActive = false;
    if (req.query.search) {
      filter.$or = [
        { code: { $regex: req.query.search, $options: 'i' } },
        { description: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    // Build sort
    let sort = {};
    if (req.query.sortBy) {
      const parts = req.query.sortBy.split(':');
      sort[parts[0]] = parts[1] === 'desc' ? -1 : 1;
    } else {
      sort = { createdAt: -1 };
    }

    const coupons = await Coupon.find(filter)
      .sort(sort)
      .limit(limit)
      .skip(skip)
      .populate('createdBy', 'name email')
      .lean();

    const total = await Coupon.countDocuments(filter);
    const now = new Date();

    // Add isValid and status fields
    const couponsWithStatus = coupons.map(coupon => ({
      ...coupon,
      isExpired: now > new Date(coupon.validUntil),
      isUsageLimitReached: coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit,
      isValid: coupon.isActive && 
               now >= new Date(coupon.validFrom) && 
               now <= new Date(coupon.validUntil) &&
               (coupon.usageLimit === null || coupon.usageCount < coupon.usageLimit)
    }));

    sendResponse(res, 200, {
      coupons: couponsWithStatus,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit
      }
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/admin/coupons/:id
// @desc    Get single coupon by ID
// @access  Private/Admin
router.get('/:id', protect, admin, async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id)
      .populate('createdBy', 'name email');

    if (!coupon) {
      return sendResponse(res, 404, { message: 'Coupon not found' });
    }

    sendResponse(res, 200, { coupon });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/admin/coupons
// @desc    Create new coupon
// @access  Private/Admin
router.post('/', protect, admin, validateRequest(schemas.coupon), async (req, res) => {
  try {
    // Check if coupon code already exists
    const existingCoupon = await Coupon.findOne({ 
      code: req.body.code.toUpperCase() 
    });

    if (existingCoupon) {
      return sendResponse(res, 400, { message: 'Coupon code already exists' });
    }

    const coupon = new Coupon({
      ...req.body,
      code: req.body.code.toUpperCase(),
      createdBy: req.user._id
    });

    await coupon.save();

    sendResponse(res, 201, {
      message: 'Coupon created successfully',
      coupon
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   PUT /api/admin/coupons/:id
// @desc    Update coupon
// @access  Private/Admin
router.put('/:id', protect, admin, validateRequest(schemas.updateCoupon), async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);

    if (!coupon) {
      return sendResponse(res, 404, { message: 'Coupon not found' });
    }

    // If code is being updated, check for duplicates
    if (req.body.code && req.body.code.toUpperCase() !== coupon.code) {
      const existingCoupon = await Coupon.findOne({ 
        code: req.body.code.toUpperCase(),
        _id: { $ne: req.params.id }
      });

      if (existingCoupon) {
        return sendResponse(res, 400, { message: 'Coupon code already exists' });
      }
    }

    // Update fields
    Object.keys(req.body).forEach(key => {
      if (key === 'code') {
        coupon[key] = req.body[key].toUpperCase();
      } else {
        coupon[key] = req.body[key];
      }
    });

    await coupon.save();

    sendResponse(res, 200, {
      message: 'Coupon updated successfully',
      coupon
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   DELETE /api/admin/coupons/:id
// @desc    Delete coupon
// @access  Private/Admin
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);

    if (!coupon) {
      return sendResponse(res, 404, { message: 'Coupon not found' });
    }

    await coupon.deleteOne();

    sendResponse(res, 200, {
      message: 'Coupon deleted successfully'
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   PATCH /api/admin/coupons/:id/toggle
// @desc    Toggle coupon active status
// @access  Private/Admin
router.patch('/:id/toggle', protect, admin, async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);

    if (!coupon) {
      return sendResponse(res, 404, { message: 'Coupon not found' });
    }

    coupon.isActive = !coupon.isActive;
    await coupon.save();

    sendResponse(res, 200, {
      message: `Coupon ${coupon.isActive ? 'activated' : 'deactivated'} successfully`,
      coupon
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/admin/coupons/verify/:code
// @desc    Verify coupon code
// @access  Private/Admin
router.get('/verify/:code', protect, admin, async (req, res) => {
  try {
    const coupon = await Coupon.findOne({ 
      code: req.params.code.toUpperCase() 
    });

    if (!coupon) {
      return sendResponse(res, 404, { 
        valid: false,
        message: 'Coupon not found' 
      });
    }

    const now = new Date();
    const isValid = coupon.isActive && 
                    now >= coupon.validFrom && 
                    now <= coupon.validUntil &&
                    (coupon.usageLimit === null || coupon.usageCount < coupon.usageLimit);

    sendResponse(res, 200, {
      valid: isValid,
      coupon: isValid ? coupon : null,
      message: !isValid ? 'Coupon is not valid' : 'Coupon is valid'
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

module.exports = router;
