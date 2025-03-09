import express from 'express';
const router = express.Router();

// Test route - no auth required
router.get('/test', (req, res) => {
  res.json({ message: 'Analytics API test endpoint is working' });
});

// Simple route - no auth required
router.get('/', (req, res) => {
  res.json({
    message: 'Simple analytics data',
    timeframe: req.query.timeframe || 'month',
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

export default router; 