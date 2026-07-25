const mongoose = require('mongoose');

const licensingProgressSchema = new mongoose.Schema({
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  
  // Countdown timer
  enrollmentDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  licensingDeadline: {
    type: Date,
    required: true
  },
  licenseObtainedDate: {
    type: Date,
    default: null
  },
  isLicensed: {
    type: Boolean,
    default: false
  },
  
  // Checklist items
  checklist: {
    // 1. Pre-license course completion
    preLicenseCourse: {
      completed: {
        type: Boolean,
        default: false
      },
      completedDate: Date,
      documents: [{
        filename: String,
        url: String,
        uploadedAt: Date,
        uploadedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        }
      }],
      notes: String
    },
    
    // 2. State exam scheduling
    stateExam: {
      scheduled: {
        type: Boolean,
        default: false
      },
      attempts: {
        type: Number,
        default: 0
      },
      scheduledDate: Date,
      // History of every scheduled/rescheduled attempt
      scheduleHistory: [{
        date: Date,
        outcome: {
          type: String,
          enum: ['Scheduled', 'Passed', 'Failed', 'No-show', 'Rescheduled', 'Cancelled'],
          default: 'Scheduled'
        },
        notes: String,
        recordedAt: { type: Date, default: Date.now },
        recordedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        }
      }],
      documents: [{
        filename: String,
        url: String,
        uploadedAt: Date,
        uploadedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        }
      }],
      notes: String
    },

    // 3. Fingerprinting appointment scheduled
    fingerprinting: {
      scheduled: {
        type: Boolean,
        default: false
      },
      attempts: {
        type: Number,
        default: 0
      },
      appointmentDate: Date,
      // History of every scheduled/rescheduled appointment
      scheduleHistory: [{
        date: Date,
        outcome: {
          type: String,
          enum: ['Scheduled', 'Completed', 'No-show', 'Rescheduled', 'Cancelled'],
          default: 'Scheduled'
        },
        notes: String,
        recordedAt: { type: Date, default: Date.now },
        recordedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        }
      }],
      documents: [{
        filename: String,
        url: String,
        uploadedAt: Date,
        uploadedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        }
      }],
      notes: String
    },
    
    // 4. License application submitted via DICE
    diceApplication: {
      submitted: {
        type: Boolean,
        default: false
      },
      submittedDate: Date,
      documents: [{
        filename: String,
        url: String,
        uploadedAt: Date,
        uploadedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        }
      }],
      notes: String
    },
    
    // 5. State appointment approved
    stateAppointment: {
      approved: {
        type: Boolean,
        default: false
      },
      approvedDate: Date,
      documents: [{
        filename: String,
        url: String,
        uploadedAt: Date,
        uploadedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        }
      }],
      notes: String
    }
  },
  
  // Admin notes
  adminNotes: {
    type: String,
    default: ''
  },
  
  // Track who last updated
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
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
}, {
  timestamps: true
});

// Virtual for days remaining
licensingProgressSchema.virtual('daysRemaining').get(function() {
  if (this.isLicensed) return 0;
  
  const now = new Date();
  const deadline = new Date(this.licensingDeadline);
  const diffTime = deadline - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays > 0 ? diffDays : 0;
});

// Virtual for checklist completion percentage
licensingProgressSchema.virtual('completionPercentage').get(function() {
  const items = [
    this.checklist.preLicenseCourse.completed,
    this.checklist.stateExam.scheduled,
    this.checklist.fingerprinting.scheduled,
    this.checklist.diceApplication.submitted,
    this.checklist.stateAppointment.approved
  ];
  
  const completed = items.filter(Boolean).length;
  return Math.round((completed / items.length) * 100);
});

// Ensure virtuals are included in JSON
licensingProgressSchema.set('toJSON', { virtuals: true });
licensingProgressSchema.set('toObject', { virtuals: true });

// Pre-save hook to set deadline (30 days from enrollment)
licensingProgressSchema.pre('save', function(next) {
  if (this.isNew && !this.licensingDeadline) {
    const deadline = new Date(this.enrollmentDate);
    deadline.setDate(deadline.getDate() + 30);
    this.licensingDeadline = deadline;
  }
  next();
});

module.exports = mongoose.model('LicensingProgress', licensingProgressSchema);
