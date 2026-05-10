#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const User = require('../models/User');
require('../models/ACAClientRecord');
const APAApplication = require('../models/APAApplication');
const Onboarding = require('../models/Onboarding');
const Payment = require('../models/Payment');
const Subscription = require('../models/Subscription');
const LicensingProgress = require('../models/LicensingProgress');
const OnboardingDocument = require('../models/OnboardingDocument');
const { sendWelcomeSetPasswordEmail } = require('../utils/neuzmail');

function parseArgs(argv) {
  const args = {
    spec: null,
    write: false,
    sendEmails: false,
    ttlMinutes: 24 * 60,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--spec') {
      args.spec = argv[index + 1];
      index += 1;
    } else if (arg === '--write') {
      args.write = true;
    } else if (arg === '--send-emails') {
      args.sendEmails = true;
    } else if (arg === '--ttl-minutes') {
      args.ttlMinutes = Number(argv[index + 1] || args.ttlMinutes);
      index += 1;
    }
  }

  return args;
}

function loadSpec(specPath) {
  if (!specPath) {
    throw new Error('A spec file is required. Pass --spec <path>.');
  }

  const resolved = path.resolve(process.cwd(), specPath);
  const raw = fs.readFileSync(resolved, 'utf8');
  const parsed = JSON.parse(raw);
  const users = Array.isArray(parsed) ? parsed : parsed.users;

  if (!Array.isArray(users) || users.length === 0) {
    throw new Error('Spec file must contain a non-empty array of users or a { "users": [...] } object.');
  }

  return users;
}

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function issueRecoveryReset(user, ttlMinutes) {
  const rawToken = crypto.randomBytes(20).toString('hex');
  user.resetPasswordToken = hashToken(rawToken);
  user.resetPasswordExpire = new Date(Date.now() + ttlMinutes * 60 * 1000);
  return rawToken;
}

function normalizeObjectId(value) {
  if (!value) {
    return null;
  }

  if (value instanceof mongoose.Types.ObjectId) {
    return value;
  }

  return new mongoose.Types.ObjectId(String(value));
}

function pickFirst(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return undefined;
}

async function findApaSource(email) {
  return APAApplication.findOne({
    $or: [
      { 'personalInfo.email': email.toLowerCase() },
      { 'businessInfo.contactEmail': email.toLowerCase() },
    ],
  }).sort({ updatedAt: -1, createdAt: -1 });
}

async function findReferredById(referralCode) {
  if (!referralCode) {
    return null;
  }

  const referringUser = await User.findOne({
    referralCode,
    isActive: true,
    deletedAt: null,
  }).select('_id name');

  return referringUser || null;
}

async function gatherLinkedState(userId) {
  const [payment, subscription, licensingProgress, onboarding, onboardingDocCount] = await Promise.all([
    Payment.findOne({ user: userId, deletedAt: null }).sort({ createdAt: -1 }).lean(),
    Subscription.findOne({ user: userId, deletedAt: null }).lean(),
    LicensingProgress.findOne({ agent: userId }).lean(),
    Onboarding.findOne({ user: userId, deletedAt: null }).lean(),
    OnboardingDocument.countDocuments({ agent: userId, deletedAt: null }),
  ]);

  return {
    payment,
    subscription,
    licensingProgress,
    onboarding,
    onboardingDocCount,
  };
}

