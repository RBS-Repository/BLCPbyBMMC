import Sales from '../models/Sales.js';
import mongoose from 'mongoose';

// Function to update sales data when an order is completed/paid
export const updateSalesData = async (order) => {
  try {
    console.log('Updating sales data for order:', order._id);
    if (!order || !order.summary || !order.summary.total) {
      console.error('Invalid order data for sales update:', order);
      return null;
    }
    
    // Use the current date (when payment is processed) instead of order creation date
    const processingDate = new Date();
    console.log('Order processing date:', processingDate);
    const day = processingDate.getDate();
    const month = processingDate.getMonth() + 1; // MongoDB months are 1-12
    const year = processingDate.getFullYear();
    
    // Save original order date for reference
    const originalOrderDate = order.createdAt || new Date();
    const daysDifference = Math.floor((processingDate - originalOrderDate) / (1000 * 60 * 60 * 24));
    
    console.log(`Order created on ${originalOrderDate.toISOString()}, processed on ${processingDate.toISOString()}, ${daysDifference} days later`);
    
    // Format date to midnight for daily records
    const dateAtMidnight = new Date(year, month - 1, day);
    
    // Prepare product data
    console.log('Processing items:', order.items.length);
    const productsSold = order.items.map(item => ({
      productId: item.product,
      name: item.name,
      quantity: item.quantity,
      revenue: item.subtotal,
      orderDate: originalOrderDate // Store original order date with the product
    }));
    
    // Determine payment method
    const paymentMethod = order.payment?.method || 'gcash';
    console.log('Payment method:', paymentMethod);
    
    // Create payment method update object
    const paymentUpdate = {};
    paymentUpdate[`paymentMethods.${paymentMethod}.count`] = 1;
    paymentUpdate[`paymentMethods.${paymentMethod}.amount`] = order.summary.total;
    
    // Find and update sales document for the PROCESSING day, or create if it doesn't exist
    console.log('Attempting to update/create sales document for', year, month, day);
    const updatedSales = await Sales.findOneAndUpdate(
      { year, month, day },
      {
        $setOnInsert: {
          date: dateAtMidnight
        },
        $inc: {
          'dailySales.total': order.summary.total,
          'dailySales.count': 1,
          ...paymentUpdate
        },
        $push: {
          productsSold: { $each: productsSold },
          processedOrders: { 
            orderId: order._id,
            total: order.summary.total,
            orderDate: originalOrderDate,
            processedDate: processingDate,
            daysBetween: daysDifference
          }
        },
        $set: {
          updatedAt: new Date()
        }
      },
      { 
        upsert: true, 
        new: true,
        setDefaultsOnInsert: true
      }
    );
    
    console.log('Sales data updated successfully:', updatedSales._id);
    return updatedSales;
  } catch (error) {
    console.error('Error updating sales data:', error);
    return null;
  }
};

// Aggregation functions for dashboard
export const getDashboardStats = async () => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay()); // Start of week (Sunday)
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    // Get daily sales
    const dailySales = await Sales.findOne({
      year: today.getFullYear(),
      month: today.getMonth() + 1,
      day: today.getDate()
    }).lean();
    
    // Get weekly sales
    const weeklySales = await Sales.aggregate([
      {
        $match: {
          date: { $gte: startOfWeek, $lte: today }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$dailySales.total' },
          count: { $sum: '$dailySales.count' }
        }
      }
    ]);
    
    // Get monthly sales
    const monthlySales = await Sales.aggregate([
      {
        $match: {
          year: today.getFullYear(),
          month: today.getMonth() + 1
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$dailySales.total' },
          count: { $sum: '$dailySales.count' }
        }
      }
    ]);
    
    // Get top selling products for the month
    const topProducts = await Sales.aggregate([
      {
        $match: {
          year: today.getFullYear(),
          month: today.getMonth() + 1
        }
      },
      { $unwind: '$productsSold' },
      {
        $group: {
          _id: '$productsSold.productId',
          name: { $first: '$productsSold.name' },
          totalQuantity: { $sum: '$productsSold.quantity' },
          totalRevenue: { $sum: '$productsSold.revenue' }
        }
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: 5 }
    ]);
    
    return {
      daily: {
        total: dailySales?.dailySales?.total || 0,
        count: dailySales?.dailySales?.count || 0
      },
      weekly: {
        total: weeklySales[0]?.total || 0,
        count: weeklySales[0]?.count || 0
      },
      monthly: {
        total: monthlySales[0]?.total || 0,
        count: monthlySales[0]?.count || 0
      },
      topProducts
    };
  } catch (error) {
    console.error('Error getting dashboard stats:', error);
    return {
      daily: { total: 0, count: 0 },
      weekly: { total: 0, count: 0 },
      monthly: { total: 0, count: 0 },
      topProducts: []
    };
  }
};

