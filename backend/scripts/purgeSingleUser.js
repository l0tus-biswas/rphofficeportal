#!/usr/bin/env node

/**
 * Hard-delete a single user and cascade-clean all records that reference them,
 * using the same collection/field list as scripts/purge-users.js (just targeted
 * at one email instead of "everyone except a preserved list").
 *
 * Usage:
 *   node scripts/purgeSingleUser.js user@example.com              # dry-run
 *   node scripts/purgeSingleUser.js user@example.com --write       # actually delete
 */

const path = require('path');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const User = require('../models/User');
const APAApplication = require('../models/APAApplication');
const ACAClientRecord = require('../models/ACAClientRecord');
const AcaTierConfig = require('../models/AcaTierConfig');
const AgentCarrierStatus = require('../models/AgentCarrierStatus');
const AuditLog = require('../models/AuditLog');
const Broadcast = require('../models/Broadcast');
const Carrier = require('../models/Carrier');
const CommissionStatement = require('../models/CommissionStatement');
const Coupon = require('../models/Coupon');
const DocumentFolder = require('../models/DocumentFolder');
const DocumentHubFile = require('../models/DocumentHubFile');
const DocumentRequest = require('../models/DocumentRequest');
const ExamFXProgress = require('../models/ExamFXProgress');
const LicensingProgress = require('../models/LicensingProgress');
const Notification = require('../models/Notification');
const NotificationPreference = require('../models/NotificationPreference');
const Onboarding = require('../models/Onboarding');
const OnboardingDocument = require('../models/OnboardingDocument');
const Payment = require('../models/Payment');
const ProductionSubmission = require('../models/ProductionSubmission');
const ProductType = require('../models/ProductType');
const Subscription = require('../models/Subscription');
const SystemConfig = require('../models/SystemConfig');
const TrainingCategory = require('../models/TrainingCategory');
const TrainingFolder = require('../models/TrainingFolder');
const TrainingMaterial = require('../models/TrainingMaterial');

const targetEmail = process.argv[2];
const write = process.argv.includes('--write');

if (!targetEmail || targetEmail === '--write') {
  console.error('Usage: node scripts/purgeSingleUser.js user@example.com [--write]');
  process.exit(1);
}

async function countAndDelete(model, filter, label) {
  const count = await model.countDocuments(filter);
  if (count > 0 && write) {
    await model.deleteMany(filter);
  }
  console.log(`  ${label.padEnd(35)} ${count} records ${write ? 'DELETED' : '(would delete)'}`);
  return count;
}

async function countAndNullify(model, filter, unsetFields, label) {
  const count = await model.countDocuments(filter);
  if (count > 0 && write) {
    const update = {};
    for (const field of unsetFields) {
      update[field] = null;
    }
    await model.updateMany(filter, { $set: update });
  }
  console.log(`  ${label.padEnd(35)} ${count} records ${write ? 'NULLIFIED' : '(would nullify)'} [${unsetFields.join(', ')}]`);
  return count;
}

