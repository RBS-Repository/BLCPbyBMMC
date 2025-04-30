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
    // Get all categories with parent category populated
    const allCategories = await Category.find({})
      .populate('parentCategory', 'name')
      .sort({ level: 1, name: 1 })
      .lean();
    
    console.log(`Fetched ${allCategories.length} categories from MongoDB`);
    
    res.json(allCategories);
  } catch (error) {
    console.error('Error fetching categories from MongoDB:', error);
    res.status(500).json({ message: error.message });
  }
});

// Add new category with detailed logging
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    console.log('\n==== Adding New Category ====');
    const { name, description, parentCategory } = req.body;
    console.log('Category data received:', { name, description, parentCategory });
    
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
    
    // Prepare category data
    const categoryData = { 
      name,
      description: description || '' 
    };
    
    // Handle parent category assignment
    if (parentCategory) {
      console.log(`Parent category ID specified: ${parentCategory}`);
      
      // Validate parent ID
      if (!mongoose.Types.ObjectId.isValid(parentCategory)) {
        console.log('Invalid parent category ID format');
        return res.status(400).json({ message: 'Invalid parent category ID format' });
      }
      
      // Check if parent exists
      const parentExists = await Category.findById(parentCategory);
      if (!parentExists) {
        console.log('Parent category not found');
        return res.status(404).json({ message: 'Parent category not found' });
      }
      
      console.log(`Parent category found: ${parentExists.name}`);
      categoryData.parentCategory = parentCategory;
      categoryData.level = (parentExists.level || 0) + 1;
    }
    
    // Create a new category
    console.log('Creating new category with data:', categoryData);
    const newCategory = new Category(categoryData);
    const savedCategory = await newCategory.save();
    console.log('Category saved successfully:', savedCategory);
    
    res.status(201).json({ 
      ...savedCategory._doc,
      message: 'Category added successfully'
    });
  } catch (error) {
    console.error('Error adding category:', error);
    res.status(500).json({ message: error.message });
  }
});

// Update category
router.patch('/:id', auth, adminOnly, async (req, res) => {
  try {
    console.log('\n==== Updating Category ====');
    const { id } = req.params;
    const { name, description, parentCategory, isActive } = req.body;
    
    console.log('Update request for category ID:', id);
    console.log('Update data:', { name, description, parentCategory, isActive });
    
    // Validate ID format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid category ID format' });
    }
    
    // Find the category
    const category = await Category.findById(id);
    
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    
    // Check if name is being changed and if the new name already exists
    if (name && name !== category.name) {
      const existingCategory = await Category.findOne({ 
        name: { $regex: new RegExp(`^${name}$`, 'i') },
        _id: { $ne: id } // Exclude current category
      });
      
      if (existingCategory) {
        return res.status(400).json({ message: 'A category with this name already exists' });
      }
    }
    
    // If changing parent, ensure we're not creating a circular reference
    if (parentCategory && parentCategory !== category.parentCategory?.toString()) {
      // Check if the new parent is valid
      if (parentCategory !== 'null' && !mongoose.Types.ObjectId.isValid(parentCategory)) {
        return res.status(400).json({ message: 'Invalid parent category ID' });
      }
      
      // If setting to a real parent (not null)
      if (parentCategory !== 'null') {
        // Check if parent exists
        const parentExists = await Category.findById(parentCategory);
        if (!parentExists) {
          return res.status(404).json({ message: 'Parent category not found' });
        }
        
        // Check for circular reference (ensure parent is not a descendant)
        const isCircular = await checkCircularReference(id, parentCategory);
        if (isCircular) {
          return res.status(400).json({ message: 'Cannot set a descendant as parent (circular reference)' });
        }
      }
    }
    
    // Update category fields
    if (name) category.name = name;
    if (description !== undefined) category.description = description;
    
    // Handle parent category (can be set to null to make it a root category)
    if (parentCategory === 'null' || parentCategory === '') {
      category.parentCategory = null;
    } else if (parentCategory) {
      category.parentCategory = parentCategory;
    }
    
    if (isActive !== undefined) category.isActive = isActive;
    
    // Save the updated category
    const updatedCategory = await category.save();
    
    // Update categoryName and categoryPath in all products using this category
    if (name && name !== category.name) {
      const productsToUpdate = await Product.find({ category: id });
      
      for (const product of productsToUpdate) {
        product.categoryName = name;
        product.categoryPath = await Category.getCategoryPath(id);
        await product.save();
      }
      
      console.log(`Updated category name in ${productsToUpdate.length} products`);
    }
    
    console.log('Category updated successfully:', updatedCategory);
    
    res.json({
      message: 'Category updated successfully',
      category: updatedCategory
    });
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ message: error.message });
  }
});

