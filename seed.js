// backend/seed.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';

// Load environment variables from .env
dotenv.config();

// Retrieve the MongoDB connection string
const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/blcpDatabase';

// Define an array of sample products
const sampleProducts = [
  {
    name: 'Intoy',
    description: 'A gentle cleanser ideal for all skin types.',
    price: 1200,
    stock: 100,
    minOrder: 10,
    category: 'skin-clinics',
    targetMarket: ['All Products', 'Skin Clinics'],
    image: 'https://images.ctfassets.net/t975yazu1avh/1fnF8axr3M3oC59f6loOKE/76b42dc36d7cb564ebf32778258173f3/CnC_ESSN_CLNSR_PUMP_8oz_EDI_transition_JPG.png',
    features: ['Gentle formula', 'Paraben-free', 'Dermatologist recommended'],
  },
  {
    name: 'Moisturizing Cream',
    description: 'Hydrating cream to keep your skin nourished.',
    price: 1500,
    stock: 150,
    minOrder: 5,
    category: 'spas',
    targetMarket: ['All Products', 'Spas and Beauty Centers'],
    image: 'https://www.shutterstock.com/shutterstock/photos/2149659193/display_1500/stock-vector-ad-poster-with-moisturizing-face-cream-products-vector-illustration-with-d-bottle-and-tube-of-2149659193.jpg',
    features: ['Long-lasting hydration', 'Suitable for dry skin'],
  },
  {
    name: 'Sunscreen SPF50',
    description: 'Broad spectrum sunscreen to protect against UVA/UVB rays.',
    price: 1000,
    stock: 200,
    minOrder: 8,
    category: 'pharmacies',
    targetMarket: ['All Products', 'Pharmacies'],
    image: 'https://www.shutterstock.com/shutterstock/photos/2003043524/display_1500/stock-vector--d-summer-sunscreen-cream-ad-illustration-of-sunblock-product-placed-on-a-tropical-beach-with-sand-2003043524.jpg',
    features: ['Water-resistant', 'Non-greasy formula'],
  },
  {
    name: 'Liquid Foundation',
    description: 'Lightweight foundation providing a natural, flawless finish.',
    price: 2000,
    stock: 75,
    minOrder: 3,
    category: 'private-label',
    targetMarket: ['All Products', 'Private Label/OEM'],
    image: 'https://c8.alamy.com/comp/H8X9YJ/elegant-foundation-ads-different-skin-tones-for-choose-liquid-foundation-H8X9YJ.jpg',
    features: ['Long-lasting', 'Blendable', 'Wide shade range'],
  },
  {
    name: 'Volumizing Shampoo',
    description: 'Shampoo that adds volume and shine to all hair types.',
    price: 800,
    stock: 300,
    minOrder: 6,
    category: 'retail',
    targetMarket: ['All Products', 'Wholesale & Retail'],
    image: 'https://images.ctfassets.net/r9udlqyetmm3/2RXFImvDFCgA6gHR7gdOJz/58287b93e7a66e1952f07387db42c029/80362040_80808775_SI01.jpg',
    features: ['Sulfate-free', 'For all hair types'],
  },
  {
    name: 'Luxury Perfume',
    description: 'A premium fragrance offering elegant notes of jasmine and sandalwood.',
    price: 3500,
    stock: 50,
    minOrder: 2,
    category: 'influencers',
    targetMarket: ['All Products', 'Influencers/KOLs'],
    image: 'https://d1csarkz8obe9u.cloudfront.net/posterpreviews/luxury-perfume-ads-design-template-2b5beb37a8744c9f033e7f9e883db679_screen.jpg?ts=1679389797',
    features: ['Long-lasting scent', 'Elegant packaging'],
  }
];

mongoose
  .connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(async () => {
    console.log("Connected to MongoDB for seeding");
    // Optionally, clear the collection
    await Product.deleteMany({});
    console.log("Existing products removed");
    
    // Create products one by one to ensure schema validation
    const createdProducts = [];
    for (const product of sampleProducts) {
      const newProduct = new Product(product);
      console.log('Creating product with stock:', newProduct.stock);
      const saved = await newProduct.save();
      createdProducts.push(saved);
    }
    
    console.log("Sample products inserted:", createdProducts.map(product => ({
      ...product.toObject(),
      stock: product.stock  // Explicitly log stock
    })));
    process.exit(0);
  })
  .catch(err => {
    console.error("Error seeding the database:", err);
    process.exit(1);
  });