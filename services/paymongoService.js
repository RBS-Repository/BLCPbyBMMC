import fetch from 'node-fetch';
import paymongoConfig from '../config/paymongo.js';

/**
 * PayMongo Service
 * Handles all interactions with the PayMongo API
 */
class PaymongoService {
  constructor() {
    this.baseUrl = paymongoConfig.apiUrl;
    this.secretKey = paymongoConfig.secretKey;
  }

  getHeaders() {
    return {
      'Authorization': `Basic ${Buffer.from(this.secretKey + ':').toString('base64')}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Create a payment intent
   * @param {Object} options - Payment intent options
   * @param {number} options.amount - Amount in smallest currency unit (e.g., cents)
   * @param {string} options.currency - Currency code (default: PHP)
   * @param {string} options.description - Payment description
   * @param {string} options.orderId - Your internal order ID
   * @returns {Promise<Object>} Payment intent data
   */
  async createPaymentIntent(options) {
    try {
      const { amount, currency = 'PHP', description, orderId } = options;
      
      const response = await fetch(`${this.baseUrl}/payment_intents`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          data: {
            attributes: {
              amount: amount * 100, // Convert to cents
              currency,
              description,
              statement_descriptor: 'Your Store Name',
              metadata: {
                order_id: orderId
              }
            }
          }
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.errors?.[0]?.detail || 'Failed to create payment intent');
      }
      
      return data.data;
    } catch (error) {
      console.error('PayMongo service error creating payment intent:', error);
      throw error;
    }
  }

  /**
   * Create a payment method
   * @param {Object} options - Payment method options
   * @param {string} options.type - Payment method type ('card', 'gcash', etc.)
   * @param {Object} options.details - Payment method details
   * @returns {Promise<Object>} Payment method data
   */
  async createPaymentMethod(options) {
    try {
      const { type, details } = options;
      
      const response = await fetch(`${this.baseUrl}/payment_methods`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          data: {
            attributes: {
              type,
              details
            }
          }
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.errors?.[0]?.detail || 'Failed to create payment method');
      }
      
      return data.data;
    } catch (error) {
      console.error('PayMongo service error creating payment method:', error);
      throw error;
    }
  }

  /**
   * Attach a payment method to a payment intent
   * @param {string} paymentIntentId - Payment intent ID
   * @param {string} paymentMethodId - Payment method ID
   * @param {string} returnUrl - URL to redirect after payment
   * @returns {Promise<Object>} Updated payment intent data
   */
  async attachPaymentMethod(paymentIntentId, paymentMethodId, returnUrl) {
    try {
      const response = await fetch(`${this.baseUrl}/payment_intents/${paymentIntentId}/attach`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          data: {
            attributes: {
              payment_method: paymentMethodId,
              return_url: returnUrl
            }
          }
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.errors?.[0]?.detail || 'Failed to attach payment method');
      }
      
      return data.data;
    } catch (error) {
      console.error('PayMongo service error attaching payment method:', error);
      throw error;
    }
  }

  /**
   * Create a payment source for e-wallet payments
   * @param {Object} options - Source options
   * @returns {Promise<Object>} Source data
   */
  async createSource(options) {
    try {
      const response = await fetch(`${this.baseUrl}/sources`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          data: {
            attributes: {
              amount: options.amount,
              currency: options.currency || 'PHP',
              type: options.type,
              redirect: options.redirect,
              billing: options.billing,
              metadata: options.metadata
            }
          }
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.errors?.[0]?.detail || 'Failed to create source');
      }

      return data.data;
    } catch (error) {
      console.error('PayMongo service error creating source:', error);
      throw error;
    }
  }

  /**
   * Retrieve a payment source
   * @param {string} sourceId - Source ID
   * @returns {Promise<Object>} Source data
   */
  async retrieveSource(sourceId) {
    try {
      const response = await fetch(`${this.baseUrl}/sources/${sourceId}`, {
        method: 'GET',
        headers: this.getHeaders()
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.errors?.[0]?.detail || 'Failed to retrieve source');
      }

      return data.data;
    } catch (error) {
      console.error('PayMongo service error retrieving source:', error);
      throw error;
    }
  }

  /**
   * Create a payment using a source
   * @param {Object} options - Payment options
   * @returns {Promise<Object>} Payment data
   */
  async createPayment(options) {
    try {
      const response = await fetch(`${this.baseUrl}/payments`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          data: {
            attributes: {
              amount: options.amount,
              currency: options.currency || 'PHP',
              source: {
                id: options.source,
                type: 'source'
              },
              description: options.description,
              statement_descriptor: 'Your Store Name',
              metadata: options.metadata
            }
          }
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.errors?.[0]?.detail || 'Failed to create payment');
      }

      return data.data;
    } catch (error) {
      console.error('PayMongo service error creating payment:', error);
      throw error;
    }
  }

  /**
   * Retrieve a payment
   * @param {string} paymentId - Payment ID
   * @returns {Promise<Object>} Payment data
   */
  async retrievePayment(paymentId) {
    try {
      const response = await fetch(`${this.baseUrl}/payments/${paymentId}`, {
        method: 'GET',
        headers: this.getHeaders()
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.errors?.[0]?.detail || 'Failed to retrieve payment');
      }
      
      return data.data;
    } catch (error) {
      console.error('PayMongo service error retrieving payment:', error);
      throw error;
    }
  }

  /**
   * Retrieve a payment intent
   * @param {string} paymentIntentId - Payment intent ID
   * @returns {Promise<Object>} Payment intent data
   */
  async retrievePaymentIntent(paymentIntentId) {
    try {
      const response = await fetch(`${this.baseUrl}/payment_intents/${paymentIntentId}`, {
        method: 'GET',
        headers: this.getHeaders()
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.errors?.[0]?.detail || 'Failed to retrieve payment intent');
      }
      
      return data.data;
    } catch (error) {
      console.error('PayMongo service error retrieving payment intent:', error);
      throw error;
    }
  }

  /**
   * Create a webhook
   * @param {Object} options - Webhook options
   * @param {Array<string>} options.events - Events to listen for
   * @param {string} options.url - Webhook URL
   * @returns {Promise<Object>} Webhook data
   */
  async createWebhook(options) {
    try {
      const { events, url } = options;
      
      const response = await fetch(`${this.baseUrl}/webhooks`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          data: {
            attributes: {
              events,
              url
            }
          }
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.errors?.[0]?.detail || 'Failed to create webhook');
      }
      
      return data.data;
    } catch (error) {
      console.error('PayMongo service error creating webhook:', error);
      throw error;
    }
  }
}

export default new PaymongoService(); 