const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: [
      // Activity
      'login',
      'profile_updated',
      'password_changed',
      'password_reset',
      // Recruitment
      'recruit_added',
      'downline_recruit',
      // Payments
      'payment_completed',
      'payment_failed',
      'subscription_updated',
      'subscription_canceled',
      // APA
      'apa_submitted',
      'apa_approved',
      'apa_rejected',
      // Onboarding
      'onboarding_submitted',
      'onboarding_step_updated',
      'onboarding_approved',
      'onboarding_rejected',
      // Licensing
      'license_submitted',
      'license_approved',
      // ExamFX
      'examfx_enrolled',
      'examfx_progress_updated',
      'examfx_course_completed',
      'examfx_program_completed',
      // Production
      'production_submitted',
      'production_reviewed',
      // Training
      'training_completed',
      // Admin actions
      'user_created',
      'user_activated',
      'user_deactivated',
      'user_promoted',
      'user_transferred',
      // Misc
      'system_announcement',
      'promotion_eligible',
      // Carrier
      'carrier_contract_requested',
      'carrier_appointed',
      'carrier_unappointed',
      // Document Hub
      'document_request',
      'document_submitted',
      'document_reviewed',
      // New agent / registration
      'new_agent_registered',
      // Production lifecycle
      'production_in_force',
      // Admin broadcast
      'admin_broadcast'
    ],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  isRead: {
    type: Boolean,
    default: false
  },
  link: {
    type: String,
    default: null
  },
  emailSent: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  deletedAt: {
    type: Date,
    default: null
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
});

// Index for efficient queries
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

// Static method to create and optionally send email (respects user preferences)
notificationSchema.statics.createNotification = async function(data, sendEmail = true) {
  const NotificationPreference = mongoose.model('NotificationPreference');

  // Check if inApp is enabled for this user+type
  const inAppEnabled = await NotificationPreference.isEnabled(data.userId, data.type, 'inApp');
  if (!inAppEnabled) {
    return null; // User opted out of this notification type entirely
  }

  const notification = await this.create(data);
  
  if (sendEmail) {
    // Check if email channel is enabled for this user+type
    const emailEnabled = await NotificationPreference.isEnabled(data.userId, data.type, 'email');
    if (!emailEnabled) return notification;

    try {
      const User = mongoose.model('User');
      const user = await User.findById(data.userId);
      
      if (user && user.email) {
        const { sendNotificationEmail } = require('../utils/neuzmail');
        await sendNotificationEmail({
          toEmail: user.email,
          title: data.title,
          message: data.message,
          link: data.link || null
        });
        notification.emailSent = true;
        await notification.save();
      }
    } catch (error) {
      console.error('Error sending notification email:', error);
    }
  }
  
  return notification;
};

// Static method to notify upline chain
notificationSchema.statics.notifyUplineChain = async function(userId, type, title, message, data = {}, levels = 3) {
  const User = mongoose.model('User');
  const user = await User.findById(userId);
  
  if (!user || !user.referredBy) return;
  
  let currentUser = user;
  let level = 1;
  
  while (currentUser.referredBy && level <= levels) {
    const upline = await User.findById(currentUser.referredBy);
    if (!upline) break;
    
    await this.createNotification({
      userId: upline._id,
      type,
      title: `${title} (Level ${level})`,
      message: message.replace('{agentName}', user.name),
      data: { ...data, downlineLevel: level, downlineId: user._id },
      link: data.link || '/downline'
    });
    
    currentUser = upline;
    level++;
  }
};

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
