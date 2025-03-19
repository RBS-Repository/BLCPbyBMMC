import mongoose from 'mongoose';

console.log('Defining Category schema');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Add validation hooks
categorySchema.pre('save', function(next) {
  console.log('Pre-save hook triggered for category:', this);
  next();
});

// Check if model already exists to avoid model redefinition errors
const Category = mongoose.models.Category || mongoose.model('Category', categorySchema);

console.log('Category model created or retrieved');

export default Category; 