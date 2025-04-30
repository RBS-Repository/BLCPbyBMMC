import mongoose from 'mongoose';
import Category from './Category.js';

// Create a variation option schema for individual variation values
const variationOptionSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true 
  },
  // Optional price adjustment for this specific option (can be positive or negative)
  priceAdjustment: {
    type: Number,
    default: 0
  }
}, { _id: false });

// Create a variation type schema (e.g., "Size", "Color")
const variationTypeSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true 
  },
  options: [variationOptionSchema]
}, { _id: false });

// Create a variation combination schema for specific product variants
const variationCombinationSchema = new mongoose.Schema({
  // Array of option selections (e.g., ["Large", "Blue"])
  optionValues: {
    type: Map,
    of: String,
    required: true
  },
  // SKU for this specific combination
  sku: {
    type: String,
    default: ''
  },
  // Stock level for this specific combination
  stock: {
    type: Number,
    default: 0
  },
  // Price override for this specific combination (if null, use base price + adjustments)
  price: {
    type: Number,
    default: null
  },
  // Image specific to this variation (optional)
  image: {
    type: String,
    default: null
  }
});

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    minOrder: {
      type: Number,
      default: 0,
    },
    // Replace simple category string with reference to Category model
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
    // Keep the original category name string for backward compatibility and display
    categoryName: {
      type: String,
      required: true,
    },
    // Add full category path data for hierarchical display
    categoryPath: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category'
    }],
    stock: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    quantity: {
      type: Number,
      required: true,
      default: 0
    },
    targetMarketKeyFeatures: {
      type: [String],
      default: [],
    },
    targetMarket: [String], // e.g., ["All Products", "Skin Clinics", ...]
    image: {
      type: String,
    },
    images: {
      type: [String],
      default: function() {
        return []; // Use a function to ensure a new array for each document
      }
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active'
    },
    // New fields for variations
    hasVariations: {
      type: Boolean,
      default: false
    },
    variationTypes: {
      type: [variationTypeSchema],
      default: []
    },
    variations: {
      type: [variationCombinationSchema],
      default: []
    }
  },
  {
    timestamps: true, // Includes createdAt and updatedAt fields
  }
);

// Pre-save hook to generate SKUs for variations if they don't exist
productSchema.pre('save', async function(next) {
  console.log('Pre-save hook - images array:', {
    images: this.images,
    isArray: Array.isArray(this.images),
    length: this.images?.length || 0
  });
  
  // If the category changed, update the categoryPath
  if (this.isModified('category')) {
    try {
      this.categoryPath = await Category.getCategoryPath(this.category);
      
      // Also update the categoryName for backward compatibility
      const category = await Category.findById(this.category);
      if (category) {
        this.categoryName = category.name;
      }
    } catch (error) {
      console.error('Error updating category path:', error);
    }
  }
  
  // If product has variations, generate SKUs for any that don't have them
  if (this.hasVariations && this.variations && this.variations.length > 0) {
    // Extract product name for the SKU prefix (using first 3 letters)
    const namePrefix = this.name.substring(0, 3).toUpperCase();
    
    // Get product category (using first 2 letters of categoryName)
    const categoryPrefix = this.categoryName ? this.categoryName.substring(0, 2).toUpperCase() : 'XX';
    
    // Use the first 4 characters of the product ID
    const idSuffix = this._id.toString().substr(-4);
    
    // Generate a beauty-product friendly base SKU
    const baseSku = `${namePrefix}-${categoryPrefix}${idSuffix}`;
    
    this.variations.forEach((variation, index) => {
      // Always regenerate SKUs to ensure consistency
      // Format: NAME-CAT1234-VAR (where VAR is an index or variation-specific code)
      let variationCode = '';
      
      // Create a code based on the variation options (first letter of each option)
      if (variation.optionValues && variation.optionValues.size > 0) {
        for (const [typeName, optionName] of variation.optionValues.entries()) {
          // Add the first letter of the option to the variation code
          if (optionName && optionName.length > 0) {
            variationCode += optionName.charAt(0).toUpperCase();
          }
        }
      }
      
      // If we couldn't create a meaningful code, use the index
      if (!variationCode) {
        variationCode = (index + 1).toString().padStart(2, '0');
      }
      
      // Set the final SKU
      variation.sku = `${baseSku}-${variationCode}`;
    });
  }
  
  next();
});

// Make sure toJSON includes the images array
productSchema.set('toJSON', {
  transform: function(doc, ret) {
    // Ensure images array is included in JSON
    if (!ret.images) {
      ret.images = [];
    }
    return ret;
  }
});

// Add text index
productSchema.index({
  name: 'text',
  description: 'text',
  categoryName: 'text' // Update index to include categoryName instead of category
}, {
  weights: {
    name: 10,
    categoryName: 5, // Update weight to reference categoryName
    description: 1
  }
});

export default mongoose.model('Product', productSchema); 