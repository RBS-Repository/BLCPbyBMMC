import express from 'express';
import { auth } from '../middleware/auth.js';
import admin from '../config/firebase-admin.js';
import mongoose from 'mongoose';
import Referral from '../models/Referral.js';
import ReferralCode from '../models/ReferralCode.js';
import User from '../models/User.js';
import Setting from '../models/Setting.js';

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
    
    // 1. Find the referrer
    const usersRef = admin.firestore().collection('users');
    const snapshot = await usersRef.where('referralCode', '==', referralCode.toUpperCase()).limit(1).get();
    
    if (snapshot.empty) {
      return res.status(404).json({ error: 'Referrer not found with this code' });
    }
    
    const referrerId = snapshot.docs[0].id;
    const referrerData = snapshot.docs[0].data();

    // 2. Get referral settings
    const settingsDoc = await admin.firestore().collection('settings').doc('referrals').get();
    const settings = settingsDoc.exists ? settingsDoc.data() : {
      referrerDiscount: 10,
      referredDiscount: 15,
      // ... other default settings
    };

    // 3. Create referral records
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

    // 4. Create rewards for both users
    const batch = admin.firestore().batch();
    
    // Referrer reward
    const referrerRewardRef = admin.firestore().collection('userRewards').doc();
    batch.set(referrerRewardRef, {
      userId: referrerId,
      type: 'referral',
      amount: settings.referrerDiscount,
      description: `Referral signup bonus for ${newUserEmail}`,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      used: false,
      createdAt: new Date()
    });

    // 5. Update user documents
    const referrerUpdateRef = admin.firestore().collection('users').doc(referrerId);
    batch.update(referrerUpdateRef, {
      referrals: admin.firestore.FieldValue.arrayUnion({
        userId: newUserId,
        email: newUserEmail,
        name: newUserName,
        date: new Date().toISOString()
      }),
      referralCount: admin.firestore.FieldValue.increment(1)
    });

    const newUserRef = admin.firestore().collection('users').doc(newUserId);
    batch.update(newUserRef, {
      referredBy: referrerId,
      referredByDate: new Date().toISOString()
    });

    await batch.commit();
    
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

