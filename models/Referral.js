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
    enum: ['registered', 'active', 'purchased'],
    default: 'registered'
  },
  rewards: [{
    type: {
      type: String,
      enum: ['discount', 'credit', 'points'],
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    description: String,
    createdAt: {
      type: Date,
      default: Date.now
    },
    used: {
      type: Boolean,
      default: false
    },
    usedAt: Date
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  firstPurchaseAt: Date
});

const Referral = mongoose.model('Referral', referralSchema);

export default Referral; 