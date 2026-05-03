const mongoose = require('mongoose');

const courseProgressSchema = new mongoose.Schema({
  courseId: {
    type: String,
    required: true
  },
  courseName: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['not_started', 'in_progress', 'completed', 'failed'],
    default: 'not_started'
  },
  percentComplete: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  startedDate: Date,
  completedDate: Date,
  lastAccessedDate: Date,
  score: {
    type: Number,
    default: null
  },
  passingScore: {
    type: Number,
    default: null
  },
  passed: {
    type: Boolean,
    default: false
  },
  timeSpentMinutes: {
    type: Number,
    default: 0
  },
  // Individual chapter/module tracking
  modules: [{
    moduleId: String,
    moduleName: String,
    status: {
      type: String,
      enum: ['not_started', 'in_progress', 'completed'],
      default: 'not_started'
    },
    percentComplete: {
      type: Number,
      default: 0
    },
    completedDate: Date
  }]
}, { _id: false });

const examFXProgressSchema = new mongoose.Schema({
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  // ExamFX external user ID for API lookups
  examfxUserId: {
    type: String,
    default: null,
    sparse: true
  },
  // ExamFX email (may differ from system email)
  examfxEmail: {
    type: String,
    default: null
  },
  // Overall enrollment status
  enrollmentStatus: {
    type: String,
    enum: ['not_enrolled', 'enrolled', 'active', 'completed', 'expired'],
    default: 'not_enrolled'
  },
  enrollmentDate: Date,
  // Overall progress across all courses
  overallPercentComplete: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  // Individual course progress
  courses: [courseProgressSchema],
  // Practice exam tracking
  practiceExams: [{
    examName: String,
    dateTaken: Date,
    score: Number,
    passingScore: Number,
    passed: Boolean,
    timeSpentMinutes: Number
  }],
  // Sync metadata
  lastSyncDate: {
    type: Date,
    default: null
  },
  lastSyncStatus: {
    type: String,
    enum: ['success', 'failed', 'pending', 'never'],
    default: 'never'
  },
  lastSyncError: {
    type: String,
    default: null
  },
  // Manual override flag (admin can manually update if API is unavailable)
  manualOverride: {
    type: Boolean,
    default: false
  },
  // Admin notes
  adminNotes: {
    type: String,
    default: ''
  },
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

// Virtual: is course work complete?
examFXProgressSchema.virtual('isComplete').get(function () {
  if (this.courses.length === 0) return false;
  return this.courses.every(c => c.status === 'completed' && c.passed);
});

// Virtual: summary stats
examFXProgressSchema.virtual('stats').get(function () {
  const total = this.courses.length;
  const completed = this.courses.filter(c => c.status === 'completed').length;
  const inProgress = this.courses.filter(c => c.status === 'in_progress').length;
  const notStarted = this.courses.filter(c => c.status === 'not_started').length;
  const failed = this.courses.filter(c => c.status === 'failed').length;
  return { total, completed, inProgress, notStarted, failed };
});

examFXProgressSchema.set('toJSON', { virtuals: true });
examFXProgressSchema.set('toObject', { virtuals: true });

// Index for efficient lookups
examFXProgressSchema.index({ examfxEmail: 1 });

module.exports = mongoose.model('ExamFXProgress', examFXProgressSchema);
