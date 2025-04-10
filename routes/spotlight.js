import express from 'express';
import { auth } from '../middleware/auth.js';
import { adminOnly } from '../middleware/adminOnly.js';
import Spotlight from '../models/Spotlight.js';

const router = express.Router();

/**
 * @route   GET /api/spotlight
 * @desc    Get spotlight data
 * @access  Public
 */
router.get('/', async (req, res) => {
  try {
    // Since there's only one spotlight document, we'll use findOrCreate
    const spotlight = await Spotlight.findOrCreate();
    
    res.json(spotlight);
  } catch (error) {
    console.error('Error fetching spotlight data:', error);
    res.status(500).json({ error: 'Failed to fetch spotlight data' });
  }
});

/**
 * @route   POST /api/spotlight
 * @desc    Update spotlight data
 * @access  Admin only
 */
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { hero, products, promotionBanner } = req.body;
    
    // Validate required fields
    if (!hero || !products || !promotionBanner) {
      return res.status(400).json({ error: 'Missing required spotlight sections' });
    }
    
    // Get existing spotlight or create default
    const spotlight = await Spotlight.findOrCreate(req.user.uid);
    
    // Update fields
    spotlight.hero = hero;
    spotlight.products = products;
    spotlight.promotionBanner = promotionBanner;
    spotlight.lastUpdated = new Date();
    spotlight.updatedBy = req.user.uid;
    
    await spotlight.save();
    
    res.json(spotlight);
  } catch (error) {
    console.error('Error updating spotlight data:', error);
    res.status(500).json({ error: 'Failed to update spotlight data' });
  }
});

/**
 * @route   GET /api/spotlight/stats
 * @desc    Get spotlight stats (e.g., last updated)
 * @access  Admin only
 */
router.get('/stats', auth, adminOnly, async (req, res) => {
  try {
    const spotlight = await Spotlight.findOne({});
    
    if (!spotlight) {
      return res.status(404).json({ error: 'Spotlight data not found' });
    }
    
    // Return just the metadata/stats
    res.json({
      lastUpdated: spotlight.lastUpdated,
      updatedBy: spotlight.updatedBy,
      productsCount: spotlight.products.length
    });
  } catch (error) {
    console.error('Error fetching spotlight stats:', error);
    res.status(500).json({ error: 'Failed to fetch spotlight stats' });
  }
});

/**
 * @route   DELETE /api/spotlight/reset
 * @desc    Reset spotlight data to defaults
 * @access  Admin only
 */
router.delete('/reset', auth, adminOnly, async (req, res) => {
  try {
    // Delete existing spotlight data
    await Spotlight.deleteMany({});
    
    // Create fresh default data
    const spotlight = await Spotlight.findOrCreate(req.user.uid);
    
    res.json({ 
      message: 'Spotlight data reset to defaults',
      spotlight 
    });
  } catch (error) {
    console.error('Error resetting spotlight data:', error);
    res.status(500).json({ error: 'Failed to reset spotlight data' });
  }
});

export default router; 