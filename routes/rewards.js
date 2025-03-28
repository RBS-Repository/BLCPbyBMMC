import express from 'express';
import { auth } from '../middleware/auth.js';
import mongoose from 'mongoose';
import Reward from '../models/Reward.js';
import Order from '../models/Order.js';

const router = express.Router();

// Get reward history for a user
router.get('/history/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Ensure user can only access their own rewards
    if (req.user.uid !== userId) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }
    
    // Get rewards from MongoDB
    const rewards = await Reward.find({ userId }).sort({ createdAt: -1 });
    
    // Calculate available rewards (pending status and not expired)
    const availableRewards = rewards
      .filter(reward => 
        reward.status === 'pending' && 
        new Date(reward.expiresAt) > new Date()
      )
      .reduce((sum, reward) => sum + reward.amount, 0);
    
    res.json({
      rewards,
      availableRewards,
      totalCount: rewards.length
    });
  } catch (error) {
    console.error('Error fetching reward history:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save rewards to MongoDB
router.post('/save', auth, async (req, res) => {
  try {
    const { userId, rewards } = req.body;
    
    // Ensure user can only save their own rewards
    if (req.user.uid !== userId) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }
    
    if (!rewards || !Array.isArray(rewards) || rewards.length === 0) {
      return res.status(400).json({ error: 'No rewards to save' });
    }
    
    // Filter out rewards that already exist in our database (by purchaseId)
    const existingRewards = await Reward.find({
      purchaseId: { $in: rewards.map(r => r.purchaseId) }
    });
    
    const existingPurchaseIds = existingRewards.map(r => r.purchaseId);
    
    // Filter out rewards that have already been saved
    const newRewards = rewards.filter(reward => !existingPurchaseIds.includes(reward.purchaseId));
    
    if (newRewards.length === 0) {
      return res.json({ 
        success: true, 
        message: 'All rewards already saved',
        savedCount: 0
      });
    }
    
    // Save the new rewards
    const savedRewards = await Reward.insertMany(newRewards);
    
    res.json({ 
      success: true, 
      savedCount: savedRewards.length,
      totalRewardsValue: savedRewards.reduce((sum, r) => sum + r.amount, 0)
    });
  } catch (error) {
    console.error('Error saving rewards:', error);
    res.status(500).json({ error: error.message });
  }
});

// Redeem rewards
router.post('/redeem', auth, async (req, res) => {
  try {
    const { userId, amount, orderId } = req.body;
    
    console.log(`Processing reward redemption for user ${userId}, amount: ${amount}, order: ${orderId || 'N/A'}`);
    
    // Validate the inputs more strictly
    if (!userId) {
      console.log('Missing userId in reward redemption request');
      return res.status(400).json({ error: 'Missing userId' });
    }
    
    // Ensure user can only redeem their own rewards
    if (req.user.uid !== userId) {
      console.log(`Unauthorized reward redemption attempt - requested user ${userId} doesn't match authenticated user ${req.user.uid}`);
      return res.status(403).json({ error: 'Unauthorized access' });
    }
    
    // Validate amount
    if (!amount || isNaN(amount) || amount <= 0) {
      console.log(`Invalid redemption amount: ${amount}`);
      return res.status(400).json({ error: 'Invalid redemption amount' });
    }
    
    // Calculate available rewards
    const availableRewards = await Reward.find({ 
      userId,
      status: 'pending',
      expiresAt: { $gt: new Date() }
    }).sort({ expiresAt: 1 });
    
    const totalAvailable = availableRewards.reduce((sum, reward) => sum + reward.amount, 0);
    console.log(`Total available rewards: ${totalAvailable}, requested: ${amount}`);
    console.log(`Found ${availableRewards.length} individual pending rewards`);
    
    if (availableRewards.length === 0) {
      console.log('No available rewards found for this user');
      return res.status(400).json({ 
        error: 'No available rewards found',
        available: 0,
        requested: amount
      });
    }
    
    if (totalAvailable < amount) {
      console.log(`Insufficient rewards balance - available: ${totalAvailable}, requested: ${amount}`);
      return res.status(400).json({ 
        error: 'Insufficient rewards balance',
        available: totalAvailable,
        requested: amount
      });
    }
    
    // Process redemption (starting with rewards expiring soonest)
    let remainingAmount = amount;
    const redeemedRewards = [];
    const now = new Date();
    
    for (const reward of availableRewards) {
      if (remainingAmount <= 0) break;
      
      if (remainingAmount >= reward.amount) {
        // Use the entire reward
        reward.status = 'redeemed';
        reward.redeemedAt = now;
        reward.orderId = orderId; // Store the order ID for tracking
        redeemedRewards.push(reward);
        remainingAmount -= reward.amount;
        console.log(`Fully redeemed reward ${reward._id} - amount: ${reward.amount}`);
      } else {
        // Split the reward
        const usedPortion = remainingAmount;
        
        // Mark the original reward as partially used by reducing its amount
        reward.amount -= usedPortion;
        await reward.save();
        console.log(`Partially used reward ${reward._id} - reduced by: ${usedPortion}, remaining: ${reward.amount}`);
        
        // Create a new record for the redeemed portion
        const redeemedPortion = new Reward({
          userId: reward.userId,
          referredUserId: reward.referredUserId,
          purchaseId: reward.purchaseId ? `${reward.purchaseId}-split` : undefined,
          orderId: orderId, // Store the order ID
          amount: usedPortion,
          orderTotal: reward.orderTotal,
          status: 'redeemed',
          description: `Partial redemption from ${reward.description}`,
          purchaseDate: reward.purchaseDate,
          createdAt: now,
          redeemedAt: now,
          expiresAt: reward.expiresAt
        });
        
        await redeemedPortion.save();
        console.log(`Created redeemed portion: ${redeemedPortion._id} - amount: ${usedPortion}`);
        redeemedRewards.push(redeemedPortion);
        remainingAmount = 0;
      }
    }
    
    // Save all fully redeemed rewards
    await Promise.all(redeemedRewards.filter(r => r.status === 'redeemed').map(r => r.save()));
    console.log(`Successfully saved ${redeemedRewards.length} redeemed rewards`);
    
    // Return detailed success response
    res.json({
      success: true, 
      message: 'Reward redeemed successfully',
      redeemedAmount: amount,
      remainingBalance: totalAvailable - amount,
      orderId: orderId,
      redeemedRewardIds: redeemedRewards.map(r => r._id.toString())
    });
  } catch (error) {
    console.error('Error redeeming rewards:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router; 