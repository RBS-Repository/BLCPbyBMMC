import express from 'express';
import Order from '../models/Order.js';
import OrderHistory from '../models/OrderHistory.js';
import { auth } from '../middleware/auth.js';
import { adminOnly } from '../middleware/adminOnly.js';
import mongoose from 'mongoose';
import Product from '../models/Product.js';
import Cart from '../models/Cart.js';
import { updateSalesData, getDashboardStats, getLast30DaysSales } from '../services/salesService.js';
import Sales from '../models/Sales.js';
import Referral from '../models/Referral.js';
import Reward from '../models/Reward.js';
import axios from 'axios';
import jwt from 'jsonwebtoken';

const router = express.Router();

console.log('Orders routes loaded');

// Add this at the top of the file
console.log('Orders route paths:');
router.stack.forEach(layer => {
  if (layer.route) {
    console.log(`${layer.route.methods} ${layer.route.path}`);
  }
});

// Create new order
router.post('/', auth, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    console.log('Received order data:', JSON.stringify(req.body, null, 2));
    
    // Validate required fields
    if (!req.body.shipping?.address || !req.body.shipping?.city) {
      throw new Error('Missing required shipping information');
    }

    const { 
      shippingDetails, 
      paymentMethod, 
      items, 
      subtotal, 
      tax, 
      shipping, 
      total,
      rewardId,     // New field for reward redemption
      rewardAmount  // Amount of reward applied
    } = req.body;

    const orderData = {
      ...req.body,
      user: req.user.uid,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // 1. Verify stock availability first
    const stockUpdates = [];
    for (const item of orderData.items) {
      const product = await Product.findById(item.product).session(session);
      if (!product) throw new Error(`Product ${item.product} not found`);
      
      if (product.stock < item.quantity) {
        throw {
          message: 'Insufficient stock',
          productId: item.product,
          available: product.stock,
          requested: item.quantity
        };
      }
      stockUpdates.push({
        updateOne: {
          filter: { _id: new mongoose.Types.ObjectId(item.product) },
          update: { $inc: { stock: -item.quantity } }
        }
      });
    }

    // 2. Perform bulk stock update
    if (stockUpdates.length > 0) {
      await Product.bulkWrite(stockUpdates, { session });
    }

    // 3. Create order
    const order = new Order(orderData);
    await order.save({ session });

    // If order is created with paid status, update sales data immediately
    if (order.payment && order.payment.status === 'paid') {
      console.log('Order created with paid status, updating sales data');
      await updateSalesData(order);
      console.log('Sales data update complete');
    }

    // 4. Create history entry
    const historyEntry = new OrderHistory({
      orderId: order._id,
      userId: req.user.uid,
      customerName: orderData.customerName,
      orderNumber: orderData.orderNumber,
      items: orderData.items,
      summary: orderData.summary,
      shipping: orderData.shipping,
      payment: orderData.payment,
      status: orderData.status,
      paymentStatus: orderData.paymentStatus,
      action: 'status_update',
      details: { message: 'Order created' },
      createdAt: orderData.createdAt,
      storedAt: new Date()
    });
    await historyEntry.save({ session });

    // After successful order creation
    await Cart.deleteOne({ user: req.user.uid });

    // If a reward was applied, include it in the order
    if (rewardId && rewardAmount) {
      // Save reward info with the order
      orderData.rewardApplied = {
        rewardId,
        amount: rewardAmount
      };
      
      // Double-check that the reward is actually used
      await Referral.updateOne(
        { 'rewards._id': rewardId },
        { 
          $set: { 
            'rewards.$.used': true,
            'rewards.$.redeemedAt': new Date(),
            'rewards.$.redeemedAmount': rewardAmount
          } 
        }
      );
    }

    await session.commitTransaction();
    res.status(201).json(order);

  } catch (error) {
    console.error('Order creation failed:', error);
    await session.abortTransaction();
    
    if (error.message === 'Insufficient stock') {
      return res.status(400).json({
        error: 'Insufficient stock',
        productId: error.productId,
        available: error.available,
        requested: error.requested
      });
    }
    
    res.status(400).json({ 
      error: error.message,
      validationErrors: error.errors // If using mongoose validation
    });
  } finally {
    session.endSession();
  }
});

