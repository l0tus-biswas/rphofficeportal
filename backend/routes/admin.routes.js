const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Onboarding = require('../models/Onboarding');
const AuditLog = require('../models/AuditLog');
const Payment = require('../models/Payment');
const Subscription = require('../models/Subscription');
const APAApplication = require('../models/APAApplication');
const Notification = require('../models/Notification');
const LicensingProgress = require('../models/LicensingProgress');
const ProductionSubmission = require('../models/ProductionSubmission');
const { protect, authorize } = require('../middleware/auth.middleware');
const { validateRequest, schemas } = require('../middleware/validation.middleware');
const { logAction } = require('../middleware/audit.middleware');
const { sendWelcomeEmail } = require('../utils/neuzmail');
const { generatePassword, sendResponse, errorResponse, paginate } = require('../utils/helpers');
const { cancelSubscription } = require('../utils/stripe');
const ACAClientRecord = require('../models/ACAClientRecord');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { ONBOARDING_ROOT } = require('../utils/storage');

// Multer config for welcome message media uploads (image/PDF)
const welcomeMediaStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads/welcome');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `welcome-${file.fieldname}-${uniqueSuffix}${ext}`);
  }
});

const welcomeMediaUpload = multer({
  storage: welcomeMediaStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: function (req, file, cb) {
    if (file.fieldname === 'image') {
      const allowedTypes = /jpeg|jpg|png|gif|webp/;
      const extOk = allowedTypes.test(path.extname(file.originalname).toLowerCase());
      const mimeOk = allowedTypes.test(file.mimetype);
      if (mimeOk && extOk) return cb(null, true);
      return cb(new Error('Only image files (jpg, png, gif, webp) are allowed'));
    }
    if (file.fieldname === 'pdf') {
      if (file.mimetype === 'application/pdf') return cb(null, true);
      return cb(new Error('Only PDF files are allowed'));
    }
    cb(new Error('Unexpected field'));
  }
});

const SystemConfig = require('../models/SystemConfig');

// All routes require admin authentication
router.use(protect);
router.use(authorize('admin'));

