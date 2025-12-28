const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const SystemConfig = require('../models/SystemConfig');

async function seedBrandingConfig() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Check if branding configs already exist
    const appNameExists = await SystemConfig.findOne({ key: 'app_name' });

    if (!appNameExists) {
      await SystemConfig.create({
        key: 'app_name',
        value: 'Escape',
        category: 'application',
        description: 'Application name displayed throughout the application',
        isEditable: true,
        isSecret: false
      });
      console.log('✅ Created app_name configuration');
    } else {
      console.log('ℹ️  app_name configuration already exists');
    }

    console.log('\n✅ Branding configuration seeded successfully!');
    console.log('ℹ️  Note: Upload a logo via Admin > Branding Management to set the app logo');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding branding configuration:', error);
    process.exit(1);
  }
}

seedBrandingConfig();
