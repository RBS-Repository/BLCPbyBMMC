import mongoose from 'mongoose';

const referralSchema = new mongoose.Schema({
  referrerId: {
    type: String,
    required: true
  },
  referralCode: {
    type: String,
    required: true
  },
  referredUserId: {
    type: String,
    required: true
  },
  referredUserEmail: {
    type: String,
    required: true
  },
  referredUserName: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['pending', 'registered', 'purchased'],
    default: 'pending'
  },
  rewards: [{
    _id: String,
    orderId: String,
    amount: Number,
    description: String,
    type: String,
    used: Boolean,
    createdAt: Date,
    expiresAt: Date
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  firstPurchaseAt: Date
});

const Referral = mongoose.model('Referral', referralSchema);

export default Referral; 