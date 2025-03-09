import mongoose from 'mongoose';

const referralCodeSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true
  },
  code: {
    type: String,
    required: true,
    unique: true
  },
  uses: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  usedBy: [{
    userId: String,
    usedAt: Date
  }]
});

const ReferralCode = mongoose.model('ReferralCode', referralCodeSchema);

export default ReferralCode; 