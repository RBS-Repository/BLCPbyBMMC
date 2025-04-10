import mongoose from 'mongoose';

const spotlightSchema = new mongoose.Schema({
  hero: {
    image: {
      type: String,
      required: true
    },
    title: {
      type: String,
      required: true
    },
    description: {
      type: String,
      required: true
    },
    buttonText: {
      type: String,
      required: true
    },
    buttonLink: {
      type: String,
      required: true
    }
  },
  products: [
    {
      id: {
        type: String,
        required: true
      },
      image: {
        type: String,
        required: true
      },
      title: {
        type: String,
        required: true
      },
      description: {
        type: String,
        required: true
      },
      badgeText: {
        type: String,
        required: false
      }
    }
  ],
  promotionBanner: {
    image: {
      type: String,
      required: true
    },
    title: {
      type: String,
      required: true
    },
    description: {
      type: String,
      required: true
    },
    badgeText: {
      type: String,
      required: false
    },
    buttonText: {
      type: String,
      required: true
    },
    buttonLink: {
      type: String,
      required: true
    }
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  updatedBy: {
    type: String,
    required: false
  }
}, { timestamps: true });

// There will only be one spotlight document in the database
// We'll use a helper method to find or create it when needed
spotlightSchema.statics.findOrCreate = async function(updatedBy = null) {
  const spotlight = await this.findOne({});
  
  if (spotlight) {
    return spotlight;
  }
  
  // Create default spotlight data
  return this.create({
    hero: {
      image: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1780&q=80',
      title: 'Discover Your Luminous Glow',
      description: 'Premium skincare formulations designed for visible results and radiant skin',
      buttonText: 'Shop The Collection',
      buttonLink: '/products/category/premium'
    },
    products: [
      {
        id: '1',
        image: '/assets/90_120 CELL REPAIR BOOST.jpg',
        title: 'Cell Repair Boost',
        description: 'Advanced peptide formula for rapid repair',
        badgeText: 'BESTSELLER'
      },
      {
        id: '2',
        image: '/assets/500_500 OXYJET TREATMENT.jpg',
        title: 'OxyJet Pro Treatment',
        description: 'Oxygen-infused professional treatment',
        badgeText: 'NEW'
      },
      {
        id: '3',
        image: '/assets/90_120 PDRN THERAPY (1).jpg',
        title: 'PDRN Therapy Ampoule',
        description: 'Clinical-grade regeneration serum',
        badgeText: 'PREMIUM'
      },
      {
        id: '4',
        image: 'https://images.unsplash.com/photo-1624455806586-81792cf1d559',
        title: 'Hydra-Lift Eye Cream',
        description: 'Intensive lifting and hydrating',
        badgeText: 'SPECIAL'
      }
    ],
    promotionBanner: {
      image: 'https://images.unsplash.com/photo-1571875257727-256c39da42af',
      title: 'Professional Starter Kit',
      description: 'Get started with our complete professional treatment set. Perfect for salons and clinics.',
      badgeText: 'LIMITED TIME OFFER',
      buttonText: 'Shop Now',
      buttonLink: '/products/professional-starter-kit'
    },
    updatedBy
  });
};

const Spotlight = mongoose.model('Spotlight', spotlightSchema);

export default Spotlight; 