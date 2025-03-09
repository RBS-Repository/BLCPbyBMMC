import express from 'express';
import Cart from '../models/Cart.js';
import { auth } from '../middleware/auth.js';
import mongoose from 'mongoose';

const router = express.Router();

// Get user's cart
router.get('/', auth, async (req, res) => {
  try {
    const populatedCart = await Cart.findOne({ user: req.user.uid })
      .populate('products.product')
      .exec();
    res.json(populatedCart);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add item to cart
router.post('/', auth, async (req, res) => {
  try {
    const { product, name, price, quantity } = req.body;
    
    // Validate required fields
    if (!product || !name || !price || !quantity) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Add product ID validation
    if (!mongoose.Types.ObjectId.isValid(product)) {
      return res.status(400).json({ error: 'Invalid product ID format' });
    }

    // Find existing cart
    let cart = await Cart.findOne({ user: req.user.uid });
    
    if (!cart) {
      // Create new cart
      cart = new Cart({
        user: req.user.uid,
        products: [{ product: new mongoose.Types.ObjectId(product), name, price: Number(price), quantity }]
      });
    } else {
      // Update existing cart
      const existingItem = cart.products.find(
        item => item.product.toString() === new mongoose.Types.ObjectId(product).toString()
      );
      
      if (existingItem) {
        existingItem.quantity += quantity;
      } else {
        cart.products.push({
          product: new mongoose.Types.ObjectId(product),
          name,
          price: Number(price),
          quantity
        });
      }
    }

    const savedCart = await cart.save();
    const populatedCart = await savedCart.populate('products.product');
    res.status(201).json(populatedCart);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update item quantity in cart
router.put('/:id', auth, async (req, res) => {
  try {
    const { quantity } = req.body;
    const cart = await Cart.findOne({ user: req.user.uid });
    
    const productIndex = cart.products.findIndex(p => 
      p.product.toString() === req.params.id
    );
    
    if (productIndex === -1) {
      return res.status(404).json({ error: 'Product not found in cart' });
    }

    cart.products[productIndex].quantity = Number(quantity);
    const savedCart = await cart.save();
    const populatedCart = await savedCart.populate('products.product');
    
    res.json(populatedCart);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove item from cart
router.delete('/:id', auth, async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user.uid });
    cart.products = cart.products.filter(p => p.product != req.params.id);
    
    const savedCart = await cart.save();
    const updatedCart = await savedCart.populate('products.product');
    
    res.json(updatedCart);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Remove product from cart
router.delete('/:productId', auth, async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user.uid });
    cart.products = cart.products.filter(p => p.product != req.params.productId);
    const savedCart = await cart.save();
    const updatedCart = await savedCart.populate('products.product');
    res.json(updatedCart);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update cart item quantity
router.put('/:productId', auth, async (req, res) => {
  try {
    const { quantity } = req.body;
    let cart = await Cart.findOne({ user: req.user.uid });
    
    const productIndex = cart.products.findIndex(p => p.product == req.params.productId);
    
    if (productIndex > -1) {
      cart.products[productIndex].quantity = Number(quantity);
    }
    
    const savedCart = await cart.save();
    const updatedCart = await savedCart.populate('products.product');
    
    res.json(updatedCart);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Clear entire cart
router.delete('/', auth, async (req, res) => {
  try {
    console.log(`Clearing entire cart for user: ${req.user.uid}`);
    
    const cart = await Cart.findOneAndUpdate(
      { user: req.user.uid },
      { $set: { products: [] } },
      { new: true }
    );
    
    if (!cart) {
      return res.status(404).json({ message: 'Cart not found' });
    }
    
    console.log(`Cart cleared successfully for user: ${req.user.uid}`);
    res.status(200).json({ message: 'Cart cleared successfully', cart });
  } catch (err) {
    console.error('Error clearing cart:', err);
    res.status(500).json({ error: 'Failed to clear cart' });
  }
});

// Clear entire cart (alternative endpoint)
router.delete('/clear', auth, async (req, res) => {
  try {
    console.log(`Clearing entire cart for user (via /clear endpoint): ${req.user.uid}`);
    
    const cart = await Cart.findOneAndUpdate(
      { user: req.user.uid },
      { $set: { products: [] } },
      { new: true }
    );
    
    if (!cart) {
      return res.status(404).json({ message: 'Cart not found' });
    }
    
    console.log(`Cart cleared successfully for user: ${req.user.uid}`);
    res.status(200).json({ message: 'Cart cleared successfully', cart });
  } catch (err) {
    console.error('Error clearing cart:', err);
    res.status(500).json({ error: 'Failed to clear cart' });
  }
});

router.get('/debug', auth, (req, res) => {
  res.json({
    user: req.user,
    firebaseUID: req.user?.uid,
    timestamp: new Date().toISOString()
  });
});

export default router; 