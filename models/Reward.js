import mongoose from 'mongoose';

const rewardSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  referredUserId: {
    type: String,
    required: true
  },
  purchaseId: {
    type: String,
    required: false
  },
  amount: {
    type: Number,
    required: true
  },
  orderTotal: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'redeemed', 'expired'],
    default: 'pending'
  },
  description: {
    type: String,
    default: 'Referral purchase reward'
  },
  purchaseDate: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  redeemedAt: {
    type: Date
  },
  expiresAt: {
    type: Date,
    default: function() {
      // Set expiration date to 6 months from creation
      const date = new Date();
      date.setMonth(date.getMonth() + 6);
      return date;
    }
  }
});

// Create indexes for faster queries
rewardSchema.index({ userId: 1, status: 1 });
rewardSchema.index({ purchaseId: 1 }, { unique: true, sparse: true });

const Reward = mongoose.model('Reward', rewardSchema);

export default Reward; 