function deriveUserFields(entry, apaSource, linkedState, referredByUser) {
  const personalInfo = apaSource?.personalInfo || {};
  const homeAddress = personalInfo.homeAddress || {};

  const name = pickFirst(
    entry.name,
    [personalInfo.legalFirstName, personalInfo.legalLastName].filter(Boolean).join(' ').trim(),
    personalInfo.email ? personalInfo.email.split('@')[0] : undefined,
    entry.email.split('@')[0]
  );

  const role = pickFirst(entry.role, apaSource ? 'agent' : undefined, 'agent');
  const phone = pickFirst(entry.phone, personalInfo.mobilePhone, 'recovery-required');
  const address = pickFirst(entry.address, homeAddress.street, personalInfo.address);
  const city = pickFirst(entry.city, homeAddress.city, personalInfo.city);
  const state = pickFirst(entry.state, homeAddress.state, personalInfo.state);
  const zipCode = pickFirst(entry.zipCode, homeAddress.zipCode, personalInfo.zipCode, personalInfo.zip);
  const dateOfBirth = pickFirst(entry.dateOfBirth, personalInfo.dateOfBirth);

  const payment = linkedState.payment;
  const subscription = linkedState.subscription;
  const hasPaidSetupFee = Boolean(payment && ['completed', 'succeeded'].includes(payment.status));
  const onboardingStatus = entry.onboardingStatus
    || linkedState.onboarding?.status
    || (linkedState.onboardingDocCount > 0 ? 'pending' : 'not-started');

  const metadata = {
    ...(apaSource ? {
      applicationId: String(apaSource._id),
      referralCode: apaSource.recruitingInfo?.referralCode || '',
      recoverySource: 'apa_application',
    } : {
      recoverySource: 'manual_override',
    }),
    recoveredAt: new Date().toISOString(),
    ...(entry.metadata || {}),
  };

  return {
    email: entry.email.toLowerCase(),
    name,
    phone,
    role,
    isActive: entry.isActive !== undefined ? entry.isActive : true,
    isEmailVerified: entry.isEmailVerified !== undefined ? entry.isEmailVerified : true,
    referredBy: entry.referredBy || referredByUser?._id || null,
    address,
    city,
    state,
    zipCode,
    dateOfBirth,
    metadata,
    onboardingStatus,
    oneTimePaymentCompleted: entry.oneTimePaymentCompleted !== undefined ? entry.oneTimePaymentCompleted : hasPaidSetupFee,
    oneTimePaymentAmount: entry.oneTimePaymentAmount !== undefined
      ? entry.oneTimePaymentAmount
      : (payment?.amount || 0),
    oneTimePaymentDate: entry.oneTimePaymentDate || payment?.paidAt || payment?.updatedAt || payment?.createdAt,
    stripeCustomerId: pickFirst(entry.stripeCustomerId, subscription?.stripeCustomerId, apaSource?.payment?.stripeCustomerId),
    stripeSubscriptionId: pickFirst(entry.stripeSubscriptionId, subscription?.stripeSubscriptionId, apaSource?.payment?.stripeSubscriptionId),
    subscriptionStatus: pickFirst(entry.subscriptionStatus, subscription?.status, hasPaidSetupFee ? 'active' : 'none'),
    subscriptionStartDate: pickFirst(entry.subscriptionStartDate, subscription?.currentPeriodStart),
    nextBillingDate: pickFirst(entry.nextBillingDate, subscription?.currentPeriodEnd),
    lastPaymentDate: pickFirst(entry.lastPaymentDate, payment?.paidAt, payment?.updatedAt, payment?.createdAt),
    paymentAccessEnabled: entry.paymentAccessEnabled !== undefined
      ? entry.paymentAccessEnabled
      : Boolean(subscription?.status === 'active' || hasPaidSetupFee),
    level: entry.level || 'associate',
    createdAt: entry.createdAt || apaSource?.createdAt,
    updatedAt: entry.updatedAt || apaSource?.updatedAt,
  };
}

async function ensureOnboarding(user, fields, write) {
  if (user.role !== 'agent') {
    return null;
  }

  let onboarding = await Onboarding.findOne({ user: user._id, deletedAt: null });
  if (onboarding) {
    if (fields.onboardingStatus && onboarding.status !== fields.onboardingStatus) {
      onboarding.status = fields.onboardingStatus;
      if (write) {
        await onboarding.save();
      }
    }
    return onboarding;
  }

  onboarding = new Onboarding({
    user: user._id,
    status: fields.onboardingStatus || 'not-started',
  });

  if (write) {
    await onboarding.save();
  }

  return onboarding;
}

