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
      'recruit_added',
      'downline_recruit',
      'payment_completed',
      'payment_failed',
      'apa_approved',
      'apa_rejected',
      'onboarding_approved',
      'onboarding_rejected',
      'license_submitted',
      'license_approved',
      'production_submitted',
      'training_completed',
      'system_announcement'
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
  }
});

// Index for efficient queries
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

// Static method to create and optionally send email
notificationSchema.statics.createNotification = async function(data, sendEmail = true) {
  const notification = await this.create(data);
  
  if (sendEmail) {
    try {
      const User = mongoose.model('User');
      const user = await User.findById(data.userId);
      
      if (user && user.email) {
        const { sendEmail: sendEmailUtil } = require('../utils/email');
        await sendEmailUtil(
          user.email,
          data.title,
          `
            <h2>${data.title}</h2>
            <p>${data.message}</p>
            ${data.link ? `<p><a href="${process.env.FRONTEND_URL}${data.link}" style="display: inline-block; padding: 10px 20px; background: #0d6efd; color: white; text-decoration: none; border-radius: 5px;">View Details</a></p>` : ''}
            <p style="margin-top: 20px; color: #666; font-size: 12px;">You received this email because you are a member of ${process.env.APP_NAME || 'RHP Office'}.</p>
          `
        );
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
