import mongoose from 'mongoose';

const referralSettingsSchema = new mongoose.Schema({
  minimumPurchase: {
    type: Number,
    default: 50,
    min: 0
  },
  maxReferralReward: {
    type: Number,
    default: 200,
    min: 0
  },
  expirationDays: {
    type: Number,
    default: 30,
    min: 0
  },
  creditCalculation: {
    type: String,
    enum: ['percentage', 'fixed'],
    default: 'percentage'
  },
  maxRewardPercentage: {
    type: Number,
    default: 5,
    min: 0,
    max: 100
  },
  referredDiscount: {
    type: Number,
    default: 5,
    min: 0,
    max: 100
  },
  currency: {
    type: String,
    default: '₱'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

const ReferralSettings = mongoose.model('ReferralSettings', referralSettingsSchema);

export default ReferralSettings; 