import admin from 'firebase-admin';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Make sure environment variables are loaded
dotenv.config();

// Determine which service account to use
let serviceAccount;

try {
  // First try: Use local file for development (if exists)
  const localFilePath = path.join(process.cwd(), 'config', 'serviceAccountKey.local.js');
  if (fs.existsSync(localFilePath)) {
    console.log('Using local service account for development');
    serviceAccount = (await import('./serviceAccountKey.local.js')).default;
  } else {
    // Second try: Use environment variables
    console.log('Using environment variables for service account');
    serviceAccount = (await import('./serviceAccountKey.js')).default;
  }
  
  console.log('Initializing Firebase Admin with service account:', {
    project_id: serviceAccount.project_id,
    client_email: serviceAccount.client_email ? 'exists' : 'missing'
  });
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('Firebase Admin initialized successfully');
} catch (error) {
  console.error('Firebase Admin initialization failed:', error);
}

export default admin;

// Add this function to verify/set admin claims
export const verifyAdmin = async (uid) => {
  try {
    const user = await admin.auth().getUser(uid);
    return !!user.customClaims?.admin;
  } catch (err) {
    console.error('Admin verification error:', err);
    return false;
  }
}; 