// Helper function to check for circular references
async function checkCircularReference(categoryId, potentialParentId) {
  let currentParentId = potentialParentId;
  const visited = new Set();
  
  while (currentParentId) {
    // If we've already seen this ID or it matches our category, it's circular
    if (visited.has(currentParentId) || currentParentId === categoryId) {
      return true;
    }
    
    visited.add(currentParentId);
    
    // Get the parent's parent
    const parent = await Category.findById(currentParentId);
    if (!parent || !parent.parentCategory) {
      break;
    }
    
    currentParentId = parent.parentCategory.toString();
  }
  
  return false;
}

// Delete category
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('\n==== Deleting Category ====');
    console.log('Delete request for category ID:', id);
    
    // Validate ID format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid category ID format' });
    }
    
    // Find the category
    const category = await Category.findById(id);
    
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    
    // Check if category has child categories
    const childCategories = await Category.countDocuments({ parentCategory: id });
    
    if (childCategories > 0) {
      return res.status(400).json({
        message: `Cannot delete category "${category.name}" because it has ${childCategories} child categories`
      });
    }
    
    // Check if category is in use by products
    const productsUsingCategory = await Product.countDocuments({ category: id });
    
    if (productsUsingCategory > 0) {
      return res.status(400).json({ 
        message: `Cannot delete category "${category.name}" because it's used by ${productsUsingCategory} products` 
      });
    }
    
    // Delete the category
    await Category.findByIdAndDelete(id);
    
    res.json({ 
      message: `Category "${category.name}" deleted successfully`,
      deletedCategory: category
    });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get products using a specific category
router.get('/:id/products', auth, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('\n==== Fetching Products by Category ====');
    console.log('Category ID:', id);
    
    // Validate ID format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid category ID format' });
    }
    
    // Find the category
    const category = await Category.findById(id);
    
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    
    // Find products using this category
    const products = await Product.find({ category: id }, 'name _id stock image price status');
    
    console.log(`Found ${products.length} products in category "${category.name}"`);
    
    res.json(products);
  } catch (error) {
    console.error('Error fetching products by category:', error);
    res.status(500).json({ message: error.message });
  }
});

// Reassign products from one category to another
router.post('/:id/reassign', auth, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { newCategoryId } = req.body;
    
    console.log('\n==== Reassigning Products ====');
    console.log('From category ID:', id);
    console.log('To category ID:', newCategoryId);
    
    // Validate source category ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid source category ID format' });
    }
    
    // Validate target category ID
    if (!mongoose.Types.ObjectId.isValid(newCategoryId)) {
      return res.status(400).json({ message: 'Invalid target category ID format' });
    }
    
    // Verify both categories exist
    const sourceCategory = await Category.findById(id);
    if (!sourceCategory) {
      return res.status(404).json({ message: 'Source category not found' });
    }
    
    const targetCategory = await Category.findById(newCategoryId);
    if (!targetCategory) {
      return res.status(404).json({ message: 'Target category not found' });
    }
    
    // Update all products from the source category to the target category
    const productsToUpdate = await Product.find({ category: id });
    
    let updatedCount = 0;
    for (const product of productsToUpdate) {
      product.category = newCategoryId;
      product.categoryName = targetCategory.name;
      product.categoryPath = await Category.getCategoryPath(newCategoryId);
      await product.save();
      updatedCount++;
    }
    
    console.log(`Updated ${updatedCount} products from "${sourceCategory.name}" to "${targetCategory.name}"`);
    
    res.json({
      message: `Updated ${updatedCount} products from "${sourceCategory.name}" to "${targetCategory.name}"`,
      modifiedCount: updatedCount
    });
  } catch (error) {
    console.error('Error reassigning products:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get category tree (hierarchical structure)
router.get('/tree', async (req, res) => {
  try {
    console.log('\n==== Fetching Category Tree ====');
    
    // Use the static method to get the tree structure
    const categoryTree = await Category.getCategoryTree();
    
    console.log(`Generated tree with ${categoryTree.length} root categories`);
    
    res.json(categoryTree);
  } catch (error) {
    console.error('Error fetching category tree:', error);
    res.status(500).json({ message: error.message });
  }
});

export default router; 