// Get all orders (admin)
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const orders = await Order.find()
      .populate('items.product')
      .sort({ createdAt: -1 });
      
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user's orders (from orders collection)
router.get('/user-orders', auth, async (req, res) => {
  try {
    console.log('Fetching orders for user:', req.user.uid);
    
    if (!req.user?.uid) {
      return res.status(401).json({ error: 'User ID not found' });
    }

    const orders = await Order.find({ user: req.user.uid })
      .populate({
        path: 'items.product',
        select: 'name price images' // Only select needed fields
      })
      .sort({ createdAt: -1 })
      .lean(); // Convert to plain JS objects for better performance
    
    console.log(`Found ${orders.length} orders for user ${req.user.uid}`);
    
    // Transform dates to ISO strings for consistent formatting
    const formattedOrders = orders.map(order => ({
      ...order,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt?.toISOString()
    }));

    res.json(formattedOrders);
  } catch (error) {
    console.error('Error fetching user orders:', error);
    res.status(500).json({ 
      error: 'Failed to fetch orders',
      details: error.message 
    });
  }
});

// Update order status (admin)
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    // Validate the status value
    const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        error: 'Invalid status value', 
        message: `Status must be one of: ${validStatuses.join(', ')}` 
      });
    }

    console.log(`Attempting to update order ${id} status to ${status}`);
    
    // Find the order first to get previous status
    const existingOrder = await Order.findById(id);
    if (!existingOrder) {
      console.log(`Order not found with ID: ${id}`);
      return res.status(404).json({ error: 'Order not found' });
    }

    // Store previous status for history
    const previousStatus = existingOrder.status;

    // Use findByIdAndUpdate to bypass schema validation issues
    const order = await Order.findByIdAndUpdate(
      id,
      { 
        $set: { 
          status: status,
          updatedAt: new Date()
        } 
      },
      { new: true, runValidators: false }
    );

    if (!order) {
      return res.status(404).json({ error: 'Failed to update order' });
    }
    
    // Create history entry
    try {
      await OrderHistory.create({
        orderId: order._id,
        userId: req.user.uid,
        action: 'status_update',
        details: {
          from: previousStatus,
          to: status
        },
        timestamp: new Date()
      });
    } catch (historyError) {
      console.error('Failed to create history entry with new format:', historyError);
      try {
        await OrderHistory.create({
          orderId: order._id,
          userId: req.user.uid,
          status: status,
          updatedBy: req.user.uid,
          storedAt: new Date()
        });
      } catch (fallbackError) {
        console.error('Failed to create history entry with old format:', fallbackError);
        // Continue anyway - order status is updated, history is secondary
      }
    }
    
    res.json(order);
  } catch (error) {
    console.error('Order status update error:', error);
    res.status(500).json({ 
      error: 'Server error',
      message: error.message || 'An unexpected error occurred updating the order status'
    });
  }
});

// Update tracking number (admin)
router.put('/:id/tracking', auth, adminOnly, async (req, res) => {
  try {
    const { trackingNumber } = req.body;
    
    if (!trackingNumber) {
      return res.status(400).json({ error: 'Tracking number is required' });
    }
    
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { trackingNumber: trackingNumber },
      { new: true }
    );
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Also update the order in history
    try {
      await OrderHistory.findOneAndUpdate(
        { orderId: req.params.id },
        { trackingNumber }
      );
    } catch (historyError) {
      console.error('Failed to update tracking number in history:', historyError);
    }
    
    // Send tracking number update notification to customer if order is shipped
    if (order.status === 'shipped') {
      try {
        // This is where you would integrate with your email service
        console.log(`Sending tracking number notification to ${order.shipping.email}`);
        // Example: sendEmail('tracking_update', order.shipping.email, { trackingNumber, orderNumber: order._id });
      } catch (emailError) {
        console.error('Failed to send tracking notification:', emailError);
      }
    }
    
    res.json(order);
  } catch (err) {
    console.error('Error updating tracking number:', err);
    res.status(500).json({ error: err.message });
  }
});

