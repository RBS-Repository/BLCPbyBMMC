import express from 'express';
import { body, validationResult } from 'express-validator';
import { auth } from '../middleware/auth.js';
import paymongoService from '../services/paymongoService.js';
import Order from '../models/Order.js';
import crypto from 'crypto';
import paymongoConfig from '../config/paymongo.js';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Product from '../models/Product.js';

dotenv.config();

const router = express.Router();

/**
 * Create a PayMongo payment intent
 * POST /api/payments/intent
 */
router.post('/intent', 
  auth, 
  [
    body('amount').isNumeric().withMessage('Amount must be a number'),
    body('orderId').not().isEmpty().withMessage('Order ID is required'),
    body('description').not().isEmpty().withMessage('Description is required')
  ],
  async (req, res) => {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { amount, orderId, description } = req.body;

      // Create payment intent
      const paymentIntent = await paymongoService.createPaymentIntent({
        amount: Number(amount),
        description,
        orderId
      });

      res.json({
        success: true,
        clientKey: paymentIntent.attributes.client_key,
        paymentIntentId: paymentIntent.id,
        data: paymentIntent
      });
    } catch (error) {
      console.error('Error creating payment intent:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message || 'Failed to create payment intent' 
      });
    }
  }
);

/**
 * Create a PayMongo source for e-wallet payments
 * POST /api/payments/source
 */
router.post('/source',
  auth,
  [
    body('amount').isNumeric().withMessage('Amount must be a number'),
    body('type').isIn(['gcash', 'grab_pay', 'maya']).withMessage('Invalid payment type'),
    body('orderId').not().isEmpty().withMessage('Order ID is required'),
    body('successUrl').custom(value => {
      if (!value || typeof value !== 'string') {
        throw new Error('Success URL is required');
      }
      try {
        new URL(value);
        return true;
      } catch (e) {
        throw new Error('Invalid success URL format');
      }
    }),
    body('failureUrl').custom(value => {
      if (!value || typeof value !== 'string') {
        throw new Error('Failure URL is required');
      }
      try {
        new URL(value);
        return true;
      } catch (e) {
        throw new Error('Invalid failure URL format');
      }
    })
  ],
  async (req, res) => {
    try {
      console.log('Payment source request:', {
        amount: req.body.amount,
        type: req.body.type,
        orderId: req.body.orderId,
        billing: req.body.billing,
        successUrl: req.body.successUrl,
        failureUrl: req.body.failureUrl
      });

      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.error('Validation errors:', errors.array());
        return res.status(400).json({ errors: errors.array() });
      }

      const { amount, type, orderId, successUrl, failureUrl, billing } = req.body;

      // Create payment source
      const source = await paymongoService.createSource({
        amount: Number(amount),
        type,
        currency: 'PHP',
        redirect: {
          success: successUrl,
          failed: failureUrl
        },
        billing,
        metadata: {
          order_id: orderId,
          user_id: req.user.uid
        }
      });

      // Update order with payment details
      await Order.findByIdAndUpdate(orderId, {
        'payment.sourceId': source.id,
        'payment.method': type,
        'payment.status': 'pending'
      });

      res.json({
        success: true,
        sourceId: source.id,
        checkoutUrl: source.attributes.redirect.checkout_url,
        data: source
      });
    } catch (error) {
      console.error('Error creating payment source:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create payment source'
      });
    }
  }
);

/**
 * Verify PayMongo webhook signature
 * @param {string} payload - Request body as string
 * @param {string} signature - Signature from PayMongo
 * @returns {boolean} Whether signature is valid
 */
const verifyWebhookSignature = (payload, signature) => {
  try {
    const hmac = crypto.createHmac('sha256', paymongoConfig.webhookSecret);
    const digest = hmac.update(payload).digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(digest),
      Buffer.from(signature)
    );
  } catch (error) {
    console.error('Error verifying webhook signature:', error);
    return false;
  }
};

/**
 * Handle PayMongo webhooks
 * POST /api/payments/webhook
 */
