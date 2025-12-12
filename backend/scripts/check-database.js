const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function checkDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/rphoffice');
    console.log('Connected to MongoDB\n');
    
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    
    const allUsers = await usersCollection.find({}).toArray();
    
    console.log('=== ALL USERS ===');
    allUsers.forEach(user => {
      console.log(`${user.name} (${user.email})`);
      console.log(`  Role: ${user.role}`);
      console.log(`  Referral Code: ${user.referralCode}`);
      console.log(`  Referred By: ${user.referredBy || 'None'}`);
      console.log('');
    });
    
    console.log('=== STATS ===');
    console.log(`Total users: ${allUsers.length}`);
    console.log(`Admins: ${allUsers.filter(u => u.role === 'admin').length}`);
    console.log(`Agents: ${allUsers.filter(u => u.role === 'agent').length}`);
    console.log(`Recruits: ${allUsers.filter(u => u.role === 'recruit').length}`);
    console.log(`REC codes: ${allUsers.filter(u => u.referralCode && u.referralCode.startsWith('REC')).length}`);
    console.log(`AGT codes: ${allUsers.filter(u => u.referralCode && u.referralCode.startsWith('AGT')).length}`);
    console.log(`ADM codes: ${allUsers.filter(u => u.referralCode && u.referralCode.startsWith('ADM')).length}`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkDatabase();
