const express = require('express');
const router = express.Router();
const Broadcast = require('../models/Broadcast');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth.middleware');
const { sendResponse, errorResponse } = require('../utils/helpers');
const { sendNotificationEmail } = require('../utils/neuzmail');

// All routes require authentication
router.use(protect);

// ============================================================
// Agent-facing: View broadcasts
// ============================================================

// @route   GET /api/broadcasts
// @desc    Get all active broadcasts (agent + admin)
// @access  Private
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const query = { isActive: true };

    // Only show broadcasts that target the user's role (or all if targetRoles is empty)
    query.$or = [
      { targetRoles: { $size: 0 } },
      { targetRoles: req.user.role }
    ];

    const broadcasts = await Broadcast.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit)
      .populate('createdBy', 'name')
      .lean();

    const total = await Broadcast.countDocuments(query);

    // Check which broadcasts the user has read (via Notification)
    const broadcastIds = broadcasts.map(b => b._id.toString());
    const readNotifications = await Notification.find({
      userId: req.user._id,
      type: 'admin_broadcast',
      'data.broadcastId': { $in: broadcastIds },
      isRead: true
    }).select('data.broadcastId').lean();

    const readSet = new Set(readNotifications.map(n => n.data?.broadcastId?.toString()));

    const enriched = broadcasts.map(b => ({
      ...b,
      isRead: readSet.has(b._id.toString()),
      postedBy: b.createdBy?.name || 'Admin'
    }));

    sendResponse(res, 200, {
      broadcasts: enriched,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/broadcasts/:id
// @desc    Get single broadcast
// @access  Private
router.get('/:id', async (req, res) => {
  try {
    const broadcast = await Broadcast.findById(req.params.id)
      .populate('createdBy', 'name')
      .lean();

    if (!broadcast) {
      return sendResponse(res, 404, { message: 'Broadcast not found' });
    }

    // Mark the user's notification for this broadcast as read
    await Notification.updateMany(
      { userId: req.user._id, type: 'admin_broadcast', 'data.broadcastId': broadcast._id.toString() },
      { isRead: true }
    );

    sendResponse(res, 200, { broadcast });
  } catch (error) {
    errorResponse(res, error);
  }
});

// ============================================================
// Admin CRUD
// ============================================================

// @route   GET /api/broadcasts/admin/all
// @desc    Get all broadcasts (including inactive) for admin management
// @access  Admin only
router.get('/admin/all', authorize('admin'), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const broadcasts = await Broadcast.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit)
      .populate('createdBy', 'name')
      .lean();

    const total = await Broadcast.countDocuments();

    sendResponse(res, 200, {
      broadcasts,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/broadcasts
// @desc    Create and send a broadcast (creates notifications + sends emails)
// @access  Admin only
router.post('/', authorize('admin'), async (req, res) => {
  try {
    const { title, message, link, targetRoles } = req.body;

    if (!title || !title.trim()) {
      return sendResponse(res, 400, { message: 'Title is required' });
    }
    if (!message || !message.trim()) {
      return sendResponse(res, 400, { message: 'Message is required' });
    }

    // Create the broadcast record
    const broadcast = await Broadcast.create({
      title: title.trim(),
      message: message.trim(),
      link: link?.trim() || null,
      targetRoles: Array.isArray(targetRoles) ? targetRoles : [],
      createdBy: req.user._id
    });

    // Send notifications to matching users
    const filter = { isActive: true };
    if (broadcast.targetRoles.length > 0) {
      filter.role = { $in: broadcast.targetRoles };
    }

    const users = await User.find(filter).select('_id email name').lean();
    let sentCount = 0;
    let emailsSent = 0;

    for (const user of users) {
      try {
        // Create in-app notification (without email — we handle email separately)
        const notification = await Notification.createNotification({
          userId: user._id,
          type: 'admin_broadcast',
          title: broadcast.title,
          message: broadcast.message,
          link: broadcast.link,
          data: { broadcastBy: req.user._id, broadcastId: broadcast._id.toString() }
        }, false); // false = don't send email via notification system

        if (notification) sentCount++;

        // Send email directly
        if (user.email) {
          try {
            await sendNotificationEmail({
              toEmail: user.email,
              title: broadcast.title,
              message: broadcast.message,
              link: broadcast.link || null,
              actionLabel: 'View Announcement'
            });
            emailsSent++;
            if (notification) {
              notification.emailSent = true;
              await notification.save();
            }
          } catch (emailErr) {
            console.error(`[Broadcast] Email failed for ${user.email}:`, emailErr.message);
          }
        }
      } catch (e) {
        console.error(`[Broadcast] Notification failed for user ${user._id}:`, e.message);
      }
    }

    broadcast.sentCount = sentCount;
    broadcast.emailsSent = emailsSent;
    await broadcast.save();

    sendResponse(res, 201, {
      message: `Broadcast sent to ${sentCount} users (${emailsSent} emails)`,
      broadcast
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   PUT /api/broadcasts/:id
// @desc    Update a broadcast (title/message/link only — does NOT re-send)
// @access  Admin only
router.put('/:id', authorize('admin'), async (req, res) => {
  try {
    const broadcast = await Broadcast.findById(req.params.id);
    if (!broadcast) {
      return sendResponse(res, 404, { message: 'Broadcast not found' });
    }

    const { title, message, link, isActive } = req.body;
    if (title !== undefined) broadcast.title = title.trim();
    if (message !== undefined) broadcast.message = message.trim();
    if (link !== undefined) broadcast.link = link?.trim() || null;
    if (typeof isActive === 'boolean') broadcast.isActive = isActive;

    await broadcast.save();
    sendResponse(res, 200, { message: 'Broadcast updated', broadcast });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   DELETE /api/broadcasts/:id
// @desc    Delete a broadcast and its notifications
// @access  Admin only
router.delete('/:id', authorize('admin'), async (req, res) => {
  try {
    const broadcast = await Broadcast.findById(req.params.id);
    if (!broadcast) {
      return sendResponse(res, 404, { message: 'Broadcast not found' });
    }

    // Remove all related notifications
    await Notification.deleteMany({
      type: 'admin_broadcast',
      'data.broadcastId': broadcast._id.toString()
    });

    await Broadcast.deleteOne({ _id: broadcast._id });
    sendResponse(res, 200, { message: 'Broadcast deleted' });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/broadcasts/:id/resend
// @desc    Resend an existing broadcast to users who haven't received it
// @access  Admin only
router.post('/:id/resend', authorize('admin'), async (req, res) => {
  try {
    const broadcast = await Broadcast.findById(req.params.id);
    if (!broadcast) {
      return sendResponse(res, 404, { message: 'Broadcast not found' });
    }

    const filter = { isActive: true };
    if (broadcast.targetRoles.length > 0) {
      filter.role = { $in: broadcast.targetRoles };
    }

    const users = await User.find(filter).select('_id email name').lean();

    // Find users who already have this notification
    const existing = await Notification.find({
      type: 'admin_broadcast',
      'data.broadcastId': broadcast._id.toString()
    }).select('userId').lean();
    const existingSet = new Set(existing.map(n => n.userId.toString()));

    let sentCount = 0;
    let emailsSent = 0;

    for (const user of users) {
      if (existingSet.has(user._id.toString())) continue;
      try {
        const notification = await Notification.createNotification({
          userId: user._id,
          type: 'admin_broadcast',
          title: broadcast.title,
          message: broadcast.message,
          link: broadcast.link,
          data: { broadcastBy: broadcast.createdBy, broadcastId: broadcast._id.toString() }
        }, false);

        if (notification) sentCount++;

        // Send email directly
        if (user.email) {
          try {
            await sendNotificationEmail({
              toEmail: user.email,
              title: broadcast.title,
              message: broadcast.message,
              link: broadcast.link || null,
              actionLabel: 'View Announcement'
            });
            emailsSent++;
            if (notification) {
              notification.emailSent = true;
              await notification.save();
            }
          } catch (emailErr) {
            console.error(`[Broadcast Resend] Email failed for ${user.email}:`, emailErr.message);
          }
        }
      } catch (e) {
        console.error(`[Broadcast Resend] Notification failed for user ${user._id}:`, e.message);
      }
    }

    broadcast.sentCount += sentCount;
    broadcast.emailsSent += emailsSent;
    await broadcast.save();

    sendResponse(res, 200, {
      message: `Resent to ${sentCount} new users (${emailsSent} emails)`,
      broadcast
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

module.exports = router;