router.post('/webhook',
  async (req, res) => {
    try {
      const event = req.body;
      console.log('Received webhook event:', event.type);

      switch (event.type) {
        case 'source.chargeable':
          await handleChargeableSource(event.data);
          break;

        case 'payment.paid':
          await handleSuccessfulPayment(event.data);
          break;

        case 'payment.failed':
          await handleFailedPayment(event.data);
          break;
      }

      res.json({ received: true });
    } catch (error) {
      console.error('Webhook processing error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }
);

// Helper functions for webhook handling
async function handleChargeableSource(data) {
  try {
    const orderId = data.attributes.metadata.order_id;
    const order = await Order.findById(orderId);
    
    if (!order) {
      console.error('Order not found:', orderId);
      return;
    }

    // Create payment from source
    const payment = await paymongoService.createPayment({
      amount: data.attributes.amount,
      currency: data.attributes.currency,
      source: data.id,
      description: `Payment for Order #${orderId}`,
      metadata: {
        order_id: orderId
      }
    });

    await Order.findByIdAndUpdate(orderId, {
      'payment.status': 'processing',
      'payment.paymentId': payment.id
    });
  } catch (error) {
    console.error('Error handling chargeable source:', error);
  }
}

async function handleSuccessfulPayment(data) {
  try {
    const paymentMethod = data.attributes.source.type;
    const orderId = data.attributes.metadata.order_id;
    
    // Map Paymongo's API values to our internal values
    const methodMap = {
      'gcash': 'gcash',
      'grab_pay': 'grab_pay',
      'paymaya': 'maya',
      'card': 'card',
      'paymongo': 'card' // Fallback for legacy values
    };

    console.log('Raw payment method from PayMongo:', data.attributes.source.type);
    console.log('Mapped payment method:', methodMap[paymentMethod]);
    console.log('Order update payload:', {
      'payment.method': methodMap[paymentMethod] || 'card',
      'payment.status': 'paid',
      'status': 'processing'
    });

    await Order.findByIdAndUpdate(orderId, {
      'payment.method': methodMap[paymentMethod] || 'card',
      'payment.status': 'paid',
      'status': 'processing'
    });
  } catch (error) {
    console.error('Error handling successful payment:', error);
  }
}

async function handleFailedPayment(data) {
  try {
    const orderId = data.attributes.metadata.order_id;
    await Order.findByIdAndUpdate(orderId, {
      'payment.status': 'failed',
      'status': 'cancelled'
    });

    // Restore stock
    const order = await Order.findById(orderId);
    await Product.bulkWrite(order.items.map(item => ({
      updateOne: {
        filter: { _id: new mongoose.Types.ObjectId(item.product) },
        update: { $inc: { stock: item.quantity } }
      }
    })));
    
    await Order.updateOne(
      { _id: order._id },
      { status: 'cancelled', 'payment.status': 'failed' }
    );
  } catch (error) {
    console.error('Error handling failed payment:', error);
  }
}

/**
 * Check payment status
 * GET /api/payments/status/:orderId
 */
router.get('/status/:orderId',
  auth,
  async (req, res) => {
    try {
      const { orderId } = req.params;

      // Find order
      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // If it's a source payment, check source status
      if (order.payment.sourceId) {
        const source = await paymongoService.retrieveSource(order.payment.sourceId);
        const status = source.attributes.status;

        // Update order status based on source status
        if (status === 'chargeable' || status === 'paid') {
          await Order.findByIdAndUpdate(orderId, {
            'payment.status': 'paid',
            'status': 'processing'
          });
        } else if (status === 'expired' || status === 'cancelled') {
          await Order.findByIdAndUpdate(orderId, {
            'payment.status': 'failed',
            'status': 'cancelled'
          });
        }

        return res.json({
          success: true,
          paymentStatus: status === 'chargeable' || status === 'paid' ? 'paid' : status,
          orderStatus: order.status
        });
      }

      // For other payment methods
      res.json({
        success: true,
        paymentStatus: order.payment.status,
        orderStatus: order.status
      });
    } catch (error) {
      console.error('Error checking payment status:', error);
      res.status(500).json({ error: 'Failed to check payment status' });
    }
  }
);

// Test route
router.get('/test', (req, res) => {
  res.json({ message: 'PayMongo route working' });
});

// Create payment link
router.post('/create-link', auth, async (req, res) => {
  try {
    const {
      amount,
      description,
      remarks,
      success_url,
      cancel_url,
      metadata
    } = req.body;

    console.log('Creating PayMongo checkout:', {
      amount,
      description,
      metadata
    });

    // Format the amount to be in cents and ensure it's an integer
    const amountInCents = Math.round(parseFloat(amount) * 100);

    const response = await fetch('https://api.paymongo.com/v1/checkout_sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(process.env.PAYMONGO_SECRET_KEY).toString('base64')}`
      },
      body: JSON.stringify({
        data: {
          attributes: {
            description: description || remarks,
            line_items: [{
              currency: 'PHP',
              amount: amountInCents,
              name: description,
              quantity: 1,
              description: remarks || description
            }],
            payment_method_types: ['card', 'gcash', 'grab_pay', 'paymaya'],
            success_url,
            cancel_url,
            reference_number: metadata.orderId,
            send_email_receipt: true,
            show_description: true,
            show_line_items: true,
            billing: {
              name: metadata.customerName,
              email: metadata.customerEmail
            },
            metadata: {
              orderId: metadata.orderId,
              userId: metadata.userId,
              customerName: metadata.customerName,
              customerEmail: metadata.customerEmail
            }
          }
        }
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('PayMongo error:', data);
      throw new Error(data.errors?.[0]?.detail || 'Failed to create checkout session');
    }

    console.log('Checkout session created:', data);

    // Update order with checkout session ID
    await Order.findByIdAndUpdate(metadata.orderId, {
      'payment.checkoutId': data.data.id,
      'payment.status': 'pending'
    });

    res.json({
      checkoutUrl: data.data.attributes.checkout_url
    });

  } catch (error) {
    console.error('Payment error:', error);
    res.status(400).json({ 
      error: error.response?.data?.errors?.[0]?.detail || error.message || 'Failed to create checkout'
    });
  }
});

export default router; 