import mongoose from 'mongoose';

const contentSchema = new mongoose.Schema({
  pageId: {
    type: String,
    required: true,
    unique: true
  },
  title: {
    type: String,
    required: true
  },
  sections: [{
    sectionId: String,
    title: String,
    subtitle: String,
    content: String,
    items: [{
      title: String,
      description: String,
      year: String,
      icon: String,
      image: String
    }]
  }],
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: String
  },
  updatedBy: {
    type: String
  }
});

const Content = mongoose.model('Content', contentSchema);

export default Content; 