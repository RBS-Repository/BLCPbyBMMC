import express from 'express';
import { auth } from '../middleware/auth.js';
import { adminOnly } from '../middleware/adminOnly.js';
import Sales from '../models/Sales.js';
import Order from '../models/Order.js';
import mongoose from 'mongoose';

const router = express.Router();

// Get analytics data based on timeframe
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const { timeframe = 'month' } = req.query;
    const now = new Date();
    
    // Define date ranges based on timeframe
    let startDate, endDate, previousStartDate, previousEndDate;
    if (timeframe === 'week') {
      // Last 7 days
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
      endDate = now;
      
      // Previous period (for growth calculation)
      previousStartDate = new Date(startDate);
      previousStartDate.setDate(previousStartDate.getDate() - 7);
      previousEndDate = new Date(startDate);
      previousEndDate.setDate(previousEndDate.getDate() - 1);
    } else if (timeframe === 'month') {
      // Last 30 days
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 30);
      endDate = now;
      
      // Previous period
      previousStartDate = new Date(startDate);
      previousStartDate.setDate(previousStartDate.getDate() - 30);
      previousEndDate = new Date(startDate);
      previousEndDate.setDate(previousEndDate.getDate() - 1);
    } else if (timeframe === 'year') {
      // Last 365 days
      startDate = new Date(now);
      startDate.setFullYear(now.getFullYear() - 1);
      endDate = now;
      
      // Previous period
      previousStartDate = new Date(startDate);
      previousStartDate.setFullYear(previousStartDate.getFullYear() - 1);
      previousEndDate = new Date(startDate);
      previousEndDate.setDate(previousEndDate.getDate() - 1);
    }
    
    // Format dates to midnight
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
    previousStartDate.setHours(0, 0, 0, 0);
    previousEndDate.setHours(23, 59, 59, 999);
    
    console.log(`Analyzing data from ${startDate.toISOString()} to ${endDate.toISOString()}`);
    
    // REVENUE DATA BY DATE
    // This gets daily sales data for the chart
    const revenueData = await Sales.aggregate([
      {
        $match: {
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $sort: { date: 1 }
      },
      {
        $project: {
          date: 1,
          total: '$dailySales.total',
          count: '$dailySales.count'
        }
      }
    ]);
    
    // SUMMARY METRICS
    // Total revenue for current period
    const revenueSummary = await Sales.aggregate([
      {
        $match: {
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$dailySales.total' },
          totalOrders: { $sum: '$dailySales.count' }
        }
      }
    ]);
    
    // Total revenue for previous period (for growth calculation)
    const previousRevenueSummary = await Sales.aggregate([
      {
        $match: {
          date: { $gte: previousStartDate, $lte: previousEndDate }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$dailySales.total' },
          totalOrders: { $sum: '$dailySales.count' }
        }
      }
    ]);
    
    // TOP PRODUCTS
    // Get top selling products by revenue
    const topProducts = await Sales.aggregate([
      {
        $match: {
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $unwind: '$productsSold'
      },
      {
        $group: {
          _id: '$productsSold.productId',
          name: { $first: '$productsSold.name' },
          totalQuantity: { $sum: '$productsSold.quantity' },
          totalRevenue: { $sum: '$productsSold.revenue' }
        }
      },
      {
        $sort: { totalRevenue: -1 }
      },
      {
        $limit: 5
      }
    ]);
    
    // PAYMENT METHODS
    // Breakdown of payment methods used
    const paymentMethods = await Sales.aggregate([
      {
        $match: {
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: null,
          gcash: { $sum: '$paymentMethods.gcash.amount' },
          card: { $sum: '$paymentMethods.card.amount' },
          maya: { $sum: '$paymentMethods.maya.amount' },
          grab_pay: { $sum: '$paymentMethods.grab_pay.amount' }
        }
      }
    ]);
    
    // CUSTOMER GROWTH
    // Count unique customers in current period
    const customerGrowth = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          'payment.status': 'paid'
        }
      },
      {
        $group: {
          _id: '$user',
        }
      },
      {
        $count: 'newCustomers'
      }
    ]);
    
    // Count unique customers in previous period
    const prevCustomers = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: previousStartDate, $lte: previousEndDate },
          'payment.status': 'paid'
        }
      },
      {
        $group: {
          _id: '$user',
        }
      },
      {
        $count: 'uniqueCustomers'
      }
    ]);
    
    // Extract values with fallbacks for empty results
    const totalRevenue = revenueSummary[0]?.totalRevenue || 0;
    const totalOrders = revenueSummary[0]?.totalOrders || 0;
    const prevRevenueTotal = previousRevenueSummary[0]?.totalRevenue || 0;
    const prevOrdersTotal = previousRevenueSummary[0]?.totalOrders || 0;
    const prevCustomersCount = prevCustomers[0]?.uniqueCustomers || 0;
    
    // Calculate growth percentages with safety checks
    const calculateGrowth = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };
    
    const revenueGrowth = calculateGrowth(totalRevenue, prevRevenueTotal);
    const ordersGrowth = calculateGrowth(totalOrders, prevOrdersTotal);
    const customersGrowth = calculateGrowth(
      customerGrowth[0]?.newCustomers || 0, 
      prevCustomersCount
    );
    
    // Format response
    res.json({
      timeframe,
      // Chart data
      revenueData,
      // Summary metrics
      summary: {
        revenue: {
          total: totalRevenue,
          growth: Math.round(revenueGrowth * 10) / 10 // Round to 1 decimal
        },
        orders: {
          total: totalOrders,
          growth: Math.round(ordersGrowth * 10) / 10
        },
        customers: {
          total: customerGrowth[0]?.newCustomers || 0,
          growth: Math.round(customersGrowth * 10) / 10
        }
      },
      // Product data
      topProducts,
      // Payment methods
      paymentMethods: paymentMethods[0] || {
        gcash: 0, card: 0, maya: 0, grab_pay: 0
      }
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics data' });
  }
});

// Simple test endpoint (no auth)
router.get('/test', (req, res) => {
  res.json({ message: 'Analytics API is working' });
});

export default router; 