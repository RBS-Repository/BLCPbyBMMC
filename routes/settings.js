import express from 'express';
import { auth } from '../middleware/auth.js';
import { adminOnly } from '../middleware/adminOnly.js';
import Setting from '../models/Setting.js';
import admin from '../config/firebase-admin.js';

const router = express.Router();

// Add a simple test route at the top of the file
router.get('/test', (req, res) => {
  res.json({ message: 'Settings routes are working!' });
});

// Get shipping settings
router.get('/shipping', auth, async (req, res) => {
  try {
    const shippingSettings = await Setting.findOne({ key: 'shipping' });
    
    if (!shippingSettings) {
      return res.json({ 
        standardShipping: 150, 
        freeShippingThreshold: 10000 
      });
    }
    
    res.json(shippingSettings.value);
  } catch (error) {
    console.error('Error fetching shipping settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update shipping settings
router.put('/shipping', auth, adminOnly, async (req, res) => {
  try {
    const { standardShipping, freeShippingThreshold } = req.body;
    
    if (standardShipping === undefined || freeShippingThreshold === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Upsert the shipping settings
    const shippingSettings = await Setting.findOneAndUpdate(
      { key: 'shipping' },
      {
        key: 'shipping',
        value: {
          standardShipping,
          freeShippingThreshold
        },
        updatedAt: new Date()
      },
      { upsert: true, new: true }
    );
    
    res.json(shippingSettings.value);
  } catch (error) {
    console.error('Error updating shipping settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get referral settings
router.get('/referrals', async (req, res) => {
  try {
    // Get settings from Firebase
    const settingsDoc = await admin.firestore().collection('settings').doc('referrals').get();
    
    // Use default settings if not found
    const settings = settingsDoc.exists ? settingsDoc.data() : {
      referrerDiscount: 10,        // Percentage or fixed amount for referrer
      referredDiscount: 15,        // Percentage or fixed amount for new user
      minimumPurchase: 50,         // Minimum order amount to qualify
      maxReferralReward: 200,      // Maximum reward per referral
      expirationDays: 60,          // How long rewards are valid
      currency: '₱',
      creditCalculation: 'percentage', // 'percentage' or 'fixed'
      maxRewardPercentage: 25      // Max percentage if using percentage calculation
    };
    
    res.json(settings);
  } catch (error) {
    console.error('Error fetching referral settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update referral settings (admin only)
router.put('/referrals', auth, adminOnly, async (req, res) => {
  try {
    const settings = req.body;
    
    // Validate settings
    if (settings.maxRewardPercentage !== undefined && 
        (settings.maxRewardPercentage < 0 || settings.maxRewardPercentage > 100)) {
      return res.status(400).json({ error: 'Reward percentage must be between 0 and 100' });
    }
    
    // Update settings in Firebase
    await admin.firestore().collection('settings').doc('referrals').set(settings, { merge: true });
    
    res.json({ success: true, message: 'Referral settings updated' });
  } catch (error) {
    console.error('Error updating referral settings:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router; 