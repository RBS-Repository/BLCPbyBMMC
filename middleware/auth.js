import admin from '../config/firebase-admin.js';
import jwt from 'jsonwebtoken';

// Cache Firebase token verifications
const tokenCache = new Map();

export const auth = async (req, res, next) => {
  try {
    console.log("\n=== Auth Middleware Start ===");
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    // Check if Firebase or JWT token
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.split('Bearer ')[1];
      // Don't log tokens, even partially
      console.log("Token received");
      
      // Check cache first
      if (tokenCache.has(token)) {
        req.user = tokenCache.get(token);
        return next();
      }
      
      try {
        // Try Firebase first
        const decodedToken = await admin.auth().verifyIdToken(token);
        console.log("Firebase token verified for user");
        
        // Cache valid tokens for 5 minutes
        tokenCache.set(token, decodedToken);
        setTimeout(() => tokenCache.delete(token), 300000);

        req.user = {
          uid: decodedToken.uid,
          email: decodedToken.email,
          admin: decodedToken.admin || false
        };
        return next();
      } catch (firebaseError) {
        console.error("Firebase verification failed:", firebaseError.code || firebaseError.message);
        // Fall through to JWT verification
      }
    }
    
    // Try JWT verification as fallback with explicit algorithm
    try {
      const token = authHeader.split(' ')[1];
      if (!process.env.JWT_SECRET) {
        console.error("JWT secret not configured");
        return res.status(500).json({ error: 'Server configuration error' });
      }
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET, { 
        algorithms: ['HS256'], // Only allow HS256 algorithm
        maxAge: '24h' // Enforce token expiration
      });
      
      console.log("JWT verified successfully");
      
      req.user = decoded.user || decoded;
      return next();
    } catch (jwtError) {
      console.error("JWT verification error:", jwtError.name);
      // Don't log sensitive information like the JWT secret
      return res.status(401).json({ error: 'Invalid token' });
    }
  } catch (error) {
    console.error("Auth middleware error:", error.message);
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

export default auth; 