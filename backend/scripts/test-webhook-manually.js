require('dotenv').config();
const axios = require('axios');

/**
 * Manually trigger DocuSign webhook for testing
 * This simulates what DocuSign would send when a document is completed
 */

async function testWebhook() {
  try {
    const envelopeId = process.argv[2];
    
    if (!envelopeId) {
      console.error('❌ Please provide envelope ID as argument');
      console.log('Usage: node test-webhook-manually.js <ENVELOPE_ID>');
      console.log('Example: node test-webhook-manually.js ENVELOPE_1766662609741');
      process.exit(1);
    }

    const webhookUrl = `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/public/apa-application/docusign-webhook`;
    
    console.log('=== Testing DocuSign Webhook ===');
    console.log('Webhook URL:', webhookUrl);
    console.log('Envelope ID:', envelopeId);
    console.log('');

    // Simulate DocuSign webhook payload for completed envelope
    const webhookPayload = {
      event: 'envelope-completed',
      apiVersion: 'v2.1',
      uri: `/restapi/v2.1/accounts/ACCOUNT_ID/envelopes/${envelopeId}`,
      retryCount: 0,
      configurationId: '12345',
      generatedDateTime: new Date().toISOString(),
      data: {
        accountId: process.env.DOCUSIGN_ACCOUNT_ID || 'ACCOUNT_ID',
        userId: process.env.DOCUSIGN_USER_ID || 'USER_ID',
        envelopeId: envelopeId,
        envelopeSummary: {
          status: 'completed',
          emailSubject: 'Please sign your Agent Partnership Agreement',
          envelopeId: envelopeId,
          completedDateTime: new Date().toISOString(),
          statusChangedDateTime: new Date().toISOString(),
          recipients: {
            signers: [
              {
                status: 'completed',
                completedDateTime: new Date().toISOString()
              }
            ]
          }
        }
      }
    };

    console.log('Sending webhook payload:');
    console.log(JSON.stringify(webhookPayload, null, 2));
    console.log('');

    const response = await axios.post(webhookUrl, webhookPayload, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Webhook Response:');
    console.log('Status:', response.status);
    console.log('Data:', response.data);
    console.log('');
    console.log('✅ Webhook triggered successfully!');
    console.log('Check your terminal running the backend to see the webhook processing logs.');
    console.log('Check your email for the payment setup email.');

  } catch (error) {
    console.error('❌ Error triggering webhook:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    process.exit(1);
  }
}

testWebhook();
