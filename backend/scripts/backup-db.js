#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDir = path.join(__dirname, '..', `backup-${timestamp}`);
  fs.mkdirSync(backupDir, { recursive: true });

  const collections = await db.listCollections().toArray();
  console.log(`Backing up ${collections.length} collections to ${backupDir}\n`);

  for (const col of collections) {
    const name = col.name;
    const docs = await db.collection(name).find({}).toArray();
    const outFile = path.join(backupDir, `${name}.json`);
    fs.writeFileSync(outFile, JSON.stringify(docs, null, 2));
    console.log(`  ${name.padEnd(30)} ${docs.length} documents`);
  }

  console.log(`\nBackup complete: ${backupDir}`);
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