// @route   GET /api/admin/hierarchy
// @desc    Get full user hierarchy with licensing status and counts
// @access  Private (Admin only)
router.get('/hierarchy', async (req, res) => {
  try {
    const hierarchy = await User.getFullHierarchy();
    
    // Fetch all licensing records to enrich hierarchy nodes
    const allLicensing = await LicensingProgress.find({}).select('agent isLicensed').lean();
    const licensingMap = {};
    allLicensing.forEach(lp => {
      licensingMap[String(lp.agent)] = lp.isLicensed;
    });

    // Recursively enrich nodes with licensing info and compute counts
    let totalUsers = 0, totalAdmins = 0, totalAgents = 0, totalLicensed = 0, totalUnlicensed = 0;
    const enrichNodes = (nodes) => {
      nodes.forEach(node => {
        totalUsers++;
        const nodeId = String(node._id);
        node.isLicensed = licensingMap[nodeId] || false;
        if (node.role === 'admin') {
          totalAdmins++;
        } else {
          totalAgents++;
          if (node.isLicensed) {
            totalLicensed++;
          } else {
            totalUnlicensed++;
          }
        }
        if (node.children && node.children.length > 0) {
          enrichNodes(node.children);
        }
      });
    };
    enrichNodes(hierarchy);
    
    sendResponse(res, 200, {
      hierarchy,
      counts: {
        totalUsers,
        totalAdmins,
        totalAgents,
        totalLicensed,
        totalUnlicensed
      }
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/admin/users
// @desc    Get all users with filters and pagination
// @access  Private (Admin only)
router.get('/users', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const role = req.query.role;
    const isActive = req.query.isActive;
    const search = req.query.search;
    const includeDeleted = req.query.includeDeleted === 'true';
    
    const filter = {};
    if (!includeDeleted) filter.deletedAt = null;
    if (role) filter.role = role;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }
    
    const query = User.find(filter)
      .select('-password')
      .populate('referredBy', 'name email referralCode')
      .sort('-createdAt');
    
    const users = await paginate(query, page, limit);
    const total = await User.countDocuments(filter);
    
    sendResponse(res, 200, {
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/admin/users/:userId
// @desc    Get single user details
// @access  Private (Admin only)
router.get('/users/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('-password')
      .populate('referredBy', 'name email referralCode')
      .populate('children', 'name email role isActive createdAt');
    
    if (!user) {
      return sendResponse(res, 404, { message: 'User not found' });
    }
    
    // Get user's downline tree
    const downline = await user.getDownlineTree();
    
    sendResponse(res, 200, {
      user,
      downline
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/admin/users
// @desc    Create new user (admin/agent/recruit)
// @access  Private (Admin only)
router.post('/users', validateRequest(schemas.createUser), logAction('CREATE_USER'), async (req, res) => {
  try {
    const { name, email, phone, role, password } = req.body;
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return sendResponse(res, 400, { message: 'Email already exists' });
    }
    
    const userPassword = password || generatePassword(10);
    
    const newUser = await User.create({
      name,
      email,
      phone,
      role,
      password: userPassword,
      isActive: true,
      createdBy: req.user._id
    });
    
    // Send welcome email
    try {
      await sendWelcomeEmail(newUser, userPassword, null);
    } catch (emailError) {
      console.error('Email failed:', emailError);
    }

    // Notify the new user
    Notification.createNotification({
      userId: newUser._id,
      type: 'user_created',
      title: 'Welcome to ' + (process.env.APP_NAME || 'RHP Office'),
      message: `Your account has been created by an administrator. Welcome, ${newUser.name}!`,
      link: '/dashboard'
    }, false).catch(() => {});
    
    sendResponse(res, 201, {
      message: 'User created successfully',
      user: await User.findById(newUser._id).select('-password')
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   PUT /api/admin/users/:userId
// @desc    Update user details
// @access  Private (Admin only)
router.put('/users/:userId', validateRequest(schemas.updateUser), logAction('UPDATE_USER'), async (req, res) => {
  try {
    const { name, phone, role, isActive } = req.body;
    
    const user = await User.findById(req.params.userId);
    
    if (!user) {
      return sendResponse(res, 404, { message: 'User not found' });
    }
    
    if (name) user.name = name;
    if (phone) user.phone = phone;
    if (role) user.role = role;
    if (isActive !== undefined) user.isActive = isActive;
    
    user.updatedBy = req.user._id;
    await user.save();
    
    sendResponse(res, 200, {
      message: 'User updated successfully',
      user: await User.findById(user._id).select('-password')
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   PUT /api/admin/users/:userId/billing-exempt
// @desc    Set or clear billing exempt status for a user
// @access  Private (Admin only)
router.put('/users/:userId/billing-exempt', logAction('SET_BILLING_EXEMPT'), async (req, res) => {
  try {
    const { exempt, reason } = req.body;
    const user = await User.findById(req.params.userId);

    if (!user) {
      return sendResponse(res, 404, { message: 'User not found' });
    }

    user.billingExempt = !!exempt;
    user.billingExemptReason = exempt ? (reason || null) : null;
    user.billingExemptSetBy = req.user._id;
    user.billingExemptSetAt = new Date();

    // If exempting, also grant payment access so they can use the platform
    if (exempt) {
      user.paymentAccessEnabled = true;
    }

    await user.save();

    sendResponse(res, 200, {
      message: exempt ? 'User marked as billing exempt' : 'Billing exempt status removed',
      user: await User.findById(user._id).select('-password')
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   PUT /api/admin/users/:userId/activate
// @desc    Activate user
// @access  Private (Admin only)
router.put('/users/:userId/activate', logAction('ACTIVATE_USER'), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    
    if (!user) {
      return sendResponse(res, 404, { message: 'User not found' });
    }
    
    user.isActive = true;
    user.updatedBy = req.user._id;
    await user.save();

    Notification.createNotification({
      userId: user._id,
      type: 'user_activated',
      title: 'Account Activated',
      message: 'Your account has been activated by an administrator. You now have full access.',
      link: '/dashboard'
    }, false).catch(() => {});
    
    sendResponse(res, 200, {
      message: 'User activated successfully',
      user: await User.findById(user._id).select('-password')
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   PUT /api/admin/users/:userId/deactivate
// @desc    Deactivate user
// @access  Private (Admin only)
router.put('/users/:userId/deactivate', logAction('DEACTIVATE_USER'), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    
    if (!user) {
      return sendResponse(res, 404, { message: 'User not found' });
    }
    
    user.isActive = false;
    user.paymentAccessEnabled = false;
    user.updatedBy = req.user._id;

    // Cancel Stripe subscription if exists
    const subscription = await Subscription.findOne({ user: req.params.userId });
    if (subscription?.stripeSubscriptionId) {
      try {
        await cancelSubscription(subscription.stripeSubscriptionId);
        user.subscriptionStatus = 'canceled';
        subscription.status = 'canceled';
        subscription.canceledAt = new Date();
        await subscription.save();
        console.log(`Cancelled Stripe subscription for deactivated user ${req.params.userId}`);
      } catch (stripeError) {
        console.warn(`Failed to cancel Stripe subscription on deactivation: ${stripeError.message}`);
      }
    }

    await user.save();

    Notification.createNotification({
      userId: user._id,
      type: 'user_deactivated',
      title: 'Account Deactivated',
      message: 'Your account has been deactivated by an administrator. Your subscription has been canceled. Please contact support if you have questions.',
      link: '/dashboard'
    }, false).catch(() => {});
    
    sendResponse(res, 200, {
      message: 'User deactivated successfully. Subscription canceled.',
      user: await User.findById(user._id).select('-password')
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   PUT /api/admin/users/:userId/promote
// @desc    Promote/demote agent to new level
// @access  Private (Admin only)
router.put('/users/:userId/promote', logAction('PROMOTE_AGENT'), async (req, res) => {
  try {
    const { level } = req.body;
    
    // Dynamically load valid levels from the PromotionLevel collection
    const PromotionLevel = require('../models/PromotionLevel');
    const allLevels = await PromotionLevel.find({ isActive: true }).select('name').lean();
    const validLevels = allLevels.map(l => l.name.toLowerCase());
    
    if (!level || !validLevels.includes(level.toLowerCase())) {
      return sendResponse(res, 400, { 
        message: 'Invalid level. Must be one of: ' + validLevels.join(', ') 
      });
    }
    
    const user = await User.findById(req.params.userId);
    
    if (!user) {
      return sendResponse(res, 404, { message: 'User not found' });
    }
    
    if (user.role !== 'agent') {
      return sendResponse(res, 400, { message: 'Can only promote/demote agents' });
    }
    
    const oldLevel = user.level;
    user.level = level;
    user.promotedAt = Date.now();
    user.promotedBy = req.user._id;
    await user.save();

    Notification.createNotification({
      userId: user._id,
      type: 'user_promoted',
      title: 'Level Updated',
      message: `Your agent level has been changed from "${oldLevel}" to "${level}" by an administrator.`,
      link: '/profile'
    }, false).catch(() => {});
    
    sendResponse(res, 200, {
      message: `Agent level changed from ${oldLevel} to ${level}`,
      user: await User.findById(user._id).select('-password').populate('promotedBy', 'name')
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   DELETE /api/admin/users/:userId
// @desc    Soft-delete user with cascading soft-delete of all associated data (transactional)
// @access  Private (Admin only)
router.delete('/users/:userId', logAction('DELETE_USER'), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    
    if (!user) {
      return sendResponse(res, 404, { message: 'User not found' });
    }
    
    if (user.deletedAt) {
      return sendResponse(res, 400, { message: 'User is already deleted' });
    }
    
    // Prevent deleting yourself
    if (user._id.toString() === req.user._id.toString()) {
      return sendResponse(res, 400, { message: 'Cannot delete your own account' });
    }
    
    const result = await user.softDelete(req.user._id);
    
    console.log(`User ${req.params.userId} (${user.email}) soft-deleted by admin ${req.user._id} at ${result.deletedAt}`);
    
    sendResponse(res, 200, {
      message: 'User and all related records soft-deleted successfully. Can be restored within retention period.',
      deletedAt: result.deletedAt,
      userId: req.params.userId
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   PUT /api/admin/users/:userId/restore
// @desc    Restore a soft-deleted user and all associated data (transactional)
// @access  Private (Admin only)
router.put('/users/:userId/restore', logAction('RESTORE_USER'), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    
    if (!user) {
      return sendResponse(res, 404, { message: 'User not found' });
    }
    
    if (!user.deletedAt) {
      return sendResponse(res, 400, { message: 'User is not deleted' });
    }
    
    await user.restore(req.user._id);
    
    console.log(`User ${req.params.userId} (${user.email}) restored by admin ${req.user._id}`);
    
    const restoredUser = await User.findById(req.params.userId).select('-password');
    
    sendResponse(res, 200, {
      message: 'User and all related records restored successfully',
      user: restoredUser
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   DELETE /api/admin/users/:userId/permanent
// @desc    Permanently delete a soft-deleted user (hard delete) — requires user to be soft-deleted first
// @access  Private (Admin only)
router.delete('/users/:userId/permanent', logAction('PERMANENT_DELETE_USER'), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    
    if (!user) {
      return sendResponse(res, 404, { message: 'User not found' });
    }
    
    if (!user.deletedAt) {
      return sendResponse(res, 400, { 
        message: 'User must be soft-deleted first before permanent deletion. Use DELETE /api/admin/users/:userId first.' 
      });
    }
    
    const userId = req.params.userId;
    const userEmail = user.email;
    
    // Cancel Stripe subscription if still active
    const subscription = await Subscription.findOne({ user: userId });
    if (subscription?.stripeSubscriptionId) {
      try {
        await cancelSubscription(subscription.stripeSubscriptionId);
      } catch (stripeError) {
        console.warn(`Failed to cancel Stripe subscription: ${stripeError.message}`);
      }
    }
    
    // Delete APA Application files from disk
    const apaApplications = await APAApplication.find({ 
      $or: [
        { userId: userId },
        { 'personalInfo.email': userEmail?.toLowerCase() }
      ]
    });
    
    for (const app of apaApplications) {
      if (app.docusign?.documentUrl) {
        const docPath = path.join(__dirname, '..', app.docusign.documentUrl);
        if (fs.existsSync(docPath)) {
          try { fs.unlinkSync(docPath); } catch (e) { console.warn(`Failed to delete APA doc: ${e.message}`); }
        }
      }
      const complianceFields = ['govtIdFront', 'govtIdBack', 'residencyProof', 'ssnProof', 'w9Form', 'directDepositForm'];
      for (const field of complianceFields) {
        if (app.complianceDocuments?.[field]?.documentUrl) {
          const docPath = path.join(__dirname, '..', app.complianceDocuments[field].documentUrl);
          if (fs.existsSync(docPath)) {
            try { fs.unlinkSync(docPath); } catch (e) { console.warn(`Failed to delete compliance doc: ${e.message}`); }
          }
        }
      }
    }
    
    // Delete onboarding files from disk
    const onboardingDir = path.join(ONBOARDING_ROOT, userId);
    if (fs.existsSync(onboardingDir)) {
      try { fs.rmSync(onboardingDir, { recursive: true, force: true }); } catch (e) { console.warn(`Failed to delete onboarding files: ${e.message}`); }
    }
    
    // Hard delete all records
    await APAApplication.deleteMany({ $or: [{ userId }, { 'personalInfo.email': userEmail?.toLowerCase() }] });
    await Onboarding.deleteMany({ user: userId });
    await Payment.deleteMany({ user: userId });
    await Subscription.deleteMany({ user: userId });
    await Notification.deleteMany({ userId: userId });
    await LicensingProgress.deleteMany({ user: userId });
    await ProductionSubmission.deleteMany({ agent: userId });
    
    // Hard delete the user
    await User.findByIdAndDelete(userId);
    
    console.log(`User ${userId} (${userEmail}) permanently deleted by admin ${req.user._id}`);
    
    sendResponse(res, 200, {
      message: 'User and all related records permanently deleted',
      deletedItems: { apaApplications: apaApplications.length, user: 1 }
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   DELETE /api/admin/onboarding/:userId
// @desc    Delete onboarding record for a user
// @access  Private (Admin only)
router.delete('/onboarding/:userId', logAction('DELETE_ONBOARDING'), async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Validate userId
    if (!userId || userId === 'null' || userId === 'undefined') {
      return sendResponse(res, 400, { message: 'Invalid user ID' });
    }
    
    // Find the onboarding record (using 'user' field, not 'userId')
    const onboarding = await Onboarding.findOne({ user: userId });
    
    if (!onboarding) {
      return sendResponse(res, 404, { message: 'Onboarding record not found' });
    }
    
    // Delete all uploaded files for this user
    const userOnboardingDir = path.join(ONBOARDING_ROOT, userId.toString());
    try {
      if (fs.existsSync(userOnboardingDir)) {
        await fs.promises.rm(userOnboardingDir, { recursive: true, force: true });
      }
    } catch (fileError) {
      console.warn(`Failed to delete onboarding files for user ${userId}:`, fileError.message);
    }
    
    // Delete the onboarding record
    await Onboarding.findByIdAndDelete(onboarding._id);
    
    // Update user's onboarding references
    await User.findByIdAndUpdate(userId, {
      $unset: {
        onboarding: 1,
        onboardingStatus: 1,
        onboardingSubmittedAt: 1,
        onboardingApprovedAt: 1
      }
    });
    
    sendResponse(res, 200, {
      message: 'Onboarding record deleted successfully. User will need to upload documents again.'
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/admin/stats
// @desc    Get admin dashboard statistics
// @access  Private (Admin only)
router.get('/stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({ deletedAt: null });
    const totalAdmins = await User.countDocuments({ role: 'admin', deletedAt: null });
    const totalAgents = await User.countDocuments({ role: 'agent', deletedAt: null });
    const activeUsers = await User.countDocuments({ isActive: true, deletedAt: null });
    const inactiveUsers = await User.countDocuments({ isActive: false, deletedAt: null });
    
    // Users created in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentUsers = await User.countDocuments({ 
      createdAt: { $gte: thirtyDaysAgo } 
    });

    // Licensed vs unlicensed agent counts (§21.5)
    const licensedCount = await LicensingProgress.countDocuments({ isLicensed: true });
    const unlicensedCount = totalAgents - licensedCount;

    // Production metrics (§22.1)
    const totalProduction = await ProductionSubmission.countDocuments();
    const productionInForce = await ProductionSubmission.countDocuments({ status: 'In Force' });
    const recentProduction = await ProductionSubmission.countDocuments({
      submissionDate: { $gte: thirtyDaysAgo }
    });
    const premiumAgg = await ProductionSubmission.aggregate([
      { $match: { status: 'In Force' } },
      { $group: { _id: null, total: { $sum: '$premiumAmount' } } }
    ]);
    const totalPremiumInForce = premiumAgg.length > 0 ? premiumAgg[0].total : 0;
    
    // --- 24-hour activity (§25.3) ---
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const newAgents24h = await User.countDocuments({ createdAt: { $gte: twentyFourHoursAgo } });
    // 24h agent breakdown: licensed vs unlicensed
    const newAgentIds24h = await User.find({ createdAt: { $gte: twentyFourHoursAgo } }).select('_id').lean();
    const newAgentIdList = newAgentIds24h.map(u => u._id);
    const newLicensedAgents24h = newAgentIdList.length > 0
      ? await LicensingProgress.countDocuments({ agent: { $in: newAgentIdList }, isLicensed: true })
      : 0;
    const newUnlicensedAgents24h = newAgents24h - newLicensedAgents24h;
    const newProduction24h = await ProductionSubmission.countDocuments({ createdAt: { $gte: twentyFourHoursAgo } });
    // 24h production breakdown: submitted vs in-force
    const newProductionSubmitted24h = await ProductionSubmission.countDocuments({ createdAt: { $gte: twentyFourHoursAgo }, status: { $ne: 'In Force' } });
    const newProductionInForce24h = await ProductionSubmission.countDocuments({ createdAt: { $gte: twentyFourHoursAgo }, status: 'In Force' });
    const newApplications24h = await APAApplication.countDocuments({ createdAt: { $gte: twentyFourHoursAgo } });
    const recentActivity = [];
    // Recent agents
    const recentAgents = await User.find({ createdAt: { $gte: twentyFourHoursAgo } })
      .select('name email role createdAt').sort({ createdAt: -1 }).limit(10).lean();
    recentAgents.forEach(a => recentActivity.push({
      type: 'new_agent', icon: 'person-plus-fill', color: 'primary',
      text: `${a.name} joined as ${a.role}`, time: a.createdAt
    }));
    // Recent production
    const recentProd = await ProductionSubmission.find({ createdAt: { $gte: twentyFourHoursAgo } })
      .populate('agent', 'name').select('agent productSold premiumAmount createdAt')
      .sort({ createdAt: -1 }).limit(10).lean();
    recentProd.forEach(p => recentActivity.push({
      type: 'production', icon: 'graph-up-arrow', color: 'success',
      text: `${p.agent?.name || 'Agent'} submitted ${p.productSold} ($${p.premiumAmount})`, time: p.createdAt
    }));
    // Recent applications
    const recentApps = await APAApplication.find({ createdAt: { $gte: twentyFourHoursAgo } })
      .select('personalInfo.firstName personalInfo.lastName status createdAt')
      .sort({ createdAt: -1 }).limit(5).lean();
    recentApps.forEach(a => recentActivity.push({
      type: 'application', icon: 'file-earmark-text-fill', color: 'info',
      text: `New APA application from ${a.personalInfo?.firstName || ''} ${a.personalInfo?.lastName || ''}`.trim(),
      time: a.createdAt
    }));
    // Sort by time descending
    recentActivity.sort((a, b) => new Date(b.time) - new Date(a.time));

    // --- ACA leaderboard (§25.4) ---
    const latestBatchArr = await ACAClientRecord.aggregate([
      { $group: { _id: null, maxBatch: { $max: '$uploadBatch' } } }
    ]);
    const latestBatch = latestBatchArr.length > 0 ? latestBatchArr[0].maxBatch : null;

    let totalACAClients = 0;
    let topPersonalACA = [];
    let topTeamACA = [];

    if (latestBatch) {
      const acaTotalAgg = await ACAClientRecord.aggregate([
        { $match: { uploadBatch: latestBatch } },
        { $group: { _id: null, total: { $sum: '$clientCount' } } }
      ]);
      totalACAClients = acaTotalAgg.length > 0 ? acaTotalAgg[0].total : 0;

      // Top 5 personal (individual agent client count)
      topPersonalACA = await ACAClientRecord.aggregate([
        { $match: { uploadBatch: latestBatch } },
        { $sort: { clientCount: -1 } },
        { $limit: 5 },
        { $lookup: { from: 'users', localField: 'agent', foreignField: '_id', as: 'agentInfo' } },
        { $unwind: { path: '$agentInfo', preserveNullAndEmptyArrays: true } },
        { $project: { agentName: { $ifNull: ['$agentInfo.name', '$agentName'] }, clientCount: 1 } }
      ]);

      // Top 5 team (agent + their downline total)
      const allRecords = await ACAClientRecord.find({ uploadBatch: latestBatch }).lean();
      const agentsWithDownline = await User.find({ role: 'agent' }).select('_id name referredBy').lean();
      // Build parent map
      const parentMap = {};
      agentsWithDownline.forEach(u => {
        if (u.referredBy) parentMap[u._id.toString()] = u.referredBy.toString();
      });
      // For each agent, sum their personal + all descendant ACA clients
      const recordMap = {};
      allRecords.forEach(r => { recordMap[r.agent.toString()] = r.clientCount; });
      // Build children map
      const childrenMap = {};
      agentsWithDownline.forEach(u => {
        const pid = u.referredBy?.toString();
        if (pid) {
          if (!childrenMap[pid]) childrenMap[pid] = [];
          childrenMap[pid].push(u._id.toString());
        }
      });
      function sumTree(id) {
        let total = recordMap[id] || 0;
        (childrenMap[id] || []).forEach(cid => { total += sumTree(cid); });
        return total;
      }
      const teamTotals = agentsWithDownline.map(u => ({
        agentName: u.name, teamClientCount: sumTree(u._id.toString())
      }));
      teamTotals.sort((a, b) => b.teamClientCount - a.teamClientCount);
      topTeamACA = teamTotals.slice(0, 5);
    }

    // --- Recent admin notifications / alerts (§25.5) ---
    // Prioritize contract requests and system notifications
    const contractAlerts = await Notification.find({
      userId: req.user._id,
      type: { $in: ['carrier_contract_requested', 'system_announcement', 'admin_broadcast', 'promotion_eligible', 'new_agent_registered'] }
    }).sort({ createdAt: -1 }).limit(5).lean();
    const otherAlerts = await Notification.find({
      userId: req.user._id,
      type: { $nin: ['carrier_contract_requested', 'system_announcement', 'admin_broadcast', 'promotion_eligible', 'new_agent_registered'] }
    }).sort({ createdAt: -1 }).limit(5).lean();
    // Merge: prioritized first, then others, total max 8
    const mergedAlerts = [...contractAlerts, ...otherAlerts]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 8);
    const recentAlerts = mergedAlerts;

    sendResponse(res, 200, {
      stats: {
        totalUsers,
        totalAdmins,
        totalAgents,
        activeUsers,
        inactiveUsers,
        recentUsers,
        licensedAgents: licensedCount,
        unlicensedAgents: unlicensedCount,
        totalProduction,
        productionInForce,
        recentProduction,
        totalPremiumInForce,
        // §25.3 — 24-hour activity
        newAgents24h,
        newLicensedAgents24h,
        newUnlicensedAgents24h,
        newProduction24h,
        newProductionSubmitted24h,
        newProductionInForce24h,
        newApplications24h,
        recentActivity: recentActivity.slice(0, 15),
        // §25.4 — ACA leaderboard
        totalACAClients,
        acaBatch: latestBatch,
        topPersonalACA,
        topTeamACA,
        // §25.5 — Recent alerts
        recentAlerts
      }
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/admin/audit-logs
// @desc    Get audit logs
// @access  Private (Admin only)
router.get('/audit-logs', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const action = req.query.action;
    const userId = req.query.userId;
    
    const filter = {};
    if (action) filter.action = action;
    if (userId) filter.performedBy = userId;
    
    const query = AuditLog.find(filter)
      .populate('performedBy', 'name email role')
      .populate('targetUser', 'name email role')
      .sort('-timestamp');
    
    const logs = await paginate(query, page, limit);
    const total = await AuditLog.countDocuments(filter);
    
    sendResponse(res, 200, {
      logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/admin/payments
// @desc    Get all payments with filters and pagination
// @access  Private (Admin only)
router.get('/payments', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const type = req.query.type; // setup_fee or subscription
    const status = req.query.status;
    const userId = req.query.userId;
    const search = req.query.search;

    const includeDeleted = req.query.includeDeleted === 'true';

    const filter = {};
    if (type) filter.type = type;
    if (status) filter.status = status;
    if (userId) filter.user = userId;
    if (!includeDeleted) filter.deletedAt = null;

    // Search by user name or email
    if (search && !userId) {
      const matchingUsers = await User.find({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ]
      }).select('_id').lean();
      filter.user = { $in: matchingUsers.map(u => u._id) };
    }

    const query = Payment.find(filter)
      .populate('user', 'name email role deletedAt')
      .sort('-createdAt');

    let payments = await paginate(query, page, limit);
    // Exclude orphaned payments (user deleted or removed) unless includeDeleted
    if (!includeDeleted) {
      payments = payments.filter(p => p.user && !p.user.deletedAt);
    }
    const total = payments.length;

    // Calculate stats (exclude soft-deleted payments and orphaned user refs)
    const stats = await Payment.aggregate([
      { $match: { deletedAt: null } },
      { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'userDoc' } },
      { $match: { 'userDoc.0': { $exists: true }, 'userDoc.0.deletedAt': null } },
      { $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' }
      }}
    ]);

    sendResponse(res, 200, {
      payments,
      stats,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/admin/subscriptions
// @desc    Get all subscriptions with filters and pagination
// @access  Private (Admin only)
router.get('/subscriptions', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const status = req.query.status;
    const includeDeleted = req.query.includeDeleted === 'true';

    const filter = {};
    if (status) filter.status = status;
    if (!includeDeleted) filter.deletedAt = null;

    const query = Subscription.find(filter)
      .populate('user', 'name email role paymentAccessEnabled deletedAt')
      .sort('-createdAt');

    let subscriptions = await paginate(query, page, limit);
    // Exclude orphaned subscriptions (user deleted or removed) unless includeDeleted
    if (!includeDeleted) {
      subscriptions = subscriptions.filter(s => s.user && !s.user.deletedAt);
    }
    const total = subscriptions.length;

    // Calculate stats (exclude soft-deleted subscriptions and orphaned user refs)
    const stats = await Subscription.aggregate([
      { $match: { deletedAt: null } },
      { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'userDoc' } },
      { $match: { 'userDoc.0': { $exists: true }, 'userDoc.0.deletedAt': null } },
      { $group: {
        _id: '$status',
        count: { $sum: 1 }
      }}
    ]);

    sendResponse(res, 200, {
      subscriptions,
      stats,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/admin/payments/:userId/enable-access
// @desc    Manually enable payment access for user
// @access  Private (Admin only)
router.post('/payments/:userId/enable-access', logAction('ENABLE_PAYMENT_ACCESS'), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    
    if (!user) {
      return sendResponse(res, 404, { message: 'User not found' });
    }

    user.paymentAccessEnabled = true;
    await user.save();

    sendResponse(res, 200, {
      message: 'Payment access enabled successfully',
      user: {
        _id: user._id,
        name: user.name,
        paymentAccessEnabled: user.paymentAccessEnabled
      }
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/admin/payments/:userId/disable-access
// @desc    Manually disable payment access for user
// @access  Private (Admin only)
router.post('/payments/:userId/disable-access', logAction('DISABLE_PAYMENT_ACCESS'), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    
    if (!user) {
      return sendResponse(res, 404, { message: 'User not found' });
    }

    user.paymentAccessEnabled = false;
    await user.save();

    sendResponse(res, 200, {
      message: 'Payment access disabled successfully',
      user: {
        _id: user._id,
        name: user.name,
        paymentAccessEnabled: user.paymentAccessEnabled
      }
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/admin/subscriptions/:userId/cancel
// @desc    Cancel user subscription
// @access  Private (Admin only)
router.post('/subscriptions/:userId/cancel', logAction('CANCEL_SUBSCRIPTION'), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    
    if (!user) {
      return sendResponse(res, 404, { message: 'User not found' });
    }

    if (!user.stripeSubscriptionId) {
      return sendResponse(res, 404, { message: 'No active subscription found' });
    }

    // Cancel in Stripe
    const stripeSubscription = await cancelSubscription(user.stripeSubscriptionId);

    // Update local subscription record
    const subscription = await Subscription.findOne({ 
      stripeSubscriptionId: user.stripeSubscriptionId 
    });
    
    if (subscription) {
      subscription.status = 'canceled';
      subscription.canceledAt = new Date();
      subscription.endedAt = new Date();
      await subscription.save();
    }

    // Update user
    user.subscriptionStatus = 'canceled';
    user.paymentAccessEnabled = false;
    await user.save();

    sendResponse(res, 200, {
      message: 'Subscription canceled successfully',
      subscription: stripeSubscription
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/admin/payment-settings
// @desc    Get payment settings (setup fee, monthly fee)
// @access  Private (Admin only)
router.get('/payment-settings', async (req, res) => {
  try {
    // Check DB first, fall back to env vars
    const dbSettings = await SystemConfig.findOne({ key: 'payment_settings' }).lean();
    const saved = dbSettings ? JSON.parse(dbSettings.value) : {};

    sendResponse(res, 200, {
      oneTimePrice: saved.oneTimePrice ?? (parseInt(process.env.STRIPE_ONE_TIME_PRICE) || 17900),
      monthlyPrice: saved.monthlyPrice ?? (parseInt(process.env.STRIPE_MONTHLY_SUBSCRIPTION_PRICE) || 2000),
      monthlyPriceId: saved.monthlyPriceId ?? (process.env.STRIPE_MONTHLY_PRICE_ID || ''),
      stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || ''
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   PUT /api/admin/payment-settings
// @desc    Update payment settings
// @access  Private (Admin only)
router.put('/payment-settings', logAction('UPDATE_PAYMENT_SETTINGS'), async (req, res) => {
  try {
    const { oneTimePrice, monthlyPrice, monthlyPriceId } = req.body;

    if (oneTimePrice != null && (typeof oneTimePrice !== 'number' || oneTimePrice < 0)) {
      return sendResponse(res, 400, { message: 'oneTimePrice must be a non-negative number' });
    }
    if (monthlyPrice != null && (typeof monthlyPrice !== 'number' || monthlyPrice < 0)) {
      return sendResponse(res, 400, { message: 'monthlyPrice must be a non-negative number' });
    }

    const settings = {
      oneTimePrice: oneTimePrice ?? (parseInt(process.env.STRIPE_ONE_TIME_PRICE) || 17900),
      monthlyPrice: monthlyPrice ?? (parseInt(process.env.STRIPE_MONTHLY_SUBSCRIPTION_PRICE) || 2000),
      monthlyPriceId: monthlyPriceId ?? (process.env.STRIPE_MONTHLY_PRICE_ID || '')
    };

    await SystemConfig.findOneAndUpdate(
      { key: 'payment_settings' },
      { 
        key: 'payment_settings',
        value: JSON.stringify(settings),
        category: 'application',
        description: 'Payment pricing configuration',
        isEditable: true
      },
      { upsert: true, new: true }
    );

    sendResponse(res, 200, { message: 'Payment settings updated successfully', ...settings });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   PUT /api/admin/users/:userId/transfer
// @desc    Transfer an agent to a new upline (recruiter)
// @access  Private (Admin only)
router.put('/users/:userId/transfer', logAction('TRANSFER_AGENT'), async (req, res) => {
  try {
    const { newUplineId } = req.body;

    if (!newUplineId) {
      return sendResponse(res, 400, { message: 'newUplineId is required' });
    }

    const agent = await User.findById(req.params.userId);
    if (!agent) return sendResponse(res, 404, { message: 'Agent not found' });

    if (agent._id.toString() === newUplineId) {
      return sendResponse(res, 400, { message: 'Agent cannot be transferred to themselves' });
    }

    const newUpline = await User.findById(newUplineId);
    if (!newUpline) return sendResponse(res, 404, { message: 'New upline user not found' });

    const oldUplineId = agent.referredBy ? agent.referredBy.toString() : null;

    // 1. Remove agent from old upline's children array
    if (oldUplineId) {
      await User.findByIdAndUpdate(oldUplineId, {
        $pull: { children: agent._id }
      });
    }

    // 2. Add agent to new upline's children array
    await User.findByIdAndUpdate(newUplineId, {
      $addToSet: { children: agent._id }
    });

    // 3. Update agent's referredBy and set transferredAt
    agent.referredBy = newUplineId;
    agent.transferredAt = new Date();
    await agent.save();

    Notification.createNotification({
      userId: agent._id,
      type: 'user_transferred',
      title: 'Upline Transfer',
      message: `Your upline has been changed to ${newUpline.name} by an administrator.`,
      link: '/profile'
    }, false).catch(() => {});

    // Trigger promotion re-check for the new upline chain (async, non-blocking)
    // This ensures the new upline's builder track reflects the transferred agent's production
    (async () => {
      try {
        const { checkAndNotifyPromotion, getUplineChainIds } = require('./promotion.routes');
        // Check new upline
        await checkAndNotifyPromotion(newUplineId);
        // Check ancestors of new upline
        const uplineChain = await getUplineChainIds(newUplineId);
        for (const ancestorId of uplineChain) {
          await checkAndNotifyPromotion(ancestorId);
        }
      } catch (err) {
        console.error('[Transfer] Post-transfer promotion check error:', err.message);
      }
    })();

    // Audit logging handled by logAction('TRANSFER_AGENT') middleware on this route

    sendResponse(res, 200, {
      message: `${agent.name} transferred to ${newUpline.name} successfully`,
      agent: await User.findById(agent._id).select('-password').populate('referredBy', 'name email')
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   GET /api/admin/welcome-message
// @desc    Get current welcome message configuration
// @access  Private (Admin only)
router.get('/welcome-message', async (req, res) => {
  try {
    const config = await SystemConfig.findOne({ key: 'welcome_message' });
    sendResponse(res, 200, {
      config: config ? config.value : {
        enabled: false,
        title: '',
        message: '',
        videoUrl: '',
        imageUrl: '',
        pdfUrl: '',
        displayMode: 'until_dismissed',
        startDate: null,
        endDate: null
      }
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   PUT /api/admin/welcome-message
// @desc    Update the welcome message configuration
// @access  Private (Admin only)
router.put('/welcome-message', logAction('UPDATE_WELCOME_MESSAGE'), async (req, res) => {
  try {
    const { enabled, title, message, videoUrl, imageUrl, pdfUrl, displayMode, startDate, endDate } = req.body;

    const allowedModes = ['first_login', 'until_dismissed', 'date_range'];
    const mode = allowedModes.includes(displayMode) ? displayMode : 'until_dismissed';

    const config = await SystemConfig.findOneAndUpdate(
      { key: 'welcome_message' },
      {
        key: 'welcome_message',
        value: {
          enabled: !!enabled,
          title: title || '',
          message: message || '',
          videoUrl: videoUrl || '',
          imageUrl: imageUrl || '',
          pdfUrl: pdfUrl || '',
          displayMode: mode,
          startDate: startDate || null,
          endDate: endDate || null,
          lastConfiguredAt: new Date()
        },
        category: 'general',
        updatedBy: req.user._id
      },
      { upsert: true, new: true }
    );

    sendResponse(res, 200, { message: 'Welcome message updated', config: config.value });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/admin/welcome-message/upload
// @desc    Upload image or PDF for welcome message
// @access  Private (Admin only)
router.post('/welcome-message/upload', welcomeMediaUpload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'pdf', maxCount: 1 }
]), async (req, res) => {
  try {
    const result = {};
    if (req.files && req.files.image && req.files.image[0]) {
      result.imageUrl = `/uploads/welcome/${req.files.image[0].filename}`;
    }
    if (req.files && req.files.pdf && req.files.pdf[0]) {
      result.pdfUrl = `/uploads/welcome/${req.files.pdf[0].filename}`;
    }

    // Update the config with the new file URLs
    if (result.imageUrl || result.pdfUrl) {
      const config = await SystemConfig.findOne({ key: 'welcome_message' });
      if (config && config.value) {
        const update = { ...config.value };
        if (result.imageUrl) update.imageUrl = result.imageUrl;
        if (result.pdfUrl) update.pdfUrl = result.pdfUrl;
        config.value = update;
        config.updatedBy = req.user._id;
        await config.save();
      }
    }

    sendResponse(res, 200, { message: 'File(s) uploaded', ...result });
  } catch (error) {
    errorResponse(res, error);
  }
});

// @route   POST /api/admin/welcome-message/reset-users
// @desc    Reset all users' welcomeMessageSeenAt so they see it again
// @access  Private (Admin only)
router.post('/welcome-message/reset-users', logAction('RESET_WELCOME_MESSAGE'), async (req, res) => {
  try {
    const result = await User.updateMany(
      { welcomeMessageSeenAt: { $ne: null } },
      { $set: { welcomeMessageSeenAt: null } }
    );
    sendResponse(res, 200, { message: `Reset welcome message for ${result.modifiedCount} users` });
  } catch (error) {
    errorResponse(res, error);
  }
});

module.exports = router;
