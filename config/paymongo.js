import dotenv from 'dotenv';

dotenv.config();

// PayMongo API Keys
const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;
const PAYMONGO_PUBLIC_KEY = process.env.PAYMONGO_PUBLIC_KEY;

// PayMongo API Base URL
const PAYMONGO_API_URL = 'https://api.paymongo.com/v1';

// Webhook signing secret for verifying PayMongo webhook events
const PAYMONGO_WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET;

// Supported payment methods
const PAYMENT_METHODS = {
  CARD: 'card',
  GCASH: 'gcash',
  GRAB_PAY: 'grab_pay',
  PAYMAYA: 'paymaya'
};

// Export configuration
export default {
  secretKey: PAYMONGO_SECRET_KEY,
  publicKey: PAYMONGO_PUBLIC_KEY,
  apiUrl: PAYMONGO_API_URL,
  webhookSecret: PAYMONGO_WEBHOOK_SECRET,
  paymentMethods: PAYMENT_METHODS,
  
  // Base64 encoded API key for authorization header
  getAuthHeader: () => {
    return `Basic ${Buffer.from(PAYMONGO_SECRET_KEY + ':').toString('base64')}`;
  }
}; 