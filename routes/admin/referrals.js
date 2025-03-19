import express from 'express';
import { auth } from '../../middleware/auth.js';
import { adminOnly } from '../../middleware/adminOnly.js';
import Referral from '../../models/Referral.js';
import ReferralSettings from '../../models/ReferralSettings.js';
import admin from '../../config/firebase-admin.js';

const router = express.Router();

// Get all referrals with stats for admin
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    // Get all referrals
    const referrals = await Referral.find().sort({ createdAt: -1 });
    
    // Fetch user data for each referrer from Firestore
    const referralsWithNames = await Promise.all(referrals.map(async (referral) => {
      try {
        // Get referrer data
        const referrerDoc = await admin.firestore().collection('users').doc(referral.referrerId).get();
        
        let referrerName = 'Unknown User';
        if (referrerDoc.exists) {
          const referrerData = referrerDoc.data();
          referrerName = `${referrerData.firstName || ''} ${referrerData.lastName || ''}`.trim();
          if (!referrerName) referrerName = referrerData.email || 'Unknown User';
        }
        
        // Return referral with referrer name
        return {
          ...referral.toObject(),
          referrerName
        };
      } catch (error) {
        console.error(`Error fetching data for referrer ${referral.referrerId}:`, error);
        return {
          ...referral.toObject(),
          referrerName: 'Unknown User'
        };
      }
    }));
    
    // Calculate stats
    const totalReferrals = referrals.length;
    const activeReferrals = referrals.filter(ref => ref.status === 'active' || ref.status === 'purchased').length;
    
    // Calculate total rewards given
    let totalRewards = 0;
    referrals.forEach(ref => {
      if (ref.rewards && ref.rewards.length) {
        ref.rewards.forEach(reward => {
          if (reward.type === 'credit') {
            totalRewards += reward.amount;
          }
        });
      }
    });
    
    // Calculate conversion rate (percentage of registered users who made a purchase)
    const purchasedReferrals = referrals.filter(ref => ref.status === 'purchased').length;
    const conversionRate = totalReferrals > 0 ? Math.round((purchasedReferrals / totalReferrals) * 100) : 0;
    
    res.json({
      referrals: referralsWithNames,
      stats: {
        totalReferrals,
        activeReferrals,
        totalRewards,
        conversionRate
      }
    });
  } catch (error) {
    console.error('Error fetching admin referrals:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get referral settings
router.get('/settings', auth, adminOnly, async (req, res) => {
  try {
    // Get the settings from the database or return defaults
    let settings = await ReferralSettings.findOne();
    
    if (!settings) {
      // Create default settings if none exist
      settings = new ReferralSettings({
        referrerDiscount: 10,
        referredDiscount: 15,
        minimumPurchase: 50,
        maxReferralReward: 200,
        expirationDays: 60
      });
      
      await settings.save();
    }
    
    res.json(settings);
  } catch (error) {
    console.error('Error fetching referral settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update referral settings
router.put('/settings', auth, adminOnly, async (req, res) => {
  try {
    const { 
      referrerDiscount, 
      referredDiscount, 
      minimumPurchase, 
      maxReferralReward, 
      expirationDays 
    } = req.body;
    
    // Validate input
    if (referrerDiscount < 0 || referrerDiscount > 100 || 
        referredDiscount < 0 || referredDiscount > 100 ||
        minimumPurchase < 0 || maxReferralReward < 0 || expirationDays < 0) {
      return res.status(400).json({ error: 'Invalid settings values' });
    }
    
    // Update or create settings
    const settings = await ReferralSettings.findOneAndUpdate(
      {}, // Empty filter to match any document
      {
        referrerDiscount,
        referredDiscount,
        minimumPurchase,
        maxReferralReward,
        expirationDays,
        updatedAt: new Date()
      },
      { new: true, upsert: true }
    );
    
    res.json(settings);
  } catch (error) {
    console.error('Error updating referral settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update referral status
router.put('/:id/status', auth, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    // Validate status
    if (!['registered', 'active', 'purchased'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }
    
    // First get the referral
    const referral = await Referral.findById(id);
    
    if (!referral) {
      return res.status(404).json({ error: 'Referral not found' });
    }
    
    // Check if we need to set firstPurchaseAt
    const updateData = { 
      status,
      // Only set firstPurchaseAt if status is 'purchased' and it's not set yet
      ...(status === 'purchased' && !referral.firstPurchaseAt ? { firstPurchaseAt: new Date() } : {})
    };
    
    const updatedReferral = await Referral.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );
    
    res.json(updatedReferral);
  } catch (error) {
    console.error('Error updating referral status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add a reward to a referral
router.post('/:id/rewards', auth, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { type, amount, description } = req.body;
    
    // Validate input
    if (!['discount', 'credit', 'points'].includes(type) || amount <= 0) {
      return res.status(400).json({ error: 'Invalid reward details' });
    }
    
    const referral = await Referral.findById(id);
    
    if (!referral) {
      return res.status(404).json({ error: 'Referral not found' });
    }
    
    // Add the new reward
    referral.rewards.push({
      type,
      amount,
      description,
      createdAt: new Date(),
      used: false
    });
    
    await referral.save();
    
    res.json(referral);
  } catch (error) {
    console.error('Error adding reward:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET comprehensive referral statistics
router.get('/stats', auth, adminOnly, async (req, res) => {
  try {
    // Get all referrals from the database
    const referrals = await Referral.find({});
    
    // Calculate total rewards across all referrals
    let totalRewards = 0;
    let totalReferredDiscounts = 0;
    
    referrals.forEach(referral => {
      // Sum up rewards for referrers
      if (referral.rewards && referral.rewards.length > 0) {
        referral.rewards.forEach(reward => {
          totalRewards += reward.amount || 0;
        });
      }
      
      // Sum up discounts for referred users
      if (referral.referredDiscountAmount) {
        totalReferredDiscounts += referral.referredDiscountAmount;
      }
    });
    
    // Count statistics
    const totalReferrals = referrals.length;
    const successfulReferrals = referrals.filter(r => r.status === 'purchased').length;
    const pendingReferrals = referrals.filter(r => r.status === 'registered').length;
    const activeReferrals = successfulReferrals;
    const conversionRate = totalReferrals > 0 ? (successfulReferrals / totalReferrals) * 100 : 0;
    
    // Get unique count of referred users (some might have multiple referrals)
    const uniqueReferredUsers = new Set(referrals.map(r => r.referredUserId)).size;
    
    res.json({
      totalReferrals,
      activeReferrals,
      successfulReferrals,
      pendingReferrals,
      totalRewards,
      totalReferredDiscounts,
      conversionRate: parseFloat(conversionRate.toFixed(2)),
      totalReferredUsers: uniqueReferredUsers
    });
  } catch (error) {
    console.error('Error fetching referral stats:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router; 