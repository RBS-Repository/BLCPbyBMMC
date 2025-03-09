import mongoose from 'mongoose';

const referralSettingsSchema = new mongoose.Schema({
  referrerDiscount: {
    type: Number,
    default: 10, // 10% discount for referrers
    min: 0,
    max: 100
  },
  referredDiscount: {
    type: Number,
    default: 15, // 15% discount for referred users
    min: 0,
    max: 100
  },
  minimumPurchase: {
    type: Number,
    default: 50, // Minimum $50 purchase to qualify
    min: 0
  },
  maxReferralReward: {
    type: Number,
    default: 200, // Maximum $200 in rewards
    min: 0
  },
  expirationDays: {
    type: Number,
    default: 60, // Rewards expire after 60 days
    min: 0
  },
  currency: {
    type: String,
    default: '₱' // Philippine Peso as default
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