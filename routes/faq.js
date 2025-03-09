import express from 'express';
import { auth } from '../middleware/auth.js';
import { adminOnly } from '../middleware/adminOnly.js';
import FaqContent from '../models/FaqContent.js';

const router = express.Router();

// Get FAQ content
router.get('/', async (req, res) => {
  try {
    // Get the first FAQ document (we'll only have one)
    let faqContent = await FaqContent.findOne();
    
    // If no FAQ content exists, return empty categories
    if (!faqContent) {
      return res.json({ categories: [] });
    }
    
    res.json(faqContent);
  } catch (error) {
    console.error('Error fetching FAQ content:', error);
    res.status(500).json({ message: error.message });
  }
});

// Update FAQ content (admin only)
router.put('/', auth, adminOnly, async (req, res) => {
  try {
    const { categories } = req.body;
    
    // Upsert the FAQ content (update if exists, create if not)
    const faqContent = await FaqContent.findOneAndUpdate(
      {}, // empty filter to match any document
      { 
        categories,
        lastUpdated: new Date(),
        updatedBy: req.user.uid
      },
      { new: true, upsert: true }
    );
    
    res.json(faqContent);
  } catch (error) {
    console.error('Error updating FAQ content:', error);
    res.status(500).json({ message: error.message });
  }
});

// Add this route at the top of your routes:
router.get('/test', (req, res) => {
  res.json({ message: 'FAQ API is working!' });
});

export default router; 