import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from '../models/Order.js';
import { updateSalesData } from '../services/salesService.js';

dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(async () => {
  console.log('Connected to MongoDB');
  
  try {
    // Find all paid orders
    const paidOrders = await Order.find({
      'payment.status': 'paid'
    }).sort({ createdAt: 1 });
    
    console.log(`Found ${paidOrders.length} paid orders to process`);
    
    // Process each order to update sales data
    for (let i = 0; i < paidOrders.length; i++) {
      console.log(`Processing order ${i+1}/${paidOrders.length}`);
      await updateSalesData(paidOrders[i]);
    }
    
    console.log('Sales data backfill completed');
    process.exit(0);
  } catch (error) {
    console.error('Error during backfill:', error);
    process.exit(1);
  }
})
.catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
}); 