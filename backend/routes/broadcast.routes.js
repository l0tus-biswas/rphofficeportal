const express = require('express');
const router = express.Router();
const Broadcast = require('../models/Broadcast');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth.middleware');
const { sendResponse, errorResponse } = require('../utils/helpers');
const { sendNotificationEmail } = require('../utils/neuzmail');

// Neuzmail rate limit: 5 requests per 60 seconds
// Send 4 emails, then pause 61s to let the rate-limit window reset
const EMAIL_BATCH_SIZE = 4;
const EMAIL_BATCH_DELAY_MS = 61000; // 61s — just over the 60s rate-limit window

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

// ============================================================
// Admin CRUD
// ============================================================

// @route   GET /api/broadcasts/admin/all
// @desc    Get all broadcasts (including inactive) for admin management
// @access  Admin only
// NOTE: This route MUST be defined before /:id to avoid Express matching "admin" as an :id param
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

    // First: create all in-app notifications (fast, no rate limit)
    const notificationMap = new Map();
    for (const user of users) {
      try {
        const notification = await Notification.createNotification({
          userId: user._id,
          type: 'admin_broadcast',
          title: broadcast.title,
          message: broadcast.message,
          link: broadcast.link,
          data: { broadcastBy: req.user._id, broadcastId: broadcast._id.toString() }
        }, false);
        if (notification) {
          sentCount++;
          notificationMap.set(user._id.toString(), notification);
        }
      } catch (e) {
        console.error(`[Broadcast] Notification failed for user ${user._id}:`, e.message);
      }
    }

    // Second: send emails with rate-limit pacing
    // Respond to admin immediately, send emails in background
    broadcast.sentCount = sentCount;
    await broadcast.save();

    sendResponse(res, 201, {
      message: `Broadcast sent to ${sentCount} users. Emails are being delivered...`,
      broadcast
    });

    // Background email sending (after response)
    (async () => {
      let emailCount = 0;
      for (let i = 0; i < users.length; i++) {
        const user = users[i];
        if (!user.email) continue;

        // Pause before hitting rate limit
        if (emailCount > 0 && emailCount % EMAIL_BATCH_SIZE === 0) {
          await delay(EMAIL_BATCH_DELAY_MS);
        }

        try {
          await sendNotificationEmail({
            toEmail: user.email,
            title: broadcast.title,
            message: broadcast.message,
            link: broadcast.link || null,
            actionLabel: 'View Announcement'
          });
          emailCount++;
          const notif = notificationMap.get(user._id.toString());
          if (notif) {
            notif.emailSent = true;
            await notif.save();
          }
        } catch (emailErr) {
          console.error(`[Broadcast] Email failed for ${user.email}:`, emailErr.message);
          // If rate limited, wait and retry once
          if (emailErr.message && emailErr.message.includes('rate limit')) {
            await delay(EMAIL_BATCH_DELAY_MS);
            try {
              await sendNotificationEmail({
                toEmail: user.email,
                title: broadcast.title,
                message: broadcast.message,
                link: broadcast.link || null,
                actionLabel: 'View Announcement'
              });
              emailCount++;
              const notif = notificationMap.get(user._id.toString());
              if (notif) {
                notif.emailSent = true;
                await notif.save();
              }
            } catch (retryErr) {
              console.error(`[Broadcast] Email retry failed for ${user.email}:`, retryErr.message);
            }
          }
        }
      }

      // Update final email count
      broadcast.emailsSent = emailCount;
      await broadcast.save();
      console.log(`[Broadcast] ${broadcast.title}: ${emailCount} emails delivered to ${sentCount} users`);
    })();
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

    const newUsers = users.filter(u => !existingSet.has(u._id.toString()));
    let sentCount = 0;

    // Create in-app notifications first
    const notificationMap = new Map();
    for (const user of newUsers) {
      try {
        const notification = await Notification.createNotification({
          userId: user._id,
          type: 'admin_broadcast',
          title: broadcast.title,
          message: broadcast.message,
          link: broadcast.link,
          data: { broadcastBy: broadcast.createdBy, broadcastId: broadcast._id.toString() }
        }, false);
        if (notification) {
          sentCount++;
          notificationMap.set(user._id.toString(), notification);
        }
      } catch (e) {
        console.error(`[Broadcast Resend] Notification failed for user ${user._id}:`, e.message);
      }
    }

    broadcast.sentCount += sentCount;
    await broadcast.save();

    sendResponse(res, 200, {
      message: `Resent to ${sentCount} new users. Emails are being delivered...`,
      broadcast
    });

    // Background email sending
    (async () => {
      let emailCount = 0;
      for (let i = 0; i < newUsers.length; i++) {
        const user = newUsers[i];
        if (!user.email) continue;

        if (emailCount > 0 && emailCount % EMAIL_BATCH_SIZE === 0) {
          await delay(EMAIL_BATCH_DELAY_MS);
        }

        try {
          await sendNotificationEmail({
            toEmail: user.email,
            title: broadcast.title,
            message: broadcast.message,
            link: broadcast.link || null,
            actionLabel: 'View Announcement'
          });
          emailCount++;
          const notif = notificationMap.get(user._id.toString());
          if (notif) {
            notif.emailSent = true;
            await notif.save();
          }
        } catch (emailErr) {
          console.error(`[Broadcast Resend] Email failed for ${user.email}:`, emailErr.message);
          if (emailErr.message && emailErr.message.includes('rate limit')) {
            await delay(EMAIL_BATCH_DELAY_MS);
            try {
              await sendNotificationEmail({
                toEmail: user.email,
                title: broadcast.title,
                message: broadcast.message,
                link: broadcast.link || null,
                actionLabel: 'View Announcement'
              });
              emailCount++;
              const notif = notificationMap.get(user._id.toString());
              if (notif) {
                notif.emailSent = true;
                await notif.save();
              }
            } catch (retryErr) {
              console.error(`[Broadcast Resend] Email retry failed for ${user.email}:`, retryErr.message);
            }
          }
        }
      }

      broadcast.emailsSent += emailCount;
      await broadcast.save();
      console.log(`[Broadcast Resend] ${broadcast.title}: ${emailCount} emails delivered to ${sentCount} users`);
    })();
  } catch (error) {
    errorResponse(res, error);
  }
});

module.exports = router;
