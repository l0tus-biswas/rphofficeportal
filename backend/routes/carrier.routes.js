const express = require('express');
const router = express.Router();
const Carrier = require('../models/Carrier');
const { protect: authenticate, authorize } = require('../middleware/auth.middleware');

// @route   GET /api/carriers
// @desc    Get all carriers (active only by default)
// @access  Private
router.get('/', authenticate, async (req, res) => {
  try {
    const query = {};
    
    // Admin can see all carriers, agents see only active
    if (req.user.role !== 'admin' || req.query.activeOnly === 'true') {
      query.isActive = true;
    }
    
    const carriers = await Carrier.find(query)
      .select('-__v')
      .sort({ name: 1 });
    
    res.json(carriers);
  } catch (error) {
    console.error('Error fetching carriers:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/carriers/:id
// @desc    Get specific carrier
// @access  Private
router.get('/:id', authenticate, async (req, res) => {
  try {
    const carrier = await Carrier.findById(req.params.id)
      .populate('addedBy', 'name')
      .populate('lastModifiedBy', 'name');
    
    if (!carrier) {
      return res.status(404).json({ message: 'Carrier not found' });
    }
    
    res.json(carrier);
  } catch (error) {
    console.error('Error fetching carrier:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/carriers
// @desc    Create new carrier
// @access  Admin only
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { name, contactInfo, notes } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: 'Carrier name is required' });
    }
    
    // Check if carrier already exists
    const existing = await Carrier.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (existing) {
      return res.status(400).json({ message: 'Carrier with this name already exists' });
    }
    
    const carrier = new Carrier({
      name,
      contactInfo,
      notes,
      addedBy: req.user._id,
      lastModifiedBy: req.user._id
    });
    
    await carrier.save();
    await carrier.populate('addedBy', 'name');
    
    res.status(201).json(carrier);
  } catch (error) {
    console.error('Error creating carrier:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/carriers/:id
// @desc    Update carrier
// @access  Admin only
router.put('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const carrier = await Carrier.findById(req.params.id);
    
    if (!carrier) {
      return res.status(404).json({ message: 'Carrier not found' });
    }
    
    const { name, isActive, contactInfo, notes } = req.body;
    
    // Check if name change conflicts with existing carrier
    if (name && name !== carrier.name) {
      const existing = await Carrier.findOne({ 
        name: { $regex: new RegExp(`^${name}$`, 'i') },
        _id: { $ne: carrier._id }
      });
      if (existing) {
        return res.status(400).json({ message: 'Carrier with this name already exists' });
      }
      carrier.name = name;
    }
    
    if (isActive !== undefined) carrier.isActive = isActive;
    if (contactInfo) carrier.contactInfo = { ...carrier.contactInfo, ...contactInfo };
    if (notes !== undefined) carrier.notes = notes;
    
    carrier.lastModifiedBy = req.user._id;
    
    await carrier.save();
    await carrier.populate('lastModifiedBy', 'name');
    
    res.json(carrier);
  } catch (error) {
    console.error('Error updating carrier:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/carriers/:id
// @desc    Delete carrier (soft delete by marking inactive)
// @access  Admin only
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const carrier = await Carrier.findById(req.params.id);
    
    if (!carrier) {
      return res.status(404).json({ message: 'Carrier not found' });
    }
    
    // Soft delete - just mark as inactive
    carrier.isActive = false;
    carrier.lastModifiedBy = req.user._id;
    await carrier.save();
    
    res.json({ message: 'Carrier deactivated successfully', carrier });
  } catch (error) {
    console.error('Error deleting carrier:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
