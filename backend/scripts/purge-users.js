#!/usr/bin/env node

/**
 * Purge all users (and their associated records) EXCEPT the two preserved users.
 *
 * Usage:
 *   node scripts/purge-users.js              # dry-run (no changes)
 *   node scripts/purge-users.js --write      # actually delete
 */

const path = require('path');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// ── Models ──────────────────────────────────────────────────────────────────
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

// ── Config ──────────────────────────────────────────────────────────────────
const PRESERVED_EMAILS = [
  'lotushotmail111@gmail.com',
  'contracting@rhpoffice.com',
];

const write = process.argv.includes('--write');

// ── Helpers ─────────────────────────────────────────────────────────────────
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

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected to MongoDB — mode: ${write ? 'WRITE' : 'DRY-RUN'}\n`);

  // 1. Identify users to purge
  const preservedUsers = await User.find({ email: { $in: PRESERVED_EMAILS } }).select('_id email').lean();
  const preservedIds = preservedUsers.map(u => u._id);

  if (preservedUsers.length !== PRESERVED_EMAILS.length) {
    console.error('Could not find all preserved users! Aborting.');
    console.error('Found:', preservedUsers.map(u => u.email));
    process.exit(1);
  }

  const usersToDelete = await User.find({ _id: { $nin: preservedIds } }).select('_id email name').lean();
  const deleteIds = usersToDelete.map(u => u._id);

  console.log(`Preserved users (${preservedUsers.length}):`);
  preservedUsers.forEach(u => console.log(`  ✓ ${u.email} (${u._id})`));
  console.log(`\nUsers to purge (${usersToDelete.length}):`);
  usersToDelete.forEach(u => console.log(`  ✗ ${u.email} — ${u.name} (${u._id})`));

  if (deleteIds.length === 0) {
    console.log('\nNo users to purge. Done.');
    await mongoose.disconnect();
    return;
  }

  const idFilter = { $in: deleteIds };

  // ── 2. Delete user-owned records ──────────────────────────────────────
  console.log('\n── Deleting user-owned records ──');

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

  // DocumentRequests — delete if requestedBy is a purged user
  await countAndDelete(DocumentRequest,        { requestedBy: idFilter }, 'DocumentRequests');

  // ── 3. Nullify audit references on shared/config records ──────────────
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

  // Pull purged IDs from DocumentHubFile.restrictedTo arrays
  await countAndPull(DocumentHubFile, { restrictedTo: idFilter }, 'restrictedTo', deleteIds, 'DocumentHubFiles.restrictedTo');

  // ── 4. Clean up preserved users' self-references ──────────────────────
  console.log('\n── Cleaning preserved users\' references ──');

  await countAndPull(User, { _id: { $in: preservedIds }, children: idFilter }, 'children', deleteIds, 'User.children');
  await countAndNullify(User, { _id: { $in: preservedIds }, referredBy: idFilter }, ['referredBy'], 'User.referredBy');

  // ── 5. Delete the users themselves ────────────────────────────────────
  console.log('\n── Deleting users ──');
  await countAndDelete(User, { _id: idFilter }, 'Users');

  // ── Summary ───────────────────────────────────────────────────────────
  const remainingUsers = await User.countDocuments({});
  console.log(`\nRemaining users in DB: ${remainingUsers}`);
  console.log(write ? '\n✓ Purge COMPLETE.' : '\n⚠ DRY-RUN — no changes made. Re-run with --write to execute.');

  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
