import express from 'express';
import mongoose from 'mongoose';
import Product from '../models/Product.js';
import { auth } from '../middleware/auth.js';
import { adminOnly } from '../middleware/adminOnly.js';
import Cart from '../models/Cart.js';

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

    // Process variations for client-side use
    if (product.hasVariations && product.variations) {
      const processedProduct = product.toObject();
      
      // Convert Map to plain object for each variation's optionValues
      processedProduct.variations = processedProduct.variations.map(variation => {
        // Convert optionValues Map to object
        const optionValuesObj = {};
        if (variation.optionValues) {
          // Handle both Map and plain object cases
          const entries = variation.optionValues instanceof Map 
            ? variation.optionValues.entries()
            : Object.entries(variation.optionValues);
            
          for (const [key, value] of entries) {
            optionValuesObj[key] = value;
          }
        }
        
        return {
          ...variation,
          optionValues: optionValuesObj
        };
      });
      
      return res.json(processedProduct);
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
    const productData = { ...req.body };
    
    // Process variation data if present
    if (productData.hasVariations) {
      // Parse variation types and variations if they're strings
      if (typeof productData.variationTypes === 'string') {
        productData.variationTypes = JSON.parse(productData.variationTypes);
      }
      
      if (typeof productData.variations === 'string') {
        productData.variations = JSON.parse(productData.variations);
      }
      
      // Ensure variation data is valid
      if (!Array.isArray(productData.variationTypes) || !Array.isArray(productData.variations)) {
        return res.status(400).json({ error: 'Invalid variation data format' });
      }
      
      // Convert optionValues from object to Map for each variation
      productData.variations = productData.variations.map(variation => {
        // Create a new Map for optionValues
        const optionValuesMap = new Map();
        
        // Convert the object to Map entries
        if (variation.optionValues && typeof variation.optionValues === 'object') {
          Object.entries(variation.optionValues).forEach(([key, value]) => {
            optionValuesMap.set(key, value);
          });
        }
        
        return {
          ...variation,
          optionValues: optionValuesMap
        };
      });
    }
    
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
    res.status(500).json({ error: error.message });
  }
});

// Update product
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const productData = { ...req.body };
    
    // Process variation data if present
    if (productData.hasVariations) {
      // Parse variation types and variations if they're strings
      if (typeof productData.variationTypes === 'string') {
        productData.variationTypes = JSON.parse(productData.variationTypes);
      }
      
      if (typeof productData.variations === 'string') {
        productData.variations = JSON.parse(productData.variations);
      }
      
      // Ensure variation data is valid
      if (!Array.isArray(productData.variationTypes) || !Array.isArray(productData.variations)) {
        return res.status(400).json({ error: 'Invalid variation data format' });
      }
      
      // Convert optionValues from object to Map for each variation
      productData.variations = productData.variations.map(variation => {
        // If optionValues is already a Map, keep it as is
        if (variation.optionValues instanceof Map) {
          return variation;
        }
        
        // If optionValues is an object, convert it to Map
        if (typeof variation.optionValues === 'object' && variation.optionValues !== null) {
          const optionValuesMap = new Map();
          Object.entries(variation.optionValues).forEach(([key, value]) => {
            optionValuesMap.set(key, value);
          });
          return { ...variation, optionValues: optionValuesMap };
        }
        
        // Default empty Map if optionValues is invalid
        return { ...variation, optionValues: new Map() };
      });
    }
    
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
    
    // Check if we're setting a product to inactive
    const currentProduct = await Product.findById(req.params.id);
    const isBecomingInactive = currentProduct.status === 'active' && req.body.status === 'inactive';
    
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
    
    // If product is becoming inactive, remove it from all carts
    let cartsUpdated = 0;
    if (isBecomingInactive) {
      const cartUpdateResult = await Cart.updateMany(
        {}, // Match all carts
        { $pull: { products: { product: req.params.id } } } // Remove product from products array
      );
      cartsUpdated = cartUpdateResult.modifiedCount;
      console.log(`Product ${req.params.id} was set to inactive and removed from ${cartsUpdated} carts`);
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
    
    res.json({
      ...retrievedProduct.toObject(),
      cartsUpdated: cartsUpdated
    });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete product
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    // First find the product to ensure it exists
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Remove this product from all user carts
    const cartUpdateResult = await Cart.updateMany(
      {}, // Match all carts
      { $pull: { products: { product: req.params.id } } } // Remove product from products array
    );
    
    console.log(`Removed product ${req.params.id} from ${cartUpdateResult.modifiedCount} carts`);
    
    // Delete the product itself
    await Product.findByIdAndDelete(req.params.id);
    
    res.json({ 
      message: 'Product deleted successfully', 
      cartsUpdated: cartUpdateResult.modifiedCount 
    });
  } catch (error) {
    console.error('Error deleting product:', error);
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

// Update a product's stock by variation
router.patch('/:id/stock-variation', auth, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { variationSku, newStock } = req.body;
    
    if (!variationSku) {
      return res.status(400).json({ error: 'Variation SKU is required' });
    }
    
    if (typeof newStock !== 'number' || newStock < 0) {
      return res.status(400).json({ error: 'Valid stock amount is required' });
    }
    
    const product = await Product.findById(id);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    if (!product.hasVariations) {
      return res.status(400).json({ error: 'This product does not have variations' });
    }
    
    // Find and update the specific variation
    const variationIndex = product.variations.findIndex(v => v.sku === variationSku);
    
    if (variationIndex === -1) {
      return res.status(404).json({ error: 'Variation not found' });
    }
    
    // Update the variation stock
    product.variations[variationIndex].stock = newStock;
    
    // Recalculate total stock (sum of all variation stocks)
    product.stock = product.variations.reduce((total, variation) => total + variation.stock, 0);
    
    await product.save();
    
    res.json({
      message: 'Stock updated successfully',
      product: {
        _id: product._id,
        name: product.name,
        totalStock: product.stock,
        updatedVariation: {
          sku: variationSku,
          stock: newStock
        }
      }
    });
  } catch (error) {
    console.error('Error updating variation stock:', error);
    res.status(500).json({ error: error.message });
  }
});

console.log('Products routes loaded:');
router.stack.forEach(layer => {
  if (layer.route) {
    console.log(`${layer.route.stack[0].method.toUpperCase()} ${layer.route.path}`);
  }
});

export default router; 