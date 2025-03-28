import mongoose from 'mongoose';

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
    category: {
      type: String,
      required: true,
    },
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
    }
  },
  {
    timestamps: true, // Includes createdAt and updatedAt fields
  }
);

// Add a pre-save hook to log what's being saved
productSchema.pre('save', function(next) {
  console.log('Pre-save hook - images array:', {
    images: this.images,
    isArray: Array.isArray(this.images),
    length: this.images?.length || 0
  });
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
  category: 'text'
}, {
  weights: {
    name: 10,
    category: 5,
    description: 1
  }
});

export default mongoose.model('Product', productSchema); 