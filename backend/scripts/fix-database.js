const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function fixDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/rphoffice');
    console.log('Connected to MongoDB');
    
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    
    // Update recruit role to agent
    const recruitResult = await usersCollection.updateMany(
      { role: 'recruit' },
      { $set: { role: 'agent' } }
    );
    console.log(`Updated ${recruitResult.modifiedCount} users from recruit to agent`);
    
    // Get all users with REC codes
    const recUsers = await usersCollection.find({ 
      referralCode: { $regex: '^REC' }
    }).toArray();
    
    console.log(`Found ${recUsers.length} users with REC codes`);
    
    // Update each REC code to AGT
    for (const user of recUsers) {
      const newCode = user.referralCode.replace('REC', 'AGT');
      await usersCollection.updateOne(
        { _id: user._id },
        { $set: { referralCode: newCode } }
      );
      console.log(`  ${user.email}: ${user.referralCode} -> ${newCode}`);
    }
    
    console.log('\n✓ Database fixed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixDatabase();
