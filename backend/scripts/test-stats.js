const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function testStats() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/rphoffice');
    console.log('Connected to MongoDB\n');
    
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    
    // Get all users
    const allUsers = await usersCollection.find({}).toArray();
    
    console.log('=== REFERRAL RELATIONSHIPS ===\n');
    
    for (const user of allUsers) {
      const userId = user._id.toString();
      
      // Count direct recruits
      const directRecruits = await usersCollection.countDocuments({ 
        referredBy: user._id 
      });
      
      // Get direct recruits details
      const recruits = await usersCollection.find({ 
        referredBy: user._id 
      }).toArray();
      
      if (directRecruits > 0) {
        console.log(`${user.name} (${user.email})`);
        console.log(`  ID: ${userId}`);
        console.log(`  Referral Code: ${user.referralCode}`);
        console.log(`  Direct Recruits: ${directRecruits}`);
        console.log(`  Recruits:`);
        recruits.forEach(r => {
          console.log(`    - ${r.name} (${r.email}) - Active: ${r.isActive}`);
        });
        console.log('');
      }
    }
    
    console.log('\n=== USERS WITH NO RECRUITS ===\n');
    for (const user of allUsers) {
      const directRecruits = await usersCollection.countDocuments({ 
        referredBy: user._id 
      });
      if (directRecruits === 0) {
        console.log(`${user.name} (${user.email}) - Code: ${user.referralCode}`);
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testStats();