async function syncApaSource(apaSource, userId, write) {
  if (!apaSource) {
    return;
  }

  const needsUpdate = String(apaSource.userId || '') !== String(userId) || String(apaSource.user || '') !== String(userId);
  if (!needsUpdate || !write) {
    return;
  }

  apaSource.userId = userId;
  apaSource.user = userId;
  await apaSource.save();
}

async function reconstructOne(entry, options) {
  const lowerEmail = String(entry.email || '').trim().toLowerCase();
  if (!lowerEmail) {
    throw new Error('Each spec entry must include an email.');
  }

  const apaSource = await findApaSource(lowerEmail);
  const originalUserId = normalizeObjectId(entry.originalUserId || apaSource?.userId || apaSource?.user || null);
  const linkedState = originalUserId ? await gatherLinkedState(originalUserId) : {
    payment: null,
    subscription: null,
    licensingProgress: null,
    onboarding: null,
    onboardingDocCount: 0,
  };
  const referredByUser = await findReferredById(apaSource?.recruitingInfo?.referralCode);

  let user = await User.findOne({ email: lowerEmail }).select('+password');
  const existingById = originalUserId ? await User.findById(originalUserId).select('+password') : null;

  if (!user && existingById && existingById.email !== lowerEmail) {
    throw new Error(`User ID ${originalUserId} already exists with a different email (${existingById.email}).`);
  }

  if (!user && existingById) {
    user = existingById;
  }

  const fields = deriveUserFields({ ...entry, email: lowerEmail }, apaSource, linkedState, referredByUser);
  const created = !user;
  if (!user) {
    user = new User({
      _id: originalUserId || new mongoose.Types.ObjectId(),
      email: lowerEmail,
      password: crypto.randomBytes(24).toString('hex'),
      name: fields.name,
      phone: fields.phone,
    });
  }

  Object.assign(user, fields);

  if (originalUserId && String(user._id) !== String(originalUserId)) {
    throw new Error(`Resolved user email ${lowerEmail} to a different _id (${user._id}) than requested original ID (${originalUserId}).`);
  }

  let resetUrl = null;
  let emailSent = false;
  const rawResetToken = issueRecoveryReset(user, options.ttlMinutes);
  resetUrl = `${process.env.APP_URL}/reset-password?token=${rawResetToken}`;

  if (options.write) {
    await user.save();

    const onboarding = await ensureOnboarding(user, fields, true);
    if (onboarding && String(user.onboarding || '') !== String(onboarding._id)) {
      user.onboarding = onboarding._id;
      user.onboardingStatus = onboarding.status;
      await user.save({ validateBeforeSave: false });
    }

    await syncApaSource(apaSource, user._id, true);

    if (options.sendEmails) {
      try {
        await sendWelcomeSetPasswordEmail(user, rawResetToken, referredByUser || null);
        emailSent = true;
      } catch (error) {
        emailSent = false;
        console.error(`Failed to send recovery email to ${lowerEmail}: ${error.message}`);
      }
    }
  }

  return {
    email: lowerEmail,
    created,
    userId: String(user._id),
    role: user.role,
    source: apaSource ? 'apa_application' : 'manual_override',
    sourceApplicationId: apaSource ? String(apaSource._id) : null,
    paymentRecovered: Boolean(linkedState.payment),
    subscriptionRecovered: Boolean(linkedState.subscription),
    licensingRecovered: Boolean(linkedState.licensingProgress),
    onboardingDocumentsRecovered: linkedState.onboardingDocCount,
    resetUrl,
    resetExpiresAt: user.resetPasswordExpire,
    emailSent,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const entries = loadSpec(options.spec);

  await mongoose.connect(process.env.MONGODB_URI);

  try {
    const results = [];
    for (const entry of entries) {
      const result = await reconstructOne(entry, options);
      results.push(result);
    }

    console.log(JSON.stringify({
      write: options.write,
      sendEmails: options.sendEmails,
      ttlMinutes: options.ttlMinutes,
      results,
    }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});