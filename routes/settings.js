import express from 'express';
import { auth } from '../middleware/auth.js';
import { adminOnly } from '../middleware/adminOnly.js';
import Setting from '../models/Setting.js';

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

export default router; 