// Add this route to handle automatic reward generation
router.post('/process-purchase-reward', auth, async (req, res) => {
  try {
    const { orderId, userId, purchaseAmount } = req.body;
    
    if (!orderId || !userId || !purchaseAmount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Fetch referral settings from MongoDB
    let settings;
    try {
      const ReferralSettings = mongoose.model('ReferralSettings');
      const settingsDoc = await ReferralSettings.findOne();
      
      if (settingsDoc) {
        settings = settingsDoc;
      } else {
        // If not found in MongoDB, fetch from Firestore
        const firebaseSettingsDoc = await admin.firestore().collection('settings').doc('referrals').get();
        settings = firebaseSettingsDoc.exists ? firebaseSettingsDoc.data() : {
          creditCalculation: 'percentage',
          maxRewardPercentage: 5,
          minimumPurchase: 50,
          maxReferralReward: 200,
          expirationDays: 30
        };
      }
    } catch (err) {
      console.error('Error fetching referral settings:', err);
      // Use default settings if both MongoDB and Firestore fail
      settings = {
        creditCalculation: 'percentage',
        maxRewardPercentage: 5,
        minimumPurchase: 50,
        maxReferralReward: 200,
        expirationDays: 30
      };
    }
    
    // Check if purchase meets minimum amount
    if (purchaseAmount < settings.minimumPurchase) {
      return res.status(200).json({ 
        success: true, 
        message: 'Purchase does not meet minimum amount for referral reward',
        rewardGenerated: false
      });
    }
    
    // Find if user was referred by someone using MongoDB
    const referral = await Referral.findOne({ referredUserId: userId });
    if (!referral || !referral.referrerId) {
      return res.status(200).json({ 
        success: true, 
        message: 'User was not referred by anyone',
        rewardGenerated: false
      });
    }
    
    const referrerId = referral.referrerId;
    
    // Calculate reward amount
    let rewardAmount = 0;
    if (settings.creditCalculation === 'percentage') {
      // Calculate percentage of purchase
      rewardAmount = (purchaseAmount * settings.maxRewardPercentage) / 100;
      
      // Cap at maximum reward amount if needed
      if (settings.maxReferralReward > 0 && rewardAmount > settings.maxReferralReward) {
        rewardAmount = settings.maxReferralReward;
      }
    } else {
      // Fixed amount (fallback)
      rewardAmount = settings.fixedRewardAmount || 100;
    }
    
    // Round to 2 decimal places
    rewardAmount = Math.round(rewardAmount * 100) / 100;
    
    // Create the reward
    const reward = {
      referrerId,
      referredUserId: userId,
      orderId,
      type: 'credit',
      amount: rewardAmount,
      description: `${settings.maxRewardPercentage}% reward for referred purchase (Order #${orderId})`,
      used: false,
      createdAt: new Date(),
      expiresAt: settings.expirationDays > 0 
        ? new Date(Date.now() + settings.expirationDays * 24 * 60 * 60 * 1000)
        : null
    };
    
    // Save the reward to the database
    const rewardId = new mongoose.Types.ObjectId(); // Generate a new MongoDB ID
    
    // Update MongoDB referral record
    const updatedReferral = await Referral.findOneAndUpdate(
      { referrerId, referredUserId: userId },
      { 
        $set: { status: 'purchased' },
        $push: { rewards: { ...reward, _id: rewardId } }
      },
      { upsert: true, new: true }
    );
    
    return res.status(200).json({ 
      success: true, 
      message: 'Referral reward generated successfully',
      rewardGenerated: true,
      reward: {
        id: rewardId,
        amount: rewardAmount,
        referrerId: referrerId,
        userId: userId
      }
    });
  } catch (error) {
    console.error('Error processing purchase reward:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Create a referral code for a user in MongoDB
router.post('/create-code', auth, async (req, res) => {
  try {
    const { userId, referralCode, userName, userEmail } = req.body;
    
    if (!userId || !referralCode) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Check if a code already exists for this user
    const existingCode = await mongoose.model('ReferralCode').findOne({ userId });
    
    if (existingCode) {
      return res.status(409).json({ 
        message: 'Referral code already exists for this user',
        code: existingCode.code
      });
    }
    
    // Create the referral code in MongoDB
    const newReferralCode = new mongoose.model('ReferralCode')({
      userId,
      code: referralCode,
      userName,
      userEmail,
      uses: 0,
      createdAt: new Date()
    });
    
    await newReferralCode.save();
    
    res.status(201).json({ 
      success: true, 
      message: 'Referral code created successfully',
      code: referralCode 
    });
  } catch (error) {
    console.error('Error creating referral code:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add this endpoint to handle reward redemption
router.post('/rewards/redeem', auth, async (req, res) => {
  try {
    const { rewardId, cartTotal } = req.body;
    const userId = req.user.uid;
    
    // Find the reward and verify it belongs to the user
    const referral = await Referral.findOne({
      referrerId: userId,
      'rewards._id': rewardId,
      'rewards.used': false,
      'rewards.expiresAt': { $gt: new Date() }
    });
    
    if (!referral) {
      return res.status(404).json({ 
        success: false, 
        message: 'Reward not found or already used' 
      });
    }
    
    // Find the specific reward
    const reward = referral.rewards.find(r => 
      r._id.toString() === rewardId && !r.used && new Date(r.expiresAt) > new Date()
    );
    
    if (!reward) {
      return res.status(404).json({ 
        success: false, 
        message: 'Reward not found or already used' 
      });
    }
    
    // Make sure reward amount is not greater than cart total
    if (reward.amount > cartTotal) {
      return res.status(400).json({
        success: false,
        message: 'Reward amount cannot exceed cart total'
      });
    }
    
    // Mark the reward as used
    await Referral.updateOne(
      { 
        referrerId: userId,
        'rewards._id': rewardId
      },
      { 
        $set: { 
          'rewards.$.used': true,
          'rewards.$.redeemedAt': new Date(),
          'rewards.$.redeemedAmount': reward.amount
        } 
      }
    );
    
    // Return success
    res.json({ 
      success: true, 
      message: 'Reward redeemed successfully',
      amount: reward.amount
    });
    
  } catch (error) {
    console.error('Error redeeming reward:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Add this endpoint to fetch available rewards
router.get('/rewards/available', auth, async (req, res) => {
  try {
    const userId = req.user.uid;
    console.log('Fetching rewards for user:', userId);
    
    // Find all referrals where the user is the referrer
    const referrals = await Referral.find({ referrerId: userId });
    
    // Extract all unused, non-expired rewards
    const now = new Date();
    const availableRewards = [];
    
    referrals.forEach(referral => {
      const validRewards = referral.rewards.filter(reward => 
        !reward.used && new Date(reward.expiresAt) > now
      );
      
      validRewards.forEach(reward => {
        availableRewards.push({
          _id: reward._id,
          amount: reward.amount,
          expiresAt: reward.expiresAt,
          referredUser: referral.referredEmail || 'Anonymous'
        });
      });
    });
    
    res.json({
      success: true,
      rewards: availableRewards
    });
    
  } catch (error) {
    console.error('Error in /rewards/available:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router; 