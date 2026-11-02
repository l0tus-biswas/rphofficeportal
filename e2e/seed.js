// Seeds the LOCAL e2e database only. Refuses to run against anything that is not localhost.
// Usage: MONGODB_URI=mongodb://localhost:27018/rph_e2e node e2e/seed.js
const path = require('path');
const mongoose = require(path.join(__dirname, '../backend/node_modules/mongoose'));
const { USERS } = require('./helpers/users');

const uri = process.env.MONGODB_URI || '';
if (!/^mongodb:\/\/(localhost|127\.0\.0\.1)[:/]/.test(uri)) {
  console.error('Refusing to seed: MONGODB_URI must point at localhost. Got:', uri.replace(/\/\/[^@/]*@/, '//<creds>@'));
  process.exit(1);
}

(async () => {
  await mongoose.connect(uri);
  require('../backend/models/ACAClientRecord'); // User post-save hook syncs ACA records
  const User = require('../backend/models/User');
  await mongoose.connection.db.dropDatabase();
  await User.syncIndexes();

  const created = {};
  for (const [key, u] of Object.entries(USERS)) {
    const referredBy = u.parent ? created[u.parent]._id : null;
    const doc = await User.create({
      name: u.name, email: u.email, phone: u.phone, password: u.password,
      role: u.role, isActive: u.isActive !== false, isEmailVerified: true, referredBy
    });
    if (referredBy) await User.updateOne({ _id: referredBy }, { $addToSet: { children: doc._id } });
    created[key] = doc;
    console.log('seeded', key, u.email, u.role);
  }
  const Carrier = require('../backend/models/Carrier');
  await Carrier.create({ name: 'E2E Carrier', category: ['Life Insurance'], isActive: true });
  console.log('seeded carrier E2E Carrier');
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
