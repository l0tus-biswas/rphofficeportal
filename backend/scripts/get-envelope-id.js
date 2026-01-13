require('dotenv').config();
const mongoose = require('mongoose');
const APAApplication = require('../models/APAApplication');

async function getEnvelopeId() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const application = await APAApplication.findOne({ 
      'docusign.status': 'completed' 
    }).sort({ 'docusign.signedDate': -1 });

    if (application) {
      console.log(application.docusign.envelopeId);
    } else {
      console.error('No completed application found');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

getEnvelopeId();