async function countAndPull(model, filter, arrayField, pullValues, label) {
  const count = await model.countDocuments(filter);
  if (count > 0 && write) {
    await model.updateMany(filter, { $pullAll: { [arrayField]: pullValues } });
  }
  console.log(`  ${label.padEnd(35)} ${count} records ${write ? 'UPDATED' : '(would update)'} [pull from ${arrayField}]`);
  return count;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected to MongoDB — mode: ${write ? 'WRITE' : 'DRY-RUN'}\n`);

  const target = await User.findOne({ email: targetEmail }).select('_id email name').lean();
  if (!target) {
    console.log(`User ${targetEmail} not found. Nothing to do.`);
    await mongoose.disconnect();
    return;
  }
  console.log(`Target user: ${target.email} — ${target.name} (${target._id})\n`);

  const deleteIds = [target._id];
  const idFilter = { $in: deleteIds };

  console.log('── Deleting user-owned records ──');
  await countAndDelete(Notification,           { userId: idFilter },      'Notifications');
  await countAndDelete(NotificationPreference, { userId: idFilter },      'NotificationPreferences');
  await countAndDelete(Onboarding,             { user: idFilter },        'Onboardings');
  await countAndDelete(OnboardingDocument,     { agent: idFilter },       'OnboardingDocuments');
  await countAndDelete(Payment,                { user: idFilter },        'Payments');
  await countAndDelete(Subscription,           { user: idFilter },        'Subscriptions');
  await countAndDelete(LicensingProgress,      { agent: idFilter },       'LicensingProgress');
  await countAndDelete(ExamFXProgress,         { agent: idFilter },       'ExamFXProgress');
  await countAndDelete(AgentCarrierStatus,     { agent: idFilter },       'AgentCarrierStatuses');
  await countAndDelete(ACAClientRecord,        { agent: idFilter },       'ACAClientRecords');
  await countAndDelete(CommissionStatement,    { agent: idFilter },       'CommissionStatements');
  await countAndDelete(ProductionSubmission,   { agent: idFilter },       'ProductionSubmissions');
  await countAndDelete(APAApplication,         { userId: idFilter },      'APAApplications (userId)');
  await countAndDelete(AuditLog,               { $or: [{ performedBy: idFilter }, { targetUser: idFilter }] }, 'AuditLogs');
  await countAndDelete(DocumentRequest,        { requestedBy: idFilter }, 'DocumentRequests');

  console.log('\n── Nullifying references on shared records ──');
  await countAndNullify(Carrier,          { $or: [{ addedBy: idFilter }, { lastModifiedBy: idFilter }] },
    ['addedBy', 'lastModifiedBy'], 'Carriers');
  await countAndNullify(ProductType,      { addedBy: idFilter },          ['addedBy'],          'ProductTypes');
  await countAndNullify(Broadcast,        { createdBy: idFilter },        ['createdBy'],        'Broadcasts');
  await countAndNullify(Coupon,           { createdBy: idFilter },        ['createdBy'],        'Coupons');
  await countAndNullify(DocumentFolder,   { createdBy: idFilter },        ['createdBy'],        'DocumentFolders');
  await countAndNullify(DocumentHubFile,  { uploadedBy: idFilter },       ['uploadedBy'],       'DocumentHubFiles');
  await countAndNullify(TrainingCategory, { createdBy: idFilter },        ['createdBy'],        'TrainingCategories');
  await countAndNullify(TrainingFolder,   { createdBy: idFilter },        ['createdBy'],        'TrainingFolders');
  await countAndNullify(TrainingMaterial, { uploadedBy: idFilter },       ['uploadedBy'],       'TrainingMaterials');
  await countAndNullify(SystemConfig,     { updatedBy: idFilter },        ['updatedBy'],        'SystemConfigs');
  await countAndNullify(AcaTierConfig,    { $or: [{ agent: idFilter }, { updatedBy: idFilter }] },
    ['agent', 'updatedBy'], 'AcaTierConfigs');

  await countAndPull(DocumentHubFile, { restrictedTo: idFilter }, 'restrictedTo', deleteIds, 'DocumentHubFiles.restrictedTo');

  console.log('\n── Cleaning other users\' references to this user ──');
  await countAndPull(User, { children: idFilter }, 'children', deleteIds, 'User.children');
  await countAndNullify(User, { referredBy: idFilter }, ['referredBy'], 'User.referredBy');

  console.log('\n── Deleting the user ──');
  await countAndDelete(User, { _id: idFilter }, 'Users');

  const remainingUsers = await User.countDocuments({});
  console.log(`\nRemaining users in DB: ${remainingUsers}`);
  console.log(write ? '\n✓ Purge COMPLETE.' : '\n⚠ DRY-RUN — no changes made. Re-run with --write to execute.');

  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
