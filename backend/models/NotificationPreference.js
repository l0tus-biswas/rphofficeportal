const mongoose = require('mongoose');

const notificationPreferenceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  // Map of notification type → channel preferences
  // e.g. { "recruit_added": { inApp: true, email: false }, ... }
  preferences: {
    type: Map,
    of: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: true }
    },
    default: new Map()
  },
  // Global mute — disables ALL email notifications (inApp still works)
  muteAllEmails: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Static: get preferences for a user, creating defaults if not found
notificationPreferenceSchema.statics.getForUser = async function(userId) {
  let prefs = await this.findOne({ userId });
  if (!prefs) {
    prefs = await this.create({ userId });
  }
  return prefs;
};

// Static: check if a notification type + channel is enabled for a user
notificationPreferenceSchema.statics.isEnabled = async function(userId, type, channel = 'inApp') {
  const prefs = await this.findOne({ userId }).lean();
  if (!prefs) return true; // Default: everything enabled

  if (channel === 'email' && prefs.muteAllEmails) return false;

  const typePref = prefs.preferences && prefs.preferences[type];
  if (!typePref) return true; // If no explicit preference, default to enabled

  return typePref[channel] !== false;
};

const NotificationPreference = mongoose.model('NotificationPreference', notificationPreferenceSchema);

module.exports = NotificationPreference;