// Process refund (admin)
router.post('/:id/refund', auth, adminOnly, async (req, res) => {
  try {
    const { amount, reason } = req.body;
    
    if (!amount) {
      return res.status(400).json({ error: 'Refund amount is required' });
    }
    
    if (!reason) {
      return res.status(400).json({ error: 'Refund reason is required' });
    }
    
    // Find the order
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Add refund information to the order
    const updatedOrder = await Order.findByIdAndUpdate(
      req.params.id,
      { 
        $push: { 
          refunds: { 
            amount: parseFloat(amount), 
            reason, 
            date: new Date(),
            processedBy: req.user.uid
          } 
        },
        $set: { 
          refundStatus: 'processed',
          status: 'refunded'  // Optionally change order status
        }
      },
      { new: true }
    );
    
    // Update order history
    try {
      await OrderHistory.findOneAndUpdate(
        { orderId: req.params.id },
        { 
          $push: { 
            refunds: { 
              amount: parseFloat(amount), 
              reason, 
              date: new Date(),
              processedBy: req.user.uid
            } 
          },
          $set: { 
            refundStatus: 'processed',
            status: 'refunded'
          }
        }
      );
    } catch (historyError) {
      console.error('Failed to update refund in history:', historyError);
    }
    
    // Send refund notification to customer
    try {
      // This is where you would integrate with your email service
      console.log(`Sending refund notification to ${order.shipping.email}`);
      // Example: sendEmail('refund_processed', order.shipping.email, { amount, orderNumber: order._id });
    } catch (emailError) {
      console.error('Failed to send refund notification:', emailError);
    }
    
    res.json(updatedOrder);
  } catch (err) {
    console.error('Error processing refund:', err);
    res.status(500).json({ error: err.message });
  }
});

// Resend order confirmation (admin)
router.post('/:id/resend-confirmation', auth, adminOnly, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('items.product');
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Send confirmation email to customer
    try {
      // This is where you would integrate with your email service
      console.log(`Resending order confirmation to ${order.shipping.email}`);
      // Example: sendEmail('order_confirmation', order.shipping.email, { order });
      
      // Record that confirmation was resent
      await Order.findByIdAndUpdate(
        req.params.id,
        { 
          $push: { 
            confirmationEmailHistory: {
              sentAt: new Date(),
              sentBy: req.user.uid
            }
          }
        }
      );
    } catch (emailError) {
      console.error('Failed to resend confirmation email:', emailError);
      return res.status(500).json({ error: 'Failed to send confirmation email' });
    }
    
    res.json({ success: true, message: 'Confirmation email resent successfully' });
  } catch (err) {
    console.error('Error resending confirmation:', err);
    res.status(500).json({ error: err.message });
  }
});

// Check order existence (admin)
router.get('/check/:id', auth, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`Checking if order ${id} exists`);
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }
    
    const exists = await Order.exists({ _id: id });
    console.log(`Order ${id} exists: ${exists !== null}`);
    
    if (!exists) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    res.json({ exists: true });
  } catch (err) {
    console.error('Order check error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get order by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const orderId = req.params.id;
    
    // Validate if the ID format is correct for MongoDB
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ error: 'Invalid order ID format' });
    }
    
    const order = await Order.findById(orderId);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Check if the order belongs to this user (security measure)
    // Only admins or the order owner can view details
    if (order.user !== req.user.uid && !req.user.admin) {
      return res.status(403).json({ error: 'You do not have permission to view this order' });
    }
    
    res.json(order);
  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).json({ error: 'Failed to fetch order details' });
  }
});

// Update payment status
router.patch('/:id/payment-status', auth, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!['pending', 'paid', 'failed', 'refunded'].includes(status)) {
      return res.status(400).json({ error: 'Invalid payment status' });
    }
    
    const updatedOrder = await Order.findByIdAndUpdate(
      id,
      { 
        'payment.status': status,
        ...(status === 'paid' ? { 'payment.paidAt': new Date() } : {})
      },
      { new: true }
    );
    
    if (!updatedOrder) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // If order is marked as paid, update sales data
    if (status === 'paid') {
      await updateSalesData(updatedOrder);
      
      // Also process referral rewards
      try {
        await processReferralReward(updatedOrder);
        
        // Automatically save the reward to MongoDB for redemption
        await saveReferralRewardToMongoDB(updatedOrder);
      } catch (rewardError) {
        console.error('Error processing rewards:', rewardError);
        // Don't block the payment status update
      }
    }
    
    res.json(updatedOrder);

  } catch (error) {
    console.error('Payment status update error:', error);
    res.status(500).json({ 
      error: 'Failed to update payment status',
      details: error.message 
    });
  }
});

