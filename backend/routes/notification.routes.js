const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const NotificationPreference = require('../models/NotificationPreference');
const User = require('../models/User');
const { sendResponse, errorResponse } = require('../utils/helpers');
const { protect, authorize } = require('../middleware/auth.middleware');

// ─── Notification type categories (for preference UI grouping) ───
const NOTIFICATION_CATEGORIES = {
  'Activity': ['login', 'profile_updated', 'password_changed', 'password_reset'],
  'Recruitment': ['recruit_added', 'downline_recruit', 'new_agent_registered'],
  'Payments': ['payment_completed', 'payment_failed', 'subscription_updated', 'subscription_canceled'],
  'Applications': ['apa_submitted', 'apa_approved', 'apa_rejected'],
  'Onboarding': ['onboarding_submitted', 'onboarding_step_updated', 'onboarding_approved', 'onboarding_rejected'],
  'Licensing': ['license_submitted', 'license_approved'],
  'Production': ['production_submitted', 'production_reviewed', 'production_in_force'],
  'Training': ['training_completed'],
  'Carriers': ['carrier_contract_requested', 'carrier_appointed', 'carrier_unappointed'],
  'Documents': ['document_request', 'document_submitted', 'document_reviewed'],
  'Admin': ['user_created', 'user_activated', 'user_deactivated', 'user_promoted', 'user_transferred'],
  'System': ['system_announcement', 'promotion_eligible', 'admin_broadcast']
};

// @route   GET /api/notifications/preferences
// @desc    Get user's notification preferences
// @access  Private
router.get('/preferences', async (req, res) => {
  try {
    const prefs = await NotificationPreference.getForUser(req.user._id);
    sendResponse(res, 200, { preferences: prefs, categories: NOTIFICATION_CATEGORIES });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   PUT /api/notifications/preferences
// @desc    Update user's notification preferences
// @access  Private
router.put('/preferences', async (req, res) => {
  try {
    const { preferences, muteAllEmails } = req.body;

    let prefs = await NotificationPreference.findOne({ userId: req.user._id });
    if (!prefs) {
      prefs = new NotificationPreference({ userId: req.user._id });
    }

    if (preferences && typeof preferences === 'object') {
      // Validate keys against known notification types
      for (const [type, channels] of Object.entries(preferences)) {
        if (typeof channels === 'object' && channels !== null) {
          prefs.preferences.set(type, {
            inApp: channels.inApp !== false,
            email: channels.email !== false
          });
        }
      }
    }

    if (typeof muteAllEmails === 'boolean') {
      prefs.muteAllEmails = muteAllEmails;
    }

    await prefs.save();
    sendResponse(res, 200, { message: 'Preferences updated', preferences: prefs });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/notifications/broadcast
// @desc    Admin sends a broadcast notification to all users or specific roles
// @access  Private (Admin only)
router.post('/broadcast', protect, authorize('admin'), async (req, res) => {
  try {
    const { title, message, link, targetRoles } = req.body;

    if (!title || !message) {
      return sendResponse(res, 400, { message: 'Title and message are required' });
    }

    // Build user filter
    const filter = { isActive: true };
    if (targetRoles && Array.isArray(targetRoles) && targetRoles.length > 0) {
      filter.role = { $in: targetRoles };
    }

    const users = await User.find(filter).select('_id').lean();
    let sentCount = 0;

    for (const user of users) {
      try {
        await Notification.createNotification({
          userId: user._id,
          type: 'admin_broadcast',
          title,
          message,
          link: link || null,
          data: { broadcastBy: req.user._id }
        });
        sentCount++;
      } catch (e) {
        // Skip users who opted out
      }
    }

    sendResponse(res, 200, { message: `Broadcast sent to ${sentCount} users`, sentCount });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/notifications
// @desc    Get user's notifications
// @access  Private
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const unreadOnly = req.query.unreadOnly === 'true';
    const typeFilter = req.query.type; // optional: filter by notification type
    
    const query = { userId: req.user._id };
    if (unreadOnly) {
      query.isRead = false;
    }
    if (typeFilter) {
      query.type = typeFilter;
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
