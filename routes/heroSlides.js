import express from 'express';
import { auth } from '../middleware/auth.js';
import { adminOnly } from '../middleware/adminOnly.js';
import HeroSlide from '../models/HeroSlide.js';

const router = express.Router();

// Get all hero slides (public)
router.get('/', async (req, res) => {
  try {
    const slides = await HeroSlide.find({})
      .sort({ order: 1 });
    
    res.json(slides);
  } catch (error) {
    console.error('Error fetching hero slides:', error);
    res.status(500).json({ error: 'Failed to fetch hero slides' });
  }
});

// Create new slide (admin only)
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { image, mobileImage, title, subtitle, cta, link } = req.body;
    
    if (!image) {
      return res.status(400).json({ error: 'Image is required' });
    }
    
    // Get highest order to append new slide at the end
    const highestOrderSlide = await HeroSlide.findOne().sort('-order');
    const newOrder = highestOrderSlide ? highestOrderSlide.order + 1 : 0;
    
    const newSlide = new HeroSlide({
      image,
      mobileImage,
      title,
      subtitle,
      cta,
      link: link || '/',
      order: newOrder
    });
    
    await newSlide.save();
    res.status(201).json(newSlide);
  } catch (error) {
    console.error('Error creating hero slide:', error);
    res.status(500).json({ error: 'Failed to create hero slide' });
  }
});

// Update a slide (admin only)
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const slideId = req.params.id;
    const { image, mobileImage, title, subtitle, cta, link, order } = req.body;
    
    if (!image) {
      return res.status(400).json({ error: 'Image is required' });
    }
    
    const updateData = {
      image,
      mobileImage,
      title,
      subtitle,
      cta,
      link: link || '/',
      order: order !== undefined ? order : 0,
      updatedAt: new Date()
    };
    
    const updatedSlide = await HeroSlide.findByIdAndUpdate(
      slideId,
      updateData,
      { new: true }
    );
    
    if (!updatedSlide) {
      return res.status(404).json({ error: 'Slide not found' });
    }
    
    res.json(updatedSlide);
  } catch (error) {
    console.error('Error updating hero slide:', error);
    res.status(500).json({ error: 'Failed to update hero slide' });
  }
});

// Delete a slide (admin only)
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const slideId = req.params.id;
    
    const deletedSlide = await HeroSlide.findByIdAndDelete(slideId);
    
    if (!deletedSlide) {
      return res.status(404).json({ error: 'Slide not found' });
    }
    
    // Update order of remaining slides
    await HeroSlide.updateMany(
      { order: { $gt: deletedSlide.order } },
      { $inc: { order: -1 } }
    );
    
    res.json({ message: 'Slide deleted successfully' });
  } catch (error) {
    console.error('Error deleting hero slide:', error);
    res.status(500).json({ error: 'Failed to delete hero slide' });
  }
});

// Update order of slides (admin only)
router.put('/order', auth, adminOnly, async (req, res) => {
  try {
    const { slides } = req.body;
    
    if (!slides || !Array.isArray(slides)) {
      return res.status(400).json({ error: 'Slides array is required' });
    }
    
    // Update each slide with new order
    const updatePromises = slides.map(slide => 
      HeroSlide.findByIdAndUpdate(
        slide.id, 
        { order: slide.order, updatedAt: new Date() }
      )
    );
    
    await Promise.all(updatePromises);
    
    const updatedSlides = await HeroSlide.find({}).sort({ order: 1 });
    res.json(updatedSlides);
  } catch (error) {
    console.error('Error updating slides order:', error);
    res.status(500).json({ error: 'Failed to update slides order' });
  }
});

export default router; 