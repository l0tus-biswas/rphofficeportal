const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const SystemConfig = require('../models/SystemConfig');

async function checkBranding() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const configs = await SystemConfig.find({ 
      key: { $in: ['app_name', 'app_logo'] } 
    });

    if (configs.length === 0) {
      console.log('❌ No branding configurations found!');
      console.log('Creating default app_name...\n');
      
      await SystemConfig.create({
        key: 'app_name',
        value: 'Escape',
        category: 'application',
        description: 'Application name',
        isEditable: true,
        isSecret: false
      });
      
      console.log('✅ Created app_name = "Escape"');
    } else {
      console.log('Current branding configurations:');
      configs.forEach(config => {
        console.log(`  ${config.key}: "${config.value}"`);
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkBranding();
