#!/usr/bin/env node

const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const User = require('../models/User');

const DEFAULT_PASSWORD = '123456';

const EMAILS = [
  'kannojia.anuj@gmail.com',
  'lotusbiswas2025@gmail.com',
  'melissacortinas@outlook.com',
  'melissa_4046@hotmail.com',
  'norgedidit@gmail.com',
  'norgeh6047@gmail.com',
  'norgehernandez6047@gmail.com',
  'norgesemail@gmail.com',
  '1000026381@dit.edu.in',
  'lotushotmail111@gmail.com',
];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, salt);

  let updated = 0;
  let notFound = 0;

  for (const email of EMAILS) {
    const result = await User.updateOne(
      { email: email.toLowerCase() },
      { $set: { password: hashedPassword } }
    );

    if (result.matchedCount > 0) {
      console.log(`  ✓ Reset password for: ${email}`);
      updated++;
    } else {
      console.log(`  ✗ User not found: ${email}`);
      notFound++;
    }
  }

  console.log(`\nDone. Updated: ${updated}, Not found: ${notFound}`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
