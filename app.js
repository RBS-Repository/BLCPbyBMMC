import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import productsRouter from './routes/products.js';
import cartRoutes from './routes/cart.js';
import admin from './config/firebase-admin.js';
import { auth } from './middleware/auth.js';
import { adminOnly } from './middleware/adminOnly.js';
import orderRoutes from './routes/orders.js';
import paymentRoutes from './routes/payments.js';
import analyticsRoutes from './routes/analytics.js';
import analyticsTestRoutes from './routes/analytics-test.js';
import { WebSocketServer } from 'ws';
import Order from './models/Order.js';
import Sales from './models/Sales.js';
import referralRoutes from './routes/referrals.js';
import settingsRoutes from './routes/settings.js';
import contentRoutes from './routes/content.js';
import faqRoutes from './routes/faq.js';
import articlesRoutes from './routes/articles.js';
import adminReferralsRoutes from './routes/admin/referrals.js';

// Load environment variables from a .env file (if exists)
dotenv.config();

const app = express();

// Enable CORS for all routes
app.use(cors({
  origin: [
    'https://blcp.vercel.app',         // Production domain
    'http://localhost:3000'            // Local development
  ],
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Middleware to parse JSON bodies with increased limit
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Connect to MongoDB
const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/mydatabase';
mongoose
  .connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("MongoDB connected");
    mongoose.connection.on('connected', () => {
      console.log('Mongoose connected to DB');
      console.log('Collections available:', Object.keys(mongoose.connection.collections));
    });
    mongoose.connection.on('error', (err) => {
      console.error('Mongoose connection error:', err);
    });
    // Ensure Sales collection exists
    console.log('Checking if Sales collection exists...');
    Sales.createCollection().then(() => {
      console.log('Sales collection created/verified');
    }).catch(err => {
      console.error('Error with Sales collection:', err);
    });
  })
  .catch((err) => console.error("MongoDB connection error:", err));

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend is running!' });
});

// Protected test endpoint
app.get('/api/protected-test', auth, (req, res) => {
  res.json({ message: 'You accessed a protected endpoint!' });
});

// Admin verification endpoint
app.get('/api/verify-admin', auth, adminOnly, (req, res) => {
  res.json({
    message: 'You are an admin!',
    user: {
      uid: req.user.uid,
      email: req.user.email,
      admin: req.user.admin
    }
  });
});

// Mount routes
app.use('/api/products', productsRouter);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/analytics-test', analyticsTestRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/faq', faqRoutes);
app.use('/api/articles', articlesRoutes);
app.use('/api/admin/referrals', adminReferralsRoutes);

// Log mounted routes
console.log('\nMounted routes:');
app._router.stack
  .filter(r => r.route || r.name === 'router')
  .forEach(r => {
    if (r.route) {
      console.log(`${Object.keys(r.route.methods)[0].toUpperCase()} ${r.route.path}`);
    } else {
      console.log(`Router: ${r.regexp}`);
    }
  });

// Add debug logging to help diagnose the routing issue
app.use('/api/settings', settingsRoutes);
console.log('Settings routes mounted at /api/settings');

// Add explicit logging for settings routes
console.log('Available settings routes:');
settingsRoutes.stack.forEach(layer => {
  if (layer.route) {
    const methods = Object.keys(layer.route.methods).join(',');
    console.log(`${methods.toUpperCase()} ${'/api/settings' + layer.route.path}`);
  }
});

// Direct test routes for debugging
app.get('/api/direct-test', (req, res) => {
  console.log('Direct test route hit');
  res.json({ message: 'Direct test route in backend/app.js is working' });
});

app.get('/api/direct-analytics', (req, res) => {
  console.log('Direct analytics route hit');
  res.json({
    message: 'Direct analytics test from backend/app.js',
    timeframe: req.query.timeframe || 'default',
    dummyData: {
      revenueData: [
        { date: new Date(), total: 1000, count: 5 },
        { date: new Date(Date.now() - 86400000), total: 1200, count: 6 }
      ],
      summary: {
        revenue: { total: 2200, growth: 10 },
        orders: { total: 11, growth: 5 },
        customers: { total: 3, growth: 15 }
      },
      topProducts: [
        { _id: '1', name: 'Test Product 1', totalRevenue: 1500 },
        { _id: '2', name: 'Test Product 2', totalRevenue: 700 }
      ]
    }
  });
});

// Debugging for 404s
app.use('*', (req, res) => {
  console.log('404 route hit for:', req.originalUrl);
  res.status(404).json({ 
    error: 'Route not found',
    path: req.originalUrl
  });
});

// WebSocket Server Setup
const setupWebSocket = (server) => {
  const wss = new WebSocketServer({ 
    server,
    path: '/ws/orders',
    perMessageDeflate: {
      zlibDeflateOptions: { level: 3 }
    }
  });

  wss.on('connection', (ws, req) => {
    console.log('New WebSocket connection from:', req.socket.remoteAddress);
    
    // Add heartbeat
    const interval = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        ws.ping();
      }
    }, 30000);

    const changeStream = Order.watch([], { 
      fullDocument: 'updateLookup',
      maxAwaitTimeMS: 1000
    });

    changeStream.on('change', async (change) => {
      try {
        if (change.operationType === 'insert') {
          const order = await Order.findById(change.documentKey._id)
            .populate('items.product')
            .lean();
            
          wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'order-update',
                data: order
              }));
            }
          });
        }
      } catch (error) {
        console.error('WebSocket stream error:', error);
      }
    });

    ws.on('close', () => {
      clearInterval(interval);
      changeStream.close();
      console.log('WebSocket connection closed');
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });
};

// Start the server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`\nServer is running at http://localhost:${PORT}`);
  console.log('\nAvailable endpoints:');
  console.log('- GET  /api/test');
  console.log('- GET  /api/protected-test');
  console.log('- GET  /api/verify-admin');
  console.log('- GET  /api/payments');
  console.log('- GET  /api/payments/test');
  console.log('- POST /api/payments/create-link\n');
  setupWebSocket(server);
});

// Error handling
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

// Add a health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    message: 'BLCP API is running',
    timestamp: new Date().toISOString() 
  });
}); 