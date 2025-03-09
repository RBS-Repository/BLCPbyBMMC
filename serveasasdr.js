import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import productRoutes from './routes/products.js';
import cartRoutes from './routes/cart.js';
import { WebSocketServer } from 'ws';
import Order from './models/Order.js';
import { errorHandler } from './middleware/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Connect to MongoDB
const mongoURI = process.env.MONGO_URI;
console.log('Attempting to connect to MongoDB at:', mongoURI);

try {
  await mongoose.connect(mongoURI);
  console.log('Connected to MongoDB');
  
  // Log available collections
  const collections = await mongoose.connection.db.listCollections().toArray();
  console.log('Available collections:', collections.map(c => c.name));

  // Add connection logging
  mongoose.connection.on('connected', () => {
    console.log('Mongoose connected to DB:', mongoose.connection.db.databaseName);
    console.log('Orders collection exists:', mongoose.connection.collections.orders !== undefined);
  });

  mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err);
  });
} catch (error) {
  console.error('MongoDB connection error:', error);
  process.exit(1); // Exit if cannot connect to database
}

// Mount product routes
app.use('/api/products', productRoutes);

// Mount cart routes
app.use('/api/cart', cartRoutes);

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const wss = new WebSocketServer({
  port: 5001,
  path: '/ws/orders',
  perMessageDeflate: true,
  clientTracking: true
});

wss.on('connection', (ws, req) => {
  console.log('New WS connection from:', req.socket.remoteAddress);
  
  // Add heartbeat
  const interval = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      ws.ping();
    }
  }, 30000);

  ws.on('close', () => {
    clearInterval(interval);
    console.log('Client disconnected');
  });
  
  const changeStream = Order.watch([], { fullDocument: 'updateLookup' });
  
  changeStream.on('change', async (change) => {
    if (change.operationType === 'insert') {
      try {
        const fullOrder = await Order.findById(change.documentKey._id)
          .populate('items.product')
          .select('customerName shipping items total status createdAt')
          .lean();
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(fullOrder));
          }
        });
      } catch (err) {
        console.error('WebSocket error:', err);
      }
    }
  });

  ws.on('close', () => changeStream.close());
}); 