import express from 'express';
import mongoose from 'mongoose';
import { auth } from '../../middleware/auth.js';
import { adminOnly } from '../../middleware/adminOnly.js';
import Reward from '../../models/Reward.js';

const router = express.Router();

// Test endpoint to verify admin access
router.get('/test', auth, adminOnly, async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Admin access confirmed',
      userId: req.user.uid,
      timestamp: new Date(),
      isAdmin: true
    });
  } catch (error) {
    console.error('Error in admin test endpoint:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get rewards for a specific user from MongoDB
router.get('/:userId/rewards', auth, adminOnly, async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    // Get rewards from MongoDB for this specific user
    const rewards = await Reward.find({ 
      referredUserId: userId 
    }).sort({ createdAt: -1 });
    
    console.log(`Found ${rewards.length} rewards in MongoDB for user ${userId}`);
    
    res.json(rewards);
  } catch (error) {
    console.error(`Error fetching rewards for user ${req.params.userId}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Get user's reward history (same data as the user can see)
router.get('/:userId/rewards-history', auth, adminOnly, async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    // Get all rewards where this user is the recipient (their own rewards)
    const rewards = await Reward.find({ userId }).sort({ createdAt: -1 });
    
    // Calculate available rewards (pending status and not expired)
    const availableRewards = rewards
      .filter(reward => 
        reward.status === 'pending' && 
        new Date(reward.expiresAt) > new Date()
      )
      .reduce((sum, reward) => sum + reward.amount, 0);
    
    console.log(`Found ${rewards.length} rewards for user ${userId}. Available balance: ${availableRewards}`);
    
    res.json({
      rewards,
      availableRewards,
      totalCount: rewards.length
    });
  } catch (error) {
    console.error(`Error fetching reward history for user ${req.params.userId}:`, error);
    res.status(500).json({ error: error.message });
  }
});

export default router; 