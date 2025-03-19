import mongoose from 'mongoose';

const orderHistorySchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  userId: {
    type: String,
    required: true
  },
  customerName: {
    type: String,
    required: true,
    default: 'Guest Customer'
  },
  orderNumber: String,
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
      required: true
    },
    price: {
      type: Number,
      required: true
    },
    image: String,
    subtotal: Number
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
    address: String,
    city: String,
    province: String,
    postalCode: String,
    phone: String,
    email: {
      type: String,
      required: true,
      match: [/\S+@\S+\.\S+/, 'Invalid email format']
    }
  },
  billing: {
    firstName: String,
    lastName: String,
    company: String,
    address: String,
    city: String,
    province: String,
    postalCode: String,
    sameAsShipping: Boolean
  },
  payment: {
    method: String,
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed'],
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
    enum: ['pending', 'paid', 'failed'],
    default: 'pending'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  storedAt: {
    type: Date,
    default: Date.now
  },
  trackingNumber: String,
  refundStatus: {
    type: String,
    enum: ['none', 'requested', 'processed', 'denied'],
    default: 'none'
  },
  refunds: [{
    amount: Number,
    reason: String,
    date: {
      type: Date,
      default: Date.now
    },
    processedBy: String
  }],
  confirmationEmailHistory: [{
    sentAt: {
      type: Date,
      default: Date.now
    },
    sentBy: String
  }],
  action: {
    type: String,
    required: true,
    enum: ['status_update', 'payment_update', 'tracking_update', 'note_added', 'refund']
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const OrderHistory = mongoose.model('OrderHistory', orderHistorySchema);
export default OrderHistory; 