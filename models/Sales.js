import mongoose from 'mongoose';

// Define the sales schema to store daily, weekly, and monthly sales data
const salesSchema = new mongoose.Schema({
  // Date fields
  date: {
    type: Date,
    required: true,
    index: true
  },
  day: {
    type: Number,
    required: true
  },
  month: {
    type: Number,
    required: true
  },
  year: {
    type: Number,
    required: true
  },
  
  // Sales metrics
  dailySales: {
    total: {
      type: Number,
      default: 0
    },
    count: {
      type: Number,
      default: 0
    }
  },
  
  // Product metrics
  productsSold: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    },
    name: String,
    quantity: Number,
    revenue: Number,
    orderDate: Date
  }],
  
  // Track processed orders with their original creation dates
  processedOrders: [{
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order'
    },
    total: Number,
    orderDate: Date,
    processedDate: Date,
    daysBetween: Number
  }],
  
  // Payment method breakdown
  paymentMethods: {
    gcash: {
      count: { type: Number, default: 0 },
      amount: { type: Number, default: 0 }
    },
    card: {
      count: { type: Number, default: 0 },
      amount: { type: Number, default: 0 }
    },
    maya: {
      count: { type: Number, default: 0 },
      amount: { type: Number, default: 0 }
    },
    grab_pay: {
      count: { type: Number, default: 0 },
      amount: { type: Number, default: 0 }
    }
  },
  
  // Last update timestamp
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Create a compound index for efficient queries
salesSchema.index({ year: 1, month: 1, day: 1 }, { unique: true });

const Sales = mongoose.model('Sales', salesSchema);
export default Sales; 