import * as admin from 'firebase-admin';

export const adminOnly = async (req, res, next) => {
  try {
    // First check request-level admin flag
    if (req.user.admin === true) {
      return next();
    }

    // Fallback to Firebase verification
    const userRecord = await admin.auth().getUser(req.user.uid);
    if (userRecord.customClaims?.admin) {
      req.user.admin = true;
      return next();
    }

    throw new Error('Admin privileges required');
  } catch (err) {
    res.status(403).json({ 
      error: 'Forbidden',
      message: err.message 
    });
  }
}; 