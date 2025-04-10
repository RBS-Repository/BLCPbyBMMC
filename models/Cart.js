import mongoose from 'mongoose';

const cartSchema = new mongoose.Schema({
  // Support both field names for backward compatibility
  user: {
    type: String,
    index: false // Remove regular index
  },
  // Add userId field to match what's in the database
  userId: {
    type: String,
    index: false // Remove regular index
  },
  products: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    name: {
      type: String,
      required: false // Make it optional as it can come from the Product reference
    },
    price: {
      type: Number,
      required: false // Make it optional as it can come from the Product reference
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    // Add variation-related fields
    variationSku: {
      type: String,
      required: false
    },
    variationOptions: {
      type: Object,
      required: false
    },
    variationDisplay: {
      type: String,
      required: false
    }
  }]
}, { timestamps: true, strictPopulate: false });

// Remove the unique index - we'll handle this differently
// cartSchema.index({ user: 1 }, { unique: true, sparse: true });

// Handle the existing collection indexes - very important!
const Cart = mongoose.model('Cart', cartSchema);

// This function runs when the model is first used and fixes the index issues
async function fixCartIndexes() {
  try {
    console.log('Attempting to fix cart indexes...');
    
    // Get the collection directly to work with indexes
    const collection = Cart.collection;
    
    // Get all indexes
    const indexes = await collection.indexes();
    console.log('Current indexes:', indexes);
    
    // Look for the problematic userId index
    const userIdIndex = indexes.find(index => 
      index.key && (index.key.userId === 1 || index.key.user === 1) && index.unique);
    
    if (userIdIndex) {
      console.log('Found problematic index:', userIdIndex.name);
      // Drop the problematic index
      await collection.dropIndex(userIdIndex.name);
      console.log('Successfully dropped problematic index');
    }
    
    // Create a new sparse index that works with both field names
    await collection.createIndex({ 
      $or: [
        { user: 1 },
        { userId: 1 }
      ]
    }, { sparse: true });
    
    console.log('Cart index issues fixed successfully');
  } catch (error) {
    console.error('Failed to fix cart indexes:', error);
  }
}

// Try to fix indexes, but don't block startup
fixCartIndexes().catch(err => console.error('Index repair failed:', err));

export default Cart; 