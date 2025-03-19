import express from 'express';
import mongoose from 'mongoose';
import { auth } from '../middleware/auth.js';
import { adminOnly } from '../middleware/adminOnly.js';
import Product from '../models/Product.js';
import Category from '../models/Category.js';

const router = express.Router();

// Get all categories with detailed logging
router.get('/', async (req, res) => {
  try {
    console.log('\n==== Fetching Categories from MongoDB ====');
    // Directly output all categories in the collection for debugging
    const allCategories = await Category.find({}).lean();
    console.log('Raw categories from MongoDB:', allCategories);
    
    const categoryNames = allCategories.map(cat => cat.name);
    console.log('Returning category names:', categoryNames);
    
    res.json(categoryNames);
  } catch (error) {
    console.error('Error fetching categories from MongoDB:', error);
    res.status(500).json({ message: error.message });
  }
});

// Add new category with detailed logging
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    console.log('\n==== Adding New Category ====');
    const { name } = req.body;
    console.log('Category name received:', name);
    
    if (!name || typeof name !== 'string' || name.trim() === '') {
      console.log('Invalid category name');
      return res.status(400).json({ message: 'Category name is required' });
    }
    
    // Check if category already exists
    console.log('Checking if category exists...');
    const existingCategory = await Category.findOne({ 
      name: { $regex: new RegExp(`^${name}$`, 'i') } 
    });
    
    if (existingCategory) {
      console.log('Category already exists:', existingCategory);
      return res.status(400).json({ message: 'Category already exists' });
    }
    
    // Create a new category
    console.log('Creating new category in database...');
    const newCategory = new Category({ name });
    const savedCategory = await newCategory.save();
    console.log('Category saved successfully:', savedCategory);
    
    res.status(201).json({ 
      name, 
      message: 'Category added successfully',
      _id: savedCategory._id
    });
  } catch (error) {
    console.error('Error adding category:', error);
    res.status(500).json({ message: error.message });
  }
});

// Delete category
router.delete('/:name', auth, adminOnly, async (req, res) => {
  try {
    const { name } = req.params;
    
    // Check if category is in use
    const productsUsingCategory = await Product.countDocuments({ category: name });
    
    if (productsUsingCategory > 0) {
      return res.status(400).json({ 
        message: `Cannot delete category "${name}" because it's used by ${productsUsingCategory} products` 
      });
    }
    
    // Delete the category from the database
    await Category.findOneAndDelete({ name });
    
    res.json({ message: `Category "${name}" deleted successfully` });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get products using a specific category
router.get('/:name/products', auth, adminOnly, async (req, res) => {
  try {
    const { name } = req.params;
    
    // Find products using this category
    const products = await Product.find({ category: name }, 'name _id stock');
    
    res.json(products);
  } catch (error) {
    console.error('Error fetching products by category:', error);
    res.status(500).json({ message: error.message });
  }
});

// Reassign products from one category to another
router.post('/:name/reassign', auth, adminOnly, async (req, res) => {
  try {
    const { name } = req.params;
    const { newCategory } = req.body;
    
    if (!newCategory) {
      return res.status(400).json({ message: 'New category is required' });
    }
    
    // Update all products with the old category to use the new category
    const result = await Product.updateMany(
      { category: name },
      { $set: { category: newCategory } }
    );
    
    res.json({ 
      message: `Updated ${result.modifiedCount} products from "${name}" to "${newCategory}"`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Error reassigning products:', error);
    res.status(500).json({ message: error.message });
  }
});

export default router; 