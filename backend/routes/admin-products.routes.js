const express = require('express');
const router = express.Router();
const ProductType = require('../models/ProductType');
const { protect, authorize } = require('../middleware/auth.middleware');

// All routes require authenticated admin
router.use(protect);

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

    if (req.query.category) {
      filter.category = req.query.category;
    }

    const products = await ProductType.find(filter)
      .populate('addedBy', 'name')
      .sort({ category: 1, name: 1 });

    res.json({ products });
  } catch (error) {
    console.error('Error fetching product types:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/admin/products
// @desc    Create a new product type
// @access  Admin only
router.post('/', authorize('admin'), async (req, res) => {
  try {
    const { name, category } = req.body;

    if (!name || !category) {
      return res.status(400).json({ message: 'Name and category are required' });
    }

    const existing = await ProductType.findOne({ name: name.trim() });
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
    res.status(500).json({ message: 'Server error', error: error.message });
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

    if (name !== undefined) product.name = name.trim();
    if (category !== undefined) product.category = category;
    if (isActive !== undefined) product.isActive = isActive;

    await product.save();

    res.json({ message: 'Product type updated successfully', product });
  } catch (error) {
    console.error('Error updating product type:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
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
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