// Update the getLast30DaysSales function
export const getLast30DaysSales = async () => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);
    
    // Create an array of all dates in the last 30 days first
    const allDates = [];
    for (let d = new Date(thirtyDaysAgo); d <= now; d.setDate(d.getDate() + 1)) {
      allDates.push({
        date: new Date(d),
        dailySales: {
          total: 0,
          count: 0
        },
        productsSold: [],
        paymentMethods: {}
      });
    }

    // Get actual sales data
    const salesData = await Sales.aggregate([
      {
        $match: {
          date: { 
            $gte: thirtyDaysAgo,
            $lte: now 
          }
        }
      },
      {
        $sort: { date: 1 }
      },
      {
        $project: {
          date: 1,
          dailySales: 1,
          productsSold: 1,
          paymentMethods: 1
        }
      }
    ]);

    // Merge actual sales data with the template dates
    const dailyBreakdown = allDates.map(template => {
      const matchingDay = salesData.find(day => 
        day.date.toDateString() === template.date.toDateString()
      );
      
      if (matchingDay) {
        return {
          ...template,
          ...matchingDay,
          date: template.date // Keep the template date to ensure proper format
        };
      }
      return template;
    });

    // Calculate totals
    const totals = dailyBreakdown.reduce((acc, day) => {
      // Add daily sales to totals
      acc.totalRevenue += (day.dailySales?.total || 0);
      acc.totalOrders += (day.dailySales?.count || 0);
      
      // Sum payment methods
      if (day.paymentMethods) {
        Object.entries(day.paymentMethods).forEach(([method, data]) => {
          if (!acc.paymentMethods[method]) {
            acc.paymentMethods[method] = { count: 0, amount: 0 };
          }
          acc.paymentMethods[method].count += (data.count || 0);
          acc.paymentMethods[method].amount += (data.amount || 0);
        });
      }

      // Aggregate product sales
      if (day.productsSold && Array.isArray(day.productsSold)) {
        day.productsSold.forEach(product => {
          if (!product) return;
          
          const existingProduct = acc.products.find(p => 
            p.productId?.toString() === product.productId?.toString()
          );
          
          if (existingProduct) {
            existingProduct.quantity += (product.quantity || 0);
            existingProduct.revenue += (product.revenue || 0);
          } else if (product.productId) {
            acc.products.push({
              productId: product.productId,
              name: product.name || 'Unknown Product',
              quantity: product.quantity || 0,
              revenue: product.revenue || 0
            });
          }
        });
      }

      return acc;
    }, {
      totalRevenue: 0,
      totalOrders: 0,
      paymentMethods: {},
      products: []
    });

    return {
      dailyBreakdown,
      totals
    };
  } catch (error) {
    console.error('Error getting 30-day sales data:', error);
    // Return a safe default structure
    return {
      dailyBreakdown: [],
      totals: {
        totalRevenue: 0,
        totalOrders: 0,
        paymentMethods: {},
        products: []
      }
    };
  }
}; 