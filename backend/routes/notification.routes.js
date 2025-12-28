const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { sendResponse, errorResponse } = require('../utils/helpers');

// @route   GET /api/notifications
// @desc    Get user's notifications
// @access  Private
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const unreadOnly = req.query.unreadOnly === 'true';
    
    const query = { userId: req.user._id };
    if (unreadOnly) {
      query.isRead = false;
    }
    
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit)
      .lean();
    
    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({ 
      userId: req.user._id, 
      isRead: false 
    });
    
    sendResponse(res, 200, {
      notifications,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      unreadCount
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/notifications/unread-count
// @desc    Get count of unread notifications
// @access  Private
router.get('/unread-count', async (req, res) => {
  try {
    const count = await Notification.countDocuments({ 
      userId: req.user._id, 
      isRead: false 
    });
    
    sendResponse(res, 200, { count });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   PUT /api/notifications/:id/read
// @desc    Mark notification as read
// @access  Private
router.put('/:id/read', async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      userId: req.user._id
    });
    
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    notification.isRead = true;
    await notification.save();
    
    sendResponse(res, 200, { notification });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   PUT /api/notifications/mark-all-read
// @desc    Mark all notifications as read
// @access  Private
router.put('/mark-all-read', async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.user._id, isRead: false },
      { isRead: true }
    );
    
    sendResponse(res, 200, { message: 'All notifications marked as read' });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   DELETE /api/notifications/:id
// @desc    Delete a notification
// @access  Private
router.delete('/:id', async (req, res) => {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });
    
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    sendResponse(res, 200, { message: 'Notification deleted' });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   DELETE /api/notifications
// @desc    Delete all read notifications
// @access  Private
router.delete('/', async (req, res) => {
  try {
    await Notification.deleteMany({
      userId: req.user._id,
      isRead: true
    });
    
    sendResponse(res, 200, { message: 'Read notifications deleted' });
  } catch (error) {
    errorResponse(res, error);
  }
});

module.exports = router;
