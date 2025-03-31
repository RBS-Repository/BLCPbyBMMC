import express from 'express';
import mongoose from 'mongoose';
import Product from '../models/Product.js';
import { auth } from '../middleware/auth.js';
import { adminOnly } from '../middleware/adminOnly.js';

const router = express.Router();

// GET all products
router.get('/', async (req, res) => {
  try {
    const { search, category, showAll } = req.query;
    const query = {};
    
    // Only filter by active status and stock for non-admin/public requests
    if (!showAll) {
      query.status = 'active';
      query.stock = { $gt: 0 }; // Only show products with stock > 0
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } }
      ];
    }

    if (category && category !== 'all') {
      query.category = category;
    }

    const products = await Product.find(query)
      .sort({ createdAt: -1 })
      .lean();

    res.json(products);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET all products (for admin) - includes both active and inactive
router.get('/admin', auth, adminOnly, async (req, res) => {
  try {
    const { search, category } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } }
      ];
    }

    if (category && category !== 'all') {
      query.category = category;
    }

    const products = await Product.find(query)
      .sort({ createdAt: -1 })
      .lean();

    res.json(products);
  } catch (error) {
    console.error("Error fetching products for admin:", error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET product by ID - Make it public
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { showAll } = req.query; // Add this parameter for admin access
    
    console.log('Attempting to fetch product with ID:', id);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.log('Invalid MongoDB ID format:', id);
      return res.status(400).json({ message: 'Invalid product ID format' });
    }

    const product = await Product.findById(id);
    console.log('Found product:', product);

    if (!product) {
      console.log('No product found with ID:', id);
      return res.status(404).json({ message: 'Product not found' });
    }

    // For non-admin users, check if product is active and in stock
    if (!showAll && (product.status !== 'active' || product.stock <= 0)) {
      console.log('Product exists but is inactive or out of stock:', id);
      return res.status(404).json({ message: 'Product not available' });
    }

    res.json(product);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create product - protected by both auth and admin middleware
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    console.log('Product creation request body:', req.body);
    
    // CRITICAL FIX: Explicitly cast images to array if it exists
    let processedImages = [];
    if (req.body.images) {
      if (Array.isArray(req.body.images)) {
        processedImages = [...req.body.images];
      } else if (typeof req.body.images === 'string') {
        processedImages = [req.body.images];
      } else {
        console.warn('Unexpected images format:', typeof req.body.images);
      }
    }
    
    console.log('Processed images array:', {
      originalImages: req.body.images,
      processedImages: processedImages,
      isArray: Array.isArray(processedImages),
      length: processedImages.length
    });
    
    // Direct MongoDB insert approach
    try {
      // Try a direct MongoDB insert
      const productData = {
        name: req.body.name,
        description: req.body.description,
        price: req.body.price,
        category: req.body.category,
        stock: req.body.stock,
        minOrder: req.body.minOrder,
        targetMarketKeyFeatures: req.body.targetMarketKeyFeatures || [],
        targetMarket: req.body.targetMarket || [],
        image: req.body.image || null,
        images: processedImages, // Use our explicitly processed array
        status: req.body.status || 'active',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      // Create via mongoose model
      const product = new Product(productData);
      console.log('Product model instance created:', {
        hasImagesProperty: product.hasOwnProperty('images'),
        imagesValue: product.images,
        imagesIsArray: Array.isArray(product.images),
        imagesLength: product.images?.length || 0
      });
      
      const savedProduct = await product.save();
      console.log('Product saved to database:', {
        id: savedProduct._id,
        hasImagesInSaved: savedProduct.hasOwnProperty('images'),
        savedImages: savedProduct.images,
        savedImagesIsArray: Array.isArray(savedProduct.images)
      });
      
      // Force a fresh retrieval of the product to verify what was actually saved
      const retrievedProduct = await Product.findById(savedProduct._id);
      console.log('Freshly retrieved product:', {
        id: retrievedProduct._id,
        hasImages: retrievedProduct.hasOwnProperty('images'),
        retrievedImages: retrievedProduct.images,
        retrievedImagesIsArray: Array.isArray(retrievedProduct.images)
      });
      
      res.status(201).json(retrievedProduct);
    } catch (mongooseError) {
      console.error('Mongoose operation error:', mongooseError);
      throw mongooseError;
    }
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ message: error.message });
  }
});

// Update product
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    console.log('Product update request body:', req.body);
    
    // CRITICAL FIX: Explicitly cast images to array if it exists
    let processedImages = [];
    if (req.body.images) {
      if (Array.isArray(req.body.images)) {
        processedImages = [...req.body.images];
      } else if (typeof req.body.images === 'string') {
        processedImages = [req.body.images];
      } else {
        console.warn('Unexpected images format in update:', typeof req.body.images);
      }
    }
    
    console.log('Processed images for update:', {
      originalImages: req.body.images,
      processedImages: processedImages,
      isArray: Array.isArray(processedImages),
      length: processedImages.length
    });
    
    // Explicitly set all fields in the update
    const updateData = {
      name: req.body.name,
      description: req.body.description,
      price: req.body.price,
      category: req.body.category,
      stock: req.body.stock,
      minOrder: req.body.minOrder,
      targetMarketKeyFeatures: req.body.targetMarketKeyFeatures || [],
      targetMarket: req.body.targetMarket || [],
      image: req.body.image || null,
      images: processedImages, // Use our explicitly processed array
      status: req.body.status || 'active',
      updatedAt: new Date()
    };
    
    // Update with the processed data
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!updatedProduct) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    // Double-check what was actually saved
    const retrievedProduct = await Product.findById(updatedProduct._id);
    console.log('Updated product retrieved:', {
      id: retrievedProduct._id,
      hasImages: retrievedProduct.hasOwnProperty('images'),
      images: retrievedProduct.images,
      imagesIsArray: Array.isArray(retrievedProduct.images),
      imagesLength: retrievedProduct.images?.length || 0
    });
    
    res.json(retrievedProduct);
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ message: error.message });
  }
});

// Delete product
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.json({ message: 'Product deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/check-stock', async (req, res) => {
  try {
    const stockInfo = await Promise.all(
      req.body.items.map(async item => {
        const product = await Product.findById(item.productId);
        return {
          productId: item.productId,
          available: product?.stock || 0,
          requested: item.quantity
        };
      })
    );
    
    res.json(stockInfo);
  } catch (error) {
    res.status(500).json({ error: 'Failed to check stock' });
  }
});

console.log('Products routes loaded:');
router.stack.forEach(layer => {
  if (layer.route) {
    console.log(`${layer.route.stack[0].method.toUpperCase()} ${layer.route.path}`);
  }
});

export default router; 