import express from 'express';
import cors from 'cors';

// Create a simple Express app to test routes
const app = express();
app.use(cors());
app.use(express.json());

// Add a simple test route
app.get('/test', (req, res) => {
  res.json({ message: 'Express test server is working' });
});

// Add a simple analytics test route
app.get('/api/analytics-test', (req, res) => {
  res.json({
    message: 'Test analytics data',
    timeframe: req.query.timeframe || 'month',
    testData: true
  });
});

// Start the server on a different port
const PORT = 5001;
app.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`);
  console.log(`Try accessing: http://localhost:${PORT}/test`);
  console.log(`Try accessing: http://localhost:${PORT}/api/analytics-test`);
}); 