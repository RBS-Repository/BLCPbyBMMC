import mongoose from 'mongoose';

console.log('Defining Category schema');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  parentCategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null
  },
  level: {
    type: Number,
    default: 0 // 0 for root categories, increases for each level of nesting
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Virtual for getting all child categories
categorySchema.virtual('children', {
  ref: 'Category',
  localField: '_id',
  foreignField: 'parentCategory'
});

// Pre-save hook to set level based on parent category
categorySchema.pre('save', async function(next) {
  if (this.parentCategory) {
    try {
      const parentCategory = await mongoose.model('Category').findById(this.parentCategory);
      if (parentCategory) {
        this.level = parentCategory.level + 1;
      }
    } catch (error) {
      console.error('Error calculating category level:', error);
    }
  } else {
    this.level = 0; // Root category
  }
  next();
});

// Static method to get full category path (breadcrumb)
categorySchema.statics.getCategoryPath = async function(categoryId) {
  const path = [];
  let currentCategory = await this.findById(categoryId);
  
  while (currentCategory) {
    path.unshift(currentCategory);
    if (currentCategory.parentCategory) {
      currentCategory = await this.findById(currentCategory.parentCategory);
    } else {
      break;
    }
  }
  
  return path;
};

// Static method to get all categories in a tree structure
categorySchema.statics.getCategoryTree = async function() {
  console.log('Building category tree...');
  
  // First get all categories
  const categories = await this.find({}).sort({ level: 1, name: 1 });
  console.log(`Found ${categories.length} categories to organize into tree`);
  
  // Create a map for easy lookup
  const categoryMap = {};
  categories.forEach(category => {
    const catId = category._id.toString();
    categoryMap[catId] = {
      ...category._doc,
      children: []
    };
    console.log(`Added to map: ${category.name} (${catId})`);
    
    // Log parent relationship if it exists
    if (category.parentCategory) {
      const parentIdRaw = category.parentCategory;
      const parentId = typeof parentIdRaw === 'object' ? 
        parentIdRaw.toString() : parentIdRaw.toString();
      console.log(`Category "${category.name}" has parent ID: ${parentId} (type: ${typeof parentIdRaw})`);
    } else {
      console.log(`Category "${category.name}" is a root category (no parent)`);
    }
  });
  
  // Create the tree structure
  const rootCategories = [];
  
  categories.forEach(category => {
    const catId = category._id.toString();
    
    if (category.parentCategory) {
      // Has parent, add to parent's children
      const parentIdRaw = category.parentCategory;
      const parentId = typeof parentIdRaw === 'object' && parentIdRaw._id ? 
        parentIdRaw._id.toString() : parentIdRaw.toString();
      
      console.log(`Processing child category "${category.name}" (${catId}) with parent ID: ${parentId}`);
      
      if (categoryMap[parentId]) {
        console.log(`Found parent for "${category.name}" - adding to children of "${categoryMap[parentId].name}"`);
        categoryMap[parentId].children.push(categoryMap[catId]);
      } else {
        console.log(`WARNING: Parent ${parentId} not found for category "${category.name}" - treating as root`);
        rootCategories.push(categoryMap[catId]);
      }
    } else {
      // Root category
      console.log(`Adding root category: ${category.name} (${catId})`);
      rootCategories.push(categoryMap[catId]);
    }
  });
  
  // Log the resulting tree structure for debugging
  console.log(`Built tree with ${rootCategories.length} root categories`);
  rootCategories.forEach(root => {
    console.log(`Root: ${root.name} with ${root.children.length} children`);
    root.children.forEach(child => {
      console.log(`  - Child: ${child.name}`);
    });
  });
  
  return rootCategories;
};

// Create a slug from the name
categorySchema.pre('validate', function(next) {
  if (this.name && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '')
      .replace(/\-\-+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '');
  }
  next();
});

// Check if model already exists to avoid model redefinition errors
const Category = mongoose.models.Category || mongoose.model('Category', categorySchema);

console.log('Category model created or retrieved');

export default Category; 