const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const mongoose = require('mongoose');
const ReferralCode = require('../models/ReferralCode.js');

// Delete user
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;

    // Delete user from Firebase Auth
    await admin.auth().deleteUser(id);

    // Delete user document from Firestore
    await admin.firestore().collection('users').doc(id).delete();

    // Delete user's referral records from MongoDB
    try {
      // Import Referral model
      const Referral = require('../models/Referral');
      
      // Delete records where user is the referrer
      await Referral.deleteMany({ referrerId: id });
      
      // Delete records where user is the referred user
      await Referral.deleteMany({ referredUserId: id });
      
      console.log(`Deleted referral records for user ${id}`);
    } catch (referralError) {
      console.error('Error deleting referral records:', referralError);
      // Continue with user deletion even if referral deletion fails
    }

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: error.message });
  }
});

// Update user role
router.patch('/:id/role', auth, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { isAdmin } = req.body;

    // Update user's admin status in Firestore
    await admin.firestore().collection('users').doc(id).update({
      isAdmin: isAdmin
    });

    res.json({ message: 'User role updated successfully' });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ message: error.message });
  }
});

// Update user status
router.patch('/:id/status', auth, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    // Update user's active status in Firestore
    await admin.firestore().collection('users').doc(id).update({
      isActive: isActive
    });

    // If deactivating user, disable their Firebase Auth account
    if (!isActive) {
      await admin.auth().updateUser(id, {
        disabled: true
      });
    } else {
      await admin.auth().updateUser(id, {
        disabled: false
      });
    }

    res.json({ message: 'User status updated successfully' });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ message: error.message });
  }
});

// Check if user has admin privileges
router.get('/check-admin', auth, async (req, res) => {
  try {
    // The adminOnly middleware will have already validated if the user is an admin
    // If the request reaches this point, they are an admin (adminOnly would have rejected non-admins)
    // We need to manually check here since we're not using the adminOnly middleware directly
    
    // Check if user has admin role in Firebase claims
    const isAdmin = req.user.admin === true;
    
    if (isAdmin) {
      return res.json({ isAdmin: true });
    } else {
      return res.status(403).json({ isAdmin: false, message: 'User is not an admin' });
    }
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({ error: 'Failed to check admin status' });
  }
});

// Create a new referral code
router.post('/referral-code', auth, async (req, res) => {
  try {
    const { userId, referralCode, createdAt } = req.body;
    
    // Check if user already has a referral code
    const existingCode = await ReferralCode.findOne({ userId });
    if (existingCode) {
      return res.status(400).json({ error: 'User already has a referral code' });
    }
    
    // Check if referral code is unique
    const duplicateCode = await ReferralCode.findOne({ code: referralCode });
    if (duplicateCode) {
      return res.status(400).json({ error: 'Referral code already exists' });
    }
    
    // Create new referral code
    const newReferralCode = new ReferralCode({
      userId,
      code: referralCode,
      createdAt: createdAt || new Date(),
      uses: 0
    });
    
    await newReferralCode.save();
    res.status(201).json({
      userId,
      referralCode,
      createdAt: newReferralCode.createdAt
    });
  } catch (error) {
    console.error('Error creating referral code:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get user's referral code
router.get('/:userId/referral-code', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Ensure user can only access their own referral code
    if (req.user.uid !== userId) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }
    
    const referralCode = await ReferralCode.findOne({ userId });
    if (!referralCode) {
      return res.status(404).json({ error: 'Referral code not found' });
    }
    
    res.json({
      userId: referralCode.userId,
      referralCode: referralCode.code,
      uses: referralCode.uses,
      createdAt: referralCode.createdAt
    });
  } catch (error) {
    console.error('Error fetching referral code:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router; 