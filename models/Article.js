import mongoose from 'mongoose';
import slugify from 'slugify';

const articleSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  slug: {
    type: String,
    unique: true,
    required: true
  },
  excerpt: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true
  },
  image: {
    type: String,
    required: true
  },
  featured: {
    type: Boolean,
    default: false
  },
  readTime: {
    type: String,
    default: '5 min read'
  },
  author: {
    type: String,
    default: 'BLCP Team'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  updatedBy: {
    type: String
  }
});

// Generate a slug before saving
articleSchema.pre('save', function(next) {
  // If slug is not set or article is new
  if (!this.slug || this.isNew) {
    this.slug = generateUniqueSlug(this.title);
  }
  next();
});

// Helper function to generate a unique slug
function generateUniqueSlug(title) {
  const timestamp = Date.now().toString(36);
  const baseSlug = slugify(title, {
    lower: true,
    strict: true,
    trim: true
  });
  // Append a timestamp to ensure uniqueness
  return `${baseSlug}-${timestamp}`;
}

const Article = mongoose.model('Article', articleSchema);

export default Article; 