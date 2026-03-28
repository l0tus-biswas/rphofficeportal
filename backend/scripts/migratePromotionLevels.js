/**
 * Migrate Promotion Levels
 *
 * Updates existing users from old level names to new ones:
 *   - "field manager" → "manager"
 *   - "division executive" → "regional executive"
 *
 * Also re-seeds PromotionLevel documents to match the new 8-level structure.
 *
 * Run: node backend/scripts/migratePromotionLevels.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

const LEVEL_REMAP = {
  'field manager': 'manager',
  'division executive': 'regional executive'
};

async function migrate() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    for (const [oldLevel, newLevel] of Object.entries(LEVEL_REMAP)) {
      const result = await User.updateMany(
        { level: oldLevel },
        { $set: { level: newLevel } }
      );
      console.log(`  "${oldLevel}" → "${newLevel}": ${result.modifiedCount} user(s) updated`);
    }

    console.log('\nUser migration complete. Now run seedPromotionLevels.js to update promotion level documents.');
    process.exit(0);
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  }
}

migrate();
