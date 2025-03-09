import express from 'express';
import { auth } from '../middleware/auth.js';
import admin from '../config/firebase-admin.js';
import mongoose from 'mongoose';
import Referral from '../models/Referral.js';

const router = express.Router();

// Validate a referral code
router.get('/validate/:code', async (req, res) => {
  try {
    const { code } = req.params;
    
    if (!code || code.length < 8) {
      return res.status(400).json({ valid: false, error: 'Invalid code format' });
    }
    
    // Query Firestore for the referral code
    const usersRef = admin.firestore().collection('users');
    const snapshot = await usersRef.where('referralCode', '==', code.toUpperCase()).limit(1).get();
    
    if (snapshot.empty) {
      return res.json({ valid: false });
    }
    
    // Get the user document
    const userDoc = snapshot.docs[0];
    const userData = userDoc.data();
    const referrerId = userDoc.id;
    
    // Format the referrer name
    const referrerName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || 'a BLCP member';
    
    res.json({ 
      valid: true, 
      referrerId: referrerId,
      referrerName
    });
  } catch (error) {
    console.error('Error validating referral code:', error);
    res.status(500).json({ valid: false, error: error.message });
  }
});

// Record a referral when someone signs up
router.post('/record', auth, async (req, res) => {
  try {
    const { referralCode, newUserId, newUserEmail, newUserName } = req.body;
    
    if (!referralCode || !newUserId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Find the referrer by referral code
    const usersRef = admin.firestore().collection('users');
    const snapshot = await usersRef.where('referralCode', '==', referralCode.toUpperCase()).limit(1).get();
    
    if (snapshot.empty) {
      return res.status(404).json({ error: 'Referrer not found with this code' });
    }
    
    const referrerId = snapshot.docs[0].id;
    
    // Create a referral record in MongoDB for analytics
    const referral = new Referral({
      referrerId,
      referralCode,
      referredUserId: newUserId,
      referredUserEmail: newUserEmail,
      referredUserName: newUserName,
      status: 'registered',
      createdAt: new Date()
    });
    
    await referral.save();
    
    // Update the referrer's document in Firestore to track referrals
    const referrerRef = admin.firestore().collection('users').doc(referrerId);
    
    await referrerRef.update({
      referrals: admin.firestore.FieldValue.arrayUnion({
        userId: newUserId,
        email: newUserEmail,
        name: newUserName,
        date: new Date().toISOString()
      }),
      referralCount: admin.firestore.FieldValue.increment(1)
    });
    
    res.status(201).json({ success: true });
  } catch (error) {
    console.error('Error recording referral:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all referrals made by a user
router.get('/by-user/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Ensure user can only access their own referrals
    if (req.user.uid !== userId) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }
    
    // Get the user's data from Firestore
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userData = userDoc.data();
    
    // Get referrals from Firestore
    const referrals = userData.referrals || [];
    
    // Get additional analytics from MongoDB if needed
    const analyticsData = await Referral.find({ referrerId: userId })
      .sort({ createdAt: -1 })
      .limit(100);
    
    res.json({ 
      code: userData.referralCode,
      referrals,
      analytics: analyticsData
    });
  } catch (error) {
    console.error('Error fetching user referrals:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router; 