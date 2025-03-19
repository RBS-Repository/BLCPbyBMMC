import admin from '../config/firebase-admin.js';
import jwt from 'jsonwebtoken';

export const auth = async (req, res, next) => {
  try {
    console.log("\n=== Auth Middleware Start ===");
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      console.log("No authorization header");
      return res.status(401).json({ error: 'No token provided' });
    }
    
    // Check if Firebase or JWT token
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.split('Bearer ')[1];
      console.log("Token detected:", token ? token.substring(0, 20) + '...' : 'none');
      
      try {
        // Try Firebase first
        const decodedToken = await admin.auth().verifyIdToken(token);
        console.log("Firebase token verified for:", decodedToken.email);
        
        req.user = {
          uid: decodedToken.uid,
          email: decodedToken.email,
          admin: decodedToken.admin || false
        };
        return next();
      } catch (firebaseError) {
        console.error("Firebase verification failed:", firebaseError.message);
        // Fall through to JWT verification
      }
    }
    
    // Try JWT verification as fallback with explicit algorithm
    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
      console.log("JWT verified for:", decoded.user?.email || 'unknown');
      
      req.user = decoded.user || decoded;
      return next();
    } catch (jwtError) {
      console.error("JWT verification error details:", {
        message: jwtError.message,
        name: jwtError.name,
        stack: jwtError.stack?.split('\n')[0],
        secret: process.env.JWT_SECRET ? 'exists' : 'missing',
        secretLength: process.env.JWT_SECRET?.length || 0
      });
      return res.status(401).json({ error: 'Invalid token', details: jwtError.message });
    }
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

export default auth; 