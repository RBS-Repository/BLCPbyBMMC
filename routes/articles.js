import express from 'express';
import { auth } from '../middleware/auth.js';
import { adminOnly } from '../middleware/adminOnly.js';
import Article from '../models/Article.js';
import slugify from 'slugify';

const router = express.Router();

// Add a test endpoint
router.get('/test', (req, res) => {
  res.json({ message: 'Articles API is working!' });
});

// Get all articles (public)
router.get('/', async (req, res) => {
  try {
    const articles = await Article.find().sort({ createdAt: -1 });
    res.json(articles);
  } catch (error) {
    console.error('Error fetching articles:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get a single article by ID (public)
router.get('/:id', async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) {
      return res.status(404).json({ message: 'Article not found' });
    }
    res.json(article);
  } catch (error) {
    console.error('Error fetching article:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get a single article by slug (public)
router.get('/by-slug/:slug', async (req, res) => {
  try {
    const article = await Article.findOne({ slug: req.params.slug });
    if (!article) {
      return res.status(404).json({ message: 'Article not found' });
    }
    res.json(article);
  } catch (error) {
    console.error('Error fetching article by slug:', error);
    res.status(500).json({ message: error.message });
  }
});

// Create a new article (admin only)
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    console.log('Received article data:', req.body);
    
    // Validate required fields
    const { title, excerpt, content, category, image } = req.body;
    
    if (!title || !excerpt || !content || !category) {
      return res.status(400).json({ 
        message: 'Missing required fields', 
        required: ['title', 'excerpt', 'content', 'category'],
        received: Object.keys(req.body)
      });
    }
    
    // Default image if not provided
    const articleImage = image || 'https://via.placeholder.com/800x400?text=Article+Image';
    
    // Generate a slug from title to ensure uniqueness
    const timestamp = Date.now().toString(36);
    const slug = slugify(title, {
      lower: true,
      strict: true,
      trim: true
    }) + `-${timestamp}`;
    
    const newArticle = new Article({
      title,
      slug,  // Add the generated slug
      excerpt,
      content,
      category,
      image: articleImage,
      featured: req.body.featured || false,
      readTime: req.body.readTime || '5 min read',
      author: req.body.author || 'BLCP Team',
      updatedBy: req.user.uid,
    });
    
    const savedArticle = await newArticle.save();
    console.log('Article saved successfully:', savedArticle._id);
    
    res.status(201).json(savedArticle);
  } catch (error) {
    console.error('Error creating article:', error);
    res.status(500).json({ 
      message: 'Failed to create article',
      error: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined 
    });
  }
});

// Update an article (admin only)
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    console.log('Updating article ID:', req.params.id);
    console.log('Update data:', req.body);
    
    const { title, excerpt, content, category, image, featured, readTime, author } = req.body;
    
    // Validate required fields
    if (!title || !excerpt || !content || !category) {
      return res.status(400).json({ 
        message: 'Missing required fields',
        required: ['title', 'excerpt', 'content', 'category'],
        received: Object.keys(req.body)
      });
    }
    
    // Generate a new slug if title has changed
    const article = await Article.findById(req.params.id);
    if (!article) {
      return res.status(404).json({ message: 'Article not found' });
    }
    
    // Only generate a new slug if title has changed
    let slug = article.slug;
    if (article.title !== title) {
      const timestamp = Date.now().toString(36);
      slug = slugify(title, {
        lower: true,
        strict: true,
        trim: true
      }) + `-${timestamp}`;
    }
    
    const updatedArticle = await Article.findByIdAndUpdate(
      req.params.id,
      {
        title,
        slug,  // Update the slug if needed
        excerpt,
        content,
        category,
        image: image || 'https://via.placeholder.com/800x400?text=Article+Image',
        featured: featured || false,
        readTime: readTime || '5 min read',
        author: author || 'BLCP Team',
        updatedAt: new Date(),
        updatedBy: req.user.uid,
      },
      { new: true }
    );
    
    console.log('Article updated successfully');
    res.json(updatedArticle);
  } catch (error) {
    console.error('Error updating article:', error);
    res.status(500).json({ 
      message: 'Failed to update article',
      error: error.message
    });
  }
});

// Delete an article (admin only)
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    console.log('Deleting article ID:', req.params.id);
    
    const article = await Article.findByIdAndDelete(req.params.id);
    
    if (!article) {
      return res.status(404).json({ message: 'Article not found' });
    }
    
    console.log('Article deleted successfully');
    res.json({ message: 'Article deleted successfully' });
  } catch (error) {
    console.error('Error deleting article:', error);
    res.status(500).json({ message: error.message });
  }
});

export default router; 