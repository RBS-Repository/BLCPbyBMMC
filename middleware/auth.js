import admin from '../config/firebase-admin.js';

export const auth = async (req, res, next) => {
  try {
    console.log("\n=== Auth Middleware Start ===");
    console.log("Headers received:", {
      authorization: req.headers.authorization ? 'Bearer [token]' : 'none',
      'content-type': req.headers['content-type']
    });

    const token = req.headers.authorization?.split('Bearer ')[1];
    console.log("Token exists:", !!token);

    if (!token) {
      console.log("No token provided in authorization header");
      return res.status(401).json({ error: 'No token provided' });
    }

    try {
      console.log("Attempting to verify token with Firebase Admin...");
      const decodedToken = await admin.auth().verifyIdToken(token);
      console.log("Decoded token:", {
        uid: decodedToken.uid,
        email: decodedToken.email,
        claims: decodedToken
      });

      if (!decodedToken.uid) {
        throw new Error('Invalid user credentials');
      }
      
      const userRecord = await admin.auth().getUser(decodedToken.uid);
      
      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        admin: userRecord.customClaims?.admin || false
      };
      console.log("=== Auth Middleware End (Success) ===\n");
      next();
    } catch (verifyError) {
      console.error("Token verification failed:", verifyError);
      res.status(401).json({ error: 'Invalid token' });
    }
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(401).json({ error: 'Invalid token' });
  }
};

export default auth; 