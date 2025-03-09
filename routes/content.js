import express from 'express';
import { auth } from '../middleware/auth.js';
import { adminOnly } from '../middleware/adminOnly.js';
import Content from '../models/Content.js';

const router = express.Router();

// Get content for a specific page
router.get('/:pageId', async (req, res) => {
  try {
    const { pageId } = req.params;
    
    const content = await Content.findOne({ pageId });
    
    if (!content) {
      return res.status(404).json({ message: 'Content not found' });
    }
    
    res.json(content);
  } catch (error) {
    console.error('Error fetching content:', error);
    res.status(500).json({ message: error.message });
  }
});

// Update content for a specific page (admin only)
router.put('/:pageId', auth, adminOnly, async (req, res) => {
  try {
    const { pageId } = req.params;
    const { title, sections } = req.body;
    
    const content = await Content.findOneAndUpdate(
      { pageId },
      { 
        $set: { 
          title, 
          sections,
          lastUpdated: new Date(),
          updatedBy: req.user.uid
        }
      },
      { new: true, upsert: true }
    );
    
    res.json(content);
  } catch (error) {
    console.error('Error updating content:', error);
    res.status(500).json({ message: error.message });
  }
});

// Create initial content if it doesn't exist
router.post('/init/:pageId', auth, adminOnly, async (req, res) => {
  try {
    const { pageId } = req.params;
    const { title, sections } = req.body;
    
    // Check if content already exists
    const existingContent = await Content.findOne({ pageId });
    if (existingContent) {
      return res.status(400).json({ 
        message: 'Content already exists for this page',
        content: existingContent
      });
    }
    
    // Create new content
    const newContent = new Content({
      pageId,
      title,
      sections,
      createdBy: req.user.uid,
      updatedBy: req.user.uid
    });
    
    await newContent.save();
    res.status(201).json(newContent);
  } catch (error) {
    console.error('Error creating initial content:', error);
    res.status(500).json({ message: error.message });
  }
});

// Add a test route to verify API connectivity
router.get('/test', (req, res) => {
  res.json({ message: 'Content API is working!' });
});

export default router; 