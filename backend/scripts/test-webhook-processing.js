require('dotenv').config();
const { processWebhook } = require('../utils/docusign');

// Test with the actual webhook payload from DocuSign
const testPayload = {
  "event": "envelope-completed",
  "apiVersion": "v2.1",
  "uri": "/restapi/v2.1/accounts/732f99f9-4a0a-4d59-9643-b5faed2026b8/envelopes/4d3420b8-ce24-8a0a-8135-63c9bb1d0c7e",
  "retryCount": 0,
  "configurationId": 22028153,
  "generatedDateTime": "2026-01-13T07:09:58.9584687Z",
  "data": {
    "accountId": "732f99f9-4a0a-4d59-9643-b5faed2026b8",
    "userId": "fdb7fd81-065c-44f0-8376-daa56da18c13",
    "envelopeId": "4d3420b8-ce24-8a0a-8135-63c9bb1d0c7e"
  }
};

async function testWebhookProcessing() {
  console.log('Testing webhook processing with actual DocuSign payload...\n');
  console.log('Input Payload:', JSON.stringify(testPayload, null, 2));
  
  try {
    const result = await processWebhook(testPayload);
    console.log('\n✅ Processed webhook successfully!');
    console.log('Result:', JSON.stringify(result, null, 2));
    
    if (result.status === 'completed') {
      console.log('\n✅ Status correctly mapped to "completed"');
    } else {
      console.log('\n❌ Status NOT correctly mapped. Got:', result.status);
    }
    
    if (result.appStatus === 'pending_payment') {
      console.log('✅ App status correctly mapped to "pending_payment"');
    } else {
      console.log('❌ App status NOT correctly mapped. Got:', result.appStatus);
    }
  } catch (error) {
    console.error('❌ Error processing webhook:', error.message);
  }
}

testWebhookProcessing();
