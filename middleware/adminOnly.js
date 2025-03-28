import * as admin from 'firebase-admin';

export const adminOnly = async (req, res, next) => {
  try {
    if (!req.user) {
      console.error('Admin access attempted with no authenticated user');
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'You must be logged in to access this resource' 
      });
    }
    
    // First check request-level admin flag
    if (req.user.admin === true) {
      // Log admin access
      console.log(`Admin access granted via request flag for user: ${req.user.uid}`);
      return next();
    }

    // If uid is missing, reject immediately
    if (!req.user.uid) {
      console.error('Admin access attempted with invalid user object (missing uid)');
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'Invalid user credentials' 
      });
    }

    // Fallback to Firebase verification
    try {
      const userRecord = await admin.auth().getUser(req.user.uid);
      
      // Verify user account status
      if (userRecord.disabled) {
        console.error(`Admin access attempted from disabled account: ${req.user.uid}`);
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Your account has been disabled'
        });
      }
      
      if (userRecord.customClaims?.admin) {
        // Update request user object with admin flag for future middleware checks
        req.user.admin = true;
        console.log(`Admin access granted via Firebase claims for user: ${req.user.uid}`);
        return next();
      }
      
      // Log failed admin access attempt
      console.warn(`Non-admin user attempted to access admin resource: ${req.user.uid}`);
      throw new Error('Admin privileges required');
    } catch (firebaseError) {
      console.error(`Firebase admin verification error: ${firebaseError.message}`);
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'Invalid or insufficient permissions' 
      });
    }
  } catch (err) {
    console.error(`Admin middleware error: ${err.message}`);
    res.status(403).json({ 
      error: 'Forbidden',
      message: 'You do not have permission to access this resource' 
    });
  }
}; 