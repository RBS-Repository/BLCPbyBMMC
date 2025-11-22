import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
  user: {
    type: String,
    required: true
  },
  customerName: {
    type: String,
    required: true
  },
  orderNumber: {
    type: String,
    unique: true
  },
  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    name: {
      type: String,
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    price: {
      type: Number,
      required: true,
      min: 0
    },
    image: String,
    subtotal: {
      type: Number,
      required: true
    }
  }],
  summary: {
    subtotal: Number,
    tax: Number,
    shipping: Number,
    total: Number
  },
  shipping: {
    firstName: String,
    lastName: String,
    company: String,
    address: {
      type: String,
      required: true
    },
    city: {
      type: String,
      required: true
    },
    province: {
      type: String,
      required: true
    },
    postalCode: {
      type: String,
      required: true
    },
    phone: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true
    }
  },
  payment: {
    method: {
      type: String,
      enum: ['gcash', 'grab_pay', 'maya', 'card', 'paymongo'],
      default: 'gcash'
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending'
    },
    checkoutId: String,
    linkId: String
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded', 'completed'],
    default: 'pending'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },
  refundStatus: {
    type: String,
    enum: ['none', 'partial', 'full'],
    default: 'none'
  },
  refunds: [{
    amount: Number,
    reason: String,
    status: String,
    date: Date
  }],
  confirmationEmailHistory: [{
    sentAt: Date,
    status: String
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  rewardApplied: {
    rewardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Referral'
    },
    amount: {
      type: Number,
      default: 0
    }
  }
});

// Add timestamps
orderSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const Order = mongoose.model('Order', orderSchema);

console.log('Order model registered with schema:', 
  Object.keys(orderSchema.paths).join(', '));

export default Order; 