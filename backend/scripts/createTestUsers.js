const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');

async function createTestUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Create Admin
    const admin = await User.create({
      name: 'Admin User',
      email: 'admin@test.com',
      password: 'admin123',
      phone: '1111111111',
      role: 'admin',
      isActive: true
    });
    console.log('✅ Admin created:', admin.email, '/ admin123');
    console.log('   Referral Code:', admin.referralCode);

    // Create Agent 1
    const agent1 = await User.create({
      name: 'Agent One',
      email: 'agent1@test.com',
      password: 'agent123',
      phone: '2222222222',
      role: 'agent',
      isActive: true
    });
    console.log('\n✅ Agent 1 created:', agent1.email, '/ agent123');
    console.log('   Referral Code:', agent1.referralCode);

    // Create Agent 2
    const agent2 = await User.create({
      name: 'Agent Two',
      email: 'agent2@test.com',
      password: 'agent123',
      phone: '3333333333',
      role: 'agent',
      referredBy: admin._id,
      isActive: true
    });
    admin.children.push(agent2._id);
    await admin.save();
    console.log('✅ Agent 2 created:', agent2.email, '/ agent123');
    console.log('   Referral Code:', agent2.referralCode);
    console.log('   Referred by:', admin.name);

    // Create Recruit 1 (under Agent 1)
    const recruit1 = await User.create({
      name: 'Recruit One',
      email: 'recruit1@test.com',
      password: 'recruit123',
      phone: '4444444444',
      role: 'recruit',
      referredBy: agent1._id,
      isActive: true
    });
    agent1.children.push(recruit1._id);
    await agent1.save();
    console.log('\n✅ Recruit 1 created:', recruit1.email, '/ recruit123');
    console.log('   Referred by:', agent1.name);

    // Create Recruit 2 (under Agent 1)
    const recruit2 = await User.create({
      name: 'Recruit Two',
      email: 'recruit2@test.com',
      password: 'recruit123',
      phone: '5555555555',
      role: 'recruit',
      referredBy: agent1._id,
      isActive: true
    });
    agent1.children.push(recruit2._id);
    await agent1.save();
    console.log('✅ Recruit 2 created:', recruit2.email, '/ recruit123');
    console.log('   Referred by:', agent1.name);

    // Create Recruit 3 (under Agent 2)
    const recruit3 = await User.create({
      name: 'Recruit Three',
      email: 'recruit3@test.com',
      password: 'recruit123',
      phone: '6666666666',
      role: 'recruit',
      referredBy: agent2._id,
      isActive: true
    });
    agent2.children.push(recruit3._id);
    await agent2.save();
    console.log('✅ Recruit 3 created:', recruit3.email, '/ recruit123');
    console.log('   Referred by:', agent2.name);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Test users created successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\nHierarchy:');
    console.log('Admin');
    console.log('└── Agent Two (agent2@test.com)');
    console.log('    └── Recruit Three (recruit3@test.com)');
    console.log('\nAgent One (agent1@test.com)');
    console.log('├── Recruit One (recruit1@test.com)');
    console.log('└── Recruit Two (recruit2@test.com)');
    console.log('\n');

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

createTestUsers();
