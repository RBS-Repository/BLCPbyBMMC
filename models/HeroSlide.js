import mongoose from 'mongoose';

const heroSlideSchema = new mongoose.Schema({
  image: {
    type: String,
    required: true,
    trim: true
  },
  title: {
    type: String,
    trim: true
  },
  subtitle: {
    type: String,
    trim: true
  },
  cta: {
    type: String,
    trim: true,
  },
  link: {
    type: String,
    default: '/',
    trim: true
  },
  order: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

const HeroSlide = mongoose.model('HeroSlide', heroSlideSchema);

export default HeroSlide; 