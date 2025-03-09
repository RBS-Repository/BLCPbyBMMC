import mongoose from 'mongoose';

const cartSchema = new mongoose.Schema({
  user: {
    type: String,
    required: true,
    unique: true
  },
  products: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    }
  }]
}, { timestamps: true, strictPopulate: false });

export default mongoose.model('Cart', cartSchema); 