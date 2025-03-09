import mongoose from 'mongoose';

const faqContentSchema = new mongoose.Schema({
  categories: [{
    title: {
      type: String,
      required: true
    },
    questions: [{
      q: {
        type: String,
        required: true
      },
      a: {
        type: String,
        required: true
      }
    }]
  }],
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  updatedBy: {
    type: String
  }
});

const FaqContent = mongoose.model('FaqContent', faqContentSchema);

export default FaqContent; 