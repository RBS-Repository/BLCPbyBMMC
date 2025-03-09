export const errorHandler = (err, req, res, next) => {
  console.error('Error:', {
    path: req.path,
    method: req.method,
    body: req.body,
    error: err.stack
  });
  
  res.status(500).json({
    error: 'Server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
}; 