// Delete order route (keep this after specific routes)
router.delete('/:id', auth, adminOnly, async (req, res) => {
  console.log('Delete request details:', {
    orderId: req.params.id,
    user: req.user,
    time: new Date().toISOString()
  });
  
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }

    const order = await Order.findById(req.params.id)
      .populate('items.product')
      .lean();

    if (!order) {
      return res.status(404).json({ error: `Order ${req.params.id} not found` });
    }

    console.log('Deleting order:', {
      id: order._id,
      items: order.items.length,
      total: order.total
    });
    
    const result = await Order.deleteOne({ _id: req.params.id });
    console.log('Delete result:', result);
    
    await OrderHistory.deleteMany({ orderId: req.params.id });
    
    res.json({ message: 'Order deleted', deletedCount: result.deletedCount });
  } catch (err) {
    console.error('Full error:', err);
    res.status(500).json({ 
      error: 'Deletion failed',
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }

  console.log('MongoDB connection state:', mongoose.connection.readyState);
  console.log('Available collections:', 
    Object.keys(mongoose.connection.collections).join(', '));
});

// Debug route - Get all orders for a user (including regular orders)
router.get('/debug/:userId', auth, adminOnly, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.params.userId });
    const history = await OrderHistory.find({ userId: req.params.userId });
    
    res.json({
      orders: orders.length,
      history: history.length,
      orderDetails: orders,
      historyDetails: history
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add a new route for dashboard statistics
router.get('/dashboard/stats', auth, adminOnly, async (req, res) => {
  try {
    // Get efficient dashboard stats from sales service
    const stats = await getDashboardStats();
    
    // Get pending orders count
    const pendingOrders = await Order.countDocuments({ status: 'pending' });
    
    // Get recent orders 
    const recentOrders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('_id createdAt shipping.firstName shipping.lastName summary.total status')
      .lean();
    
    res.json({
      sales: {
        daily: stats.daily.total,
        weekly: stats.weekly.total,
        monthly: stats.monthly.total,
        pending: pendingOrders
      },
      recentOrders,
      topProducts: stats.topProducts
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to get dashboard statistics' });
  }
});

// Add a test route to manually create a sales document
router.post('/test-sales', auth, adminOnly, async (req, res) => {
  try {
    const today = new Date();
    const day = today.getDate();
    const month = today.getMonth() + 1;
    const year = today.getFullYear();
    
    // Create a test sales document
    const testSales = new Sales({
      date: today,
      day,
      month,
      year,
      dailySales: {
        total: 1000,
        count: 1
      },
      productsSold: [
        {
          name: 'Test Product',
          quantity: 1,
          revenue: 1000
        }
      ],
      paymentMethods: {
        gcash: {
          count: 1,
          amount: 1000
        }
      }
    });
    
    await testSales.save();
    res.json({ message: 'Test sales document created', sales: testSales });
  } catch (error) {
    console.error('Error creating test sales:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add this new route
router.get('/sales/last-30-days', async (req, res) => {
  try {
    const salesData = await getLast30DaysSales();
    if (!salesData) {
      return res.status(404).json({ message: 'No sales data found' });
    }
    res.json(salesData);
  } catch (error) {
    console.error('Error fetching 30-day sales:', error);
    res.status(500).json({ message: 'Error fetching sales data' });
  }
});

// Get orders for a referred user (for referral program)
router.get('/user-referred-orders/:userId', auth, async (req, res) => {
  console.log('Received request for referred user orders:', req.params.userId, 'from referrer:', req.user.uid);
  
  try {
    const { userId } = req.params;
    const referrerId = req.user.uid;
    
    // First verify that the requested userId was actually referred by the current user
    // This prevents users from accessing orders of users they didn't refer
    const referralCheck = await Referral.findOne({ 
      referrerId: referrerId, 
      referredUserId: userId 
    });
    
    console.log('Referral check result:', referralCheck);
    
    if (!referralCheck) {
      console.log('Unauthorized access attempt - referral record not found');
      return res.status(403).json({ 
        error: 'Unauthorized. You can only view orders for users you have referred.' 
      });
    }
    
    // Fetch orders for the referred user
    const orders = await Order.find({ user: userId })
      .populate({
        path: 'items.product',
        select: 'name price images' // Only select needed fields
      })
      .sort({ createdAt: -1 })
      .lean();
    
    console.log(`Found ${orders.length} orders for referred user`);
    
    // Format order data to match the expected format in the frontend
    const formattedOrders = orders.map(order => ({
      _id: order._id,
      createdAt: order.createdAt.toISOString(),
      status: order.status,
      payment: order.payment,
      summary: order.summary,
      items: order.items.map(item => ({
        name: item.product?.name || 'Product',
        price: item.product?.price || item.price || 0,
        quantity: item.quantity,
        image: item.product?.images?.[0] || null
      }))
    }));

    res.json(formattedOrders);
  } catch (error) {
    console.error('Error fetching referred user orders:', error);
    res.status(500).json({ 
      error: 'Failed to fetch orders',
      details: error.message 
    });
  }
});

// Add this to debug available routes at startup
console.log("Available routes in orders.js:");
router.stack.forEach(layer => {
  if (layer.route) {
    const methods = Object.keys(layer.route.methods).join(',');
    console.log(`${methods.toUpperCase()} ${layer.route.path}`);
  }
});

// Add this after an order is successfully completed
const processReferralReward = async (order) => {
  try {
    // Skip if no user ID
    if (!order.user) {
      console.log('No user found for order, skipping referral reward:', order._id);
      return;
    }
    
    console.log('Processing referral reward for order:', order._id);
    
    // Calculate total order amount
    const purchaseAmount = order.summary?.total || order.total || 0;
    console.log('Purchase amount:', purchaseAmount);
    
    // Create a server-to-server JWT for authentication
    const serverToken = jwt.sign(
      { 
        server: true,
        service: 'order-processing'
      }, 
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    
    // Call the referral reward endpoint with detailed logging
    console.log('Calling referral reward processing with:', {
      orderId: order._id.toString(),
      userId: order.user,
      purchaseAmount
    });
    
    const response = await axios.post(
      `${process.env.API_BASE_URL || 'http://localhost:5000/api'}/referrals/process-purchase-reward`, 
      {
        orderId: order._id.toString(),
        userId: order.user,
        purchaseAmount
      }, 
      {
        headers: {
          Authorization: `Bearer ${serverToken}`
        }
      }
    );
    
    console.log('Referral reward processed response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error processing referral reward:', error.message);
    // Don't throw error - let order processing continue
  }
};

// Updated function to use MongoDB models instead of Firestore
const saveReferralRewardToMongoDB = async (order) => {
  try {
    if (!order.user) {
      console.log('No user associated with this order, skipping reward creation');
      return;
    }
    
    // Get referrer information from Referral model instead of Firestore
    const referralInfo = await Referral.findOne({ referredUserId: order.user });
    
    if (!referralInfo || !referralInfo.referrerId) {
      console.log('User was not referred by anyone, skipping reward creation');
      return;
    }
    
    const referrerId = referralInfo.referrerId;
    const orderAmount = order.summary?.total || order.total || 0;
    
    // Calculate 5% reward
    const rewardAmount = orderAmount * 0.05;
    
    // Check if reward already exists for this order
    const existingReward = await Reward.findOne({ purchaseId: order._id.toString() });
    if (existingReward) {
      console.log('Reward already exists for this order:', order._id);
      return;
    }
    
    // Create new reward
    const reward = new Reward({
      userId: referrerId,
      referredUserId: order.user,
      purchaseId: order._id.toString(),
      amount: rewardAmount,
      orderTotal: orderAmount,
      status: 'pending',
      description: `5% reward for referral purchase (Order #${order._id})`,
      purchaseDate: order.createdAt,
      createdAt: new Date()
    });
    
    await reward.save();
    
    console.log('Automatically saved referral reward:', {
      orderId: order._id,
      referrerId,
      amount: rewardAmount
    });
    
    return reward;
  } catch (error) {
    console.error('Error saving referral reward to MongoDB:', error);
    // Don't throw the error to prevent blocking the order update
  }
};

export default router; 