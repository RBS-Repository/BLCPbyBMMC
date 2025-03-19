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
    unique: true,
    uppercase: true
  },
  userName: String,
  userEmail: String,
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

// Create the model if it doesn't exist
const ReferralCode = mongoose.models.ReferralCode || mongoose.model('ReferralCode', referralCodeSchema);

export default ReferralCode; 