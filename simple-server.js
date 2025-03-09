import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// Direct test routes
app.get('/', (req, res) => {
  res.json({ message: 'Root route works!' });
});

app.get('/api/test', (req, res) => {
  res.json({ message: 'Test route works!' });
});

// Log all registered routes
app.get('/routes', (req, res) => {
  const routes = [];
  app._router.stack.forEach(middleware => {
    if (middleware.route) {
      routes.push({
        path: middleware.route.path,
        methods: Object.keys(middleware.route.methods)
      });
    }
  });
  res.json({ routes });
});

const PORT = 5002;
app.listen(PORT, () => {
  console.log(`Simple test server running on port ${PORT}`);
  console.log(`Try accessing: http://localhost:${PORT}/`);
  console.log(`Try accessing: http://localhost:${PORT}/api/test`);
  console.log(`Try accessing: http://localhost:${PORT}/routes`);
}); 