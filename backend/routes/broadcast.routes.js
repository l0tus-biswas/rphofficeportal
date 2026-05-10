const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');
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

// Configure multer for broadcast image uploads
const imageStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/broadcast-images');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `broadcast-img-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const uploadBroadcastImage = multer({
  storage: imageStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|jpg|png|gif|webp)$/.test(file.mimetype)) {
      return cb(null, true);
    }
    cb(new Error('Only image files (JPEG, PNG, GIF, WebP) are allowed'));
  }
});

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

// @route   GET /api/broadcasts/unread-count
// @desc    Get count of unread broadcasts for current user
// @access  Private
router.get('/unread-count', async (req, res) => {
  try {
    const query = { isActive: true };
    query.$or = [
      { targetRoles: { $size: 0 } },
      { targetRoles: req.user.role }
    ];

    const broadcasts = await Broadcast.find(query).select('_id').lean();
    const broadcastIds = broadcasts.map(b => b._id.toString());

    const readNotifications = await Notification.find({
      userId: req.user._id,
      type: 'admin_broadcast',
      'data.broadcastId': { $in: broadcastIds },
      isRead: true
    }).select('data.broadcastId').lean();

    const readSet = new Set(readNotifications.map(n => n.data?.broadcastId?.toString()));
    const unreadCount = broadcastIds.filter(id => !readSet.has(id)).length;

    sendResponse(res, 200, { unreadCount });
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

    // Respond to admin immediately.
    // Emails and real-time socket popup are sent from POST /:id/notify,
    // which is called after image upload completes.
    broadcast.sentCount = sentCount;
    broadcast.emailsSent = 0;
    await broadcast.save();

    sendResponse(res, 201, {
      message: `Broadcast created for ${sentCount} users. Delivery starts when notify is triggered.`,
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

// @route   POST /api/broadcasts/:id/image
// @desc    Upload or replace broadcast image
// @access  Admin only
router.post('/:id/image', authorize('admin'), uploadBroadcastImage.single('image'), async (req, res) => {
  try {
    const broadcast = await Broadcast.findById(req.params.id);
    if (!broadcast) {
      return sendResponse(res, 404, { message: 'Broadcast not found' });
    }
    if (!req.file) {
      return sendResponse(res, 400, { message: 'No image file provided' });
    }
    // Delete old image if exists
    if (broadcast.image) {
      const oldPath = path.join(__dirname, '..', broadcast.image);
      try { await fs.unlink(oldPath); } catch (e) { /* ignore */ }
    }
    broadcast.image = `/uploads/broadcast-images/${req.file.filename}`;
    await broadcast.save();
    sendResponse(res, 200, { message: 'Image uploaded', broadcast });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   DELETE /api/broadcasts/:id/image
// @desc    Remove broadcast image
// @access  Admin only
router.delete('/:id/image', authorize('admin'), async (req, res) => {
  try {
    const broadcast = await Broadcast.findById(req.params.id);
    if (!broadcast) {
      return sendResponse(res, 404, { message: 'Broadcast not found' });
    }
    if (broadcast.image) {
      const oldPath = path.join(__dirname, '..', broadcast.image);
      try { await fs.unlink(oldPath); } catch (e) { /* ignore */ }
      broadcast.image = null;
      await broadcast.save();
    }
    sendResponse(res, 200, { message: 'Image removed', broadcast });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/broadcasts/:id/notify
// @desc    Emit socket event for this broadcast (called after image upload completes)
// @access  Admin only
router.post('/:id/notify', authorize('admin'), async (req, res) => {
  try {
    const broadcast = await Broadcast.findById(req.params.id)
      .populate('createdBy', 'name')
      .lean();
    if (!broadcast) {
      return sendResponse(res, 404, { message: 'Broadcast not found' });
    }

    const filter = { isActive: true };
    if (broadcast.targetRoles && broadcast.targetRoles.length > 0) {
      filter.role = { $in: broadcast.targetRoles };
    }
    const users = await User.find(filter).select('_id email').lean();

    const enrichedBroadcast = {
      ...broadcast,
      postedBy: broadcast.createdBy?.name || req.user.name || 'Admin'
    };

    const io = req.app.locals.io;
    if (io) {
      users.forEach(user => {
        io.to(`user:${user._id.toString()}`).emit('new_broadcast', enrichedBroadcast);
      });
      console.log(`[Broadcast] Socket notified ${users.length} users for: ${broadcast.title}`);
    }

    sendResponse(res, 200, { message: `Notified ${users.length} users. Emails are being delivered...` });

    // Background email sending with current broadcast data (includes image if uploaded)
    (async () => {
      const userIds = users.map(u => u._id);
      const existingNotifications = await Notification.find({
        type: 'admin_broadcast',
        'data.broadcastId': broadcast._id.toString(),
        userId: { $in: userIds }
      }).select('_id userId emailSent');

      const notificationMap = new Map();
      existingNotifications.forEach(n => notificationMap.set(n.userId.toString(), n));

      let emailCount = 0;

      for (let i = 0; i < users.length; i++) {
        const user = users[i];
        const notif = notificationMap.get(user._id.toString());

        if (!user.email || !notif || notif.emailSent) continue;

        if (emailCount > 0 && emailCount % EMAIL_BATCH_SIZE === 0) {
          await delay(EMAIL_BATCH_DELAY_MS);
        }

        try {
          await sendNotificationEmail({
            toEmail: user.email,
            title: broadcast.title,
            message: broadcast.message,
            link: broadcast.link || '/broadcasts',
            imageUrl: broadcast.image || null,
            actionLabel: 'View Announcement'
          });
          emailCount++;
          notif.emailSent = true;
          await notif.save();
        } catch (emailErr) {
          console.error(`[Broadcast Notify] Email failed for ${user.email}:`, emailErr.message);
          if (emailErr.message && emailErr.message.includes('rate limit')) {
            await delay(EMAIL_BATCH_DELAY_MS);
            try {
              await sendNotificationEmail({
                toEmail: user.email,
                title: broadcast.title,
                message: broadcast.message,
                link: broadcast.link || '/broadcasts',
                imageUrl: broadcast.image || null,
                actionLabel: 'View Announcement'
              });
              emailCount++;
              notif.emailSent = true;
              await notif.save();
            } catch (retryErr) {
              console.error(`[Broadcast Notify] Email retry failed for ${user.email}:`, retryErr.message);
            }
          }
        }
      }

      if (emailCount > 0) {
        await Broadcast.findByIdAndUpdate(broadcast._id, { $inc: { emailsSent: emailCount } });
      }
      console.log(`[Broadcast Notify] ${broadcast.title}: ${emailCount} emails delivered`);
    })();
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

    // Emit Socket.IO event to new users for real-time popup
    const enrichedBroadcast = {
      ...broadcast.toObject(),
      postedBy: broadcast.createdBy?.name || 'Admin'
    };

    newUsers.forEach(user => {
      const io = req.app.locals.io;
      if (io) {
        io.to(`user:${user._id.toString()}`).emit('new_broadcast', enrichedBroadcast);
      }
    });

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
            link: broadcast.link || '/broadcasts',
            imageUrl: broadcast.image || null,
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
                link: broadcast.link || '/broadcasts',
                imageUrl: broadcast.image || null,
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
