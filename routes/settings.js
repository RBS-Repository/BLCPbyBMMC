import express from 'express';
import { auth } from '../middleware/auth.js';
import { adminOnly } from '../middleware/adminOnly.js';
import Setting from '../models/Setting.js';
import admin from '../config/firebase-admin.js';
import mongoose from 'mongoose';

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
    // First try to get settings from MongoDB
    const ReferralSettings = mongoose.model('ReferralSettings');
    const mongoSettings = await ReferralSettings.findOne();
    
    if (mongoSettings) {
      // If MongoDB settings exist, return them
      return res.json({
        minimumPurchase: mongoSettings.minimumPurchase,
        maxReferralReward: mongoSettings.maxReferralReward,
        expirationDays: mongoSettings.expirationDays,
        creditCalculation: mongoSettings.creditCalculation,
        maxRewardPercentage: mongoSettings.maxRewardPercentage,
        referredDiscount: mongoSettings.referredDiscount,
        currency: mongoSettings.currency
      });
    }
    
    // If MongoDB settings don't exist, fall back to Firebase
    const settingsDoc = await admin.firestore().collection('settings').doc('referrals').get();
    
    // Use default settings if not found in either database
    const settings = settingsDoc.exists ? settingsDoc.data() : {
      minimumPurchase: 50,
      maxReferralReward: 200,
      expirationDays: 30,
      creditCalculation: 'percentage',
      maxRewardPercentage: 5,
      referredDiscount: 5,
      currency: '₱'
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
    
    if (settings.referredDiscount !== undefined && 
        (settings.referredDiscount < 0 || settings.referredDiscount > 100)) {
      return res.status(400).json({ error: 'Referred discount must be between 0 and 100' });
    }
    
    if (settings.minimumPurchase !== undefined && settings.minimumPurchase < 0) {
      return res.status(400).json({ error: 'Minimum purchase cannot be negative' });
    }
    
    if (settings.maxReferralReward !== undefined && settings.maxReferralReward < 0) {
      return res.status(400).json({ error: 'Maximum referral reward cannot be negative' });
    }
    
    if (settings.expirationDays !== undefined && settings.expirationDays < 0) {
      return res.status(400).json({ error: 'Expiration days cannot be negative' });
    }
    
    // 1. Update settings in MongoDB
    const ReferralSettings = mongoose.model('ReferralSettings');
    await ReferralSettings.findOneAndUpdate(
      {}, // Empty filter to match any document
      {
        minimumPurchase: settings.minimumPurchase,
        maxReferralReward: settings.maxReferralReward,
        expirationDays: settings.expirationDays,
        creditCalculation: settings.creditCalculation,
        maxRewardPercentage: settings.maxRewardPercentage,
        referredDiscount: settings.referredDiscount,
        currency: settings.currency,
        updatedAt: new Date()
      },
      { new: true, upsert: true }
    );
    
    // 2. Update settings in Firebase
    await admin.firestore().collection('settings').doc('referrals').set(settings, { merge: true });
    
    res.json({ success: true, message: 'Referral settings updated' });
  } catch (error) {
    console.error('Error updating referral settings:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router; 