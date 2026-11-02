const express = require('express');
const router = express.Router();
const { serverError } = require('../utils/helpers');
const ProductType = require('../models/ProductType');
const { protect, authorize } = require('../middleware/auth.middleware');

// All routes require authenticated admin
router.use(protect);

// Case-insensitive exact-name lookup (the unique index alone is case-sensitive)
const findByName = (name, excludeId) => ProductType.findOne({
  name: { $regex: `^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
  ...(excludeId ? { _id: { $ne: excludeId } } : {})
});

// @route   GET /api/admin/products
// @desc    Get all product types
// @access  Private (auth required; admin sees all, agents see active only)
router.get('/', async (req, res) => {
  try {
    let filter = {};

    // Non-admins only see active products
    if (req.user.role !== 'admin') {
      filter.isActive = true;
    } else if (req.query.activeOnly === 'true') {
      filter.isActive = true;
    }

    if (typeof req.query.category === 'string' && req.query.category) {
      filter.category = req.query.category;
    }

    const products = await ProductType.find(filter)
      .populate('addedBy', 'name')
      .sort({ category: 1, name: 1 });

    res.json({ products });
  } catch (error) {
    console.error('Error fetching product types:', error);
    serverError(res, error);
  }
});

// @route   POST /api/admin/products
// @desc    Create a new product type
// @access  Admin only
router.post('/', authorize('admin'), async (req, res) => {
  try {
    const { name, category } = req.body;

    if (typeof name !== 'string' || !name.trim() || typeof category !== 'string' || !category) {
      return res.status(400).json({ message: 'Name and category are required' });
    }
    if (name.trim().length > 200) {
      return res.status(400).json({ message: 'Name is too long' });
    }

    const existing = await findByName(name);
    if (existing) {
      return res.status(409).json({ message: 'A product type with this name already exists' });
    }

    const product = await ProductType.create({
      name: name.trim(),
      category,
      addedBy: req.user._id
    });

    res.status(201).json({ message: 'Product type created successfully', product });
  } catch (error) {
    console.error('Error creating product type:', error);
    serverError(res, error);
  }
});

// @route   PUT /api/admin/products/:id
// @desc    Update a product type
// @access  Admin only
router.put('/:id', authorize('admin'), async (req, res) => {
  try {
    const { name, category, isActive } = req.body;

    const product = await ProductType.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product type not found' });
    }

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim() || name.trim().length > 200) {
        return res.status(400).json({ message: 'Name must be non-empty text of at most 200 characters' });
      }
      if (await findByName(name, product._id)) {
        return res.status(409).json({ message: 'A product type with this name already exists' });
      }
      product.name = name.trim();
    }
    if (category !== undefined && typeof category !== 'string') {
      return res.status(400).json({ message: 'Invalid category' });
    }
    if (category !== undefined) product.category = category;
    if (isActive !== undefined) product.isActive = isActive;

    await product.save();

    res.json({ message: 'Product type updated successfully', product });
  } catch (error) {
    console.error('Error updating product type:', error);
    serverError(res, error);
  }
});

// @route   DELETE /api/admin/products/:id
// @desc    Soft-delete a product type (sets isActive = false)
// @access  Admin only
router.delete('/:id', authorize('admin'), async (req, res) => {
  try {
    const product = await ProductType.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product type not found' });
    }

    product.isActive = false;
    await product.save();

    res.json({ message: 'Product type deactivated successfully' });
  } catch (error) {
    console.error('Error deactivating product type:', error);
    serverError(res, error);
  }
});

module.exports = router;
