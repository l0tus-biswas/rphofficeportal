const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' });

async function migrateRecruitToAgent() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/rphoffice');
    console.log('Connected to MongoDB');
    
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    
    // Find all users with role 'recruit'
    const recruitCount = await usersCollection.countDocuments({ role: 'recruit' });
    console.log(`Found ${recruitCount} users with 'recruit' role`);
    
    if (recruitCount > 0) {
      // Update all recruit users to agent
      const result = await usersCollection.updateMany(
        { role: 'recruit' },
        { 
          $set: { role: 'agent' },
          $currentDate: { updatedAt: true }
        }
      );
      
      console.log(`✓ Updated ${result.modifiedCount} users from 'recruit' to 'agent' role`);
    } else {
      console.log('No users with recruit role found');
    }
    
    // Update referral codes from REC to AGT
    const recCodeCount = await usersCollection.countDocuments({ 
      referralCode: { $regex: /^REC/ } 
    });
    console.log(`\nFound ${recCodeCount} users with REC referral codes`);
    
    if (recCodeCount > 0) {
      // Get all users with REC codes
      const usersWithRecCodes = await usersCollection.find({ 
        referralCode: { $regex: /^REC/ } 
      }).toArray();
      
      // Update each one
      for (const user of usersWithRecCodes) {
        const newCode = user.referralCode.replace(/^REC/, 'AGT');
        await usersCollection.updateOne(
          { _id: user._id },
          { 
            $set: { referralCode: newCode },
            $currentDate: { updatedAt: true }
          }
        );
      }
      
      console.log(`✓ Updated ${usersWithRecCodes.length} referral codes from REC* to AGT*`);
    } else {
      console.log('No REC referral codes found');
    }
    
    console.log('\n✓ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateRecruitToAgent();
