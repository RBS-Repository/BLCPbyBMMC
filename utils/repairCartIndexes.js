import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Cart from '../models/Cart.js';

// Load environment variables
dotenv.config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB for repair');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Fix the cart indexes
const repairCartCollection = async () => {
  try {
    console.log('Starting cart collection repair...');
    
    // Get the collection directly
    const collection = Cart.collection;
    
    // 1. List all indexes
    const indexes = await collection.indexes();
    console.log('Current indexes:', JSON.stringify(indexes, null, 2));
    
    // 2. Drop problematic indexes
    for (const index of indexes) {
      // Skip the _id index which cannot be dropped
      if (index.name === '_id_') continue;
      
      console.log(`Dropping index: ${index.name}`);
      try {
        await collection.dropIndex(index.name);
        console.log(`Successfully dropped index: ${index.name}`);
      } catch (err) {
        console.error(`Failed to drop index ${index.name}:`, err);
      }
    }
    
    // 3. Clean up duplicate null user/userId documents
    console.log('Cleaning up duplicate null user documents...');
    
    // Find all documents with null user or userId
    const nullUserDocs = await collection.find({ 
      $or: [
        { user: null },
        { userId: null }
      ]
    }).toArray();
    
    console.log(`Found ${nullUserDocs.length} documents with null user/userId`);
    
    // Keep only the most recent one if there are multiple
    if (nullUserDocs.length > 1) {
      // Sort by updatedAt descending (most recent first)
      nullUserDocs.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      
      // Keep the first one, delete the rest
      for (let i = 1; i < nullUserDocs.length; i++) {
        console.log(`Removing duplicate null user cart: ${nullUserDocs[i]._id}`);
        await collection.deleteOne({ _id: nullUserDocs[i]._id });
      }
      
      console.log(`Kept most recent null user cart, removed ${nullUserDocs.length - 1} duplicates`);
    }
    
    // 4. Update remaining null document to have a unique identifier
    if (nullUserDocs.length > 0) {
      const remainingNullCart = nullUserDocs[0];
      await collection.updateOne(
        { _id: remainingNullCart._id },
        { 
          $set: {
            user: 'guest-' + Date.now(),
            userId: 'guest-' + Date.now()
          }
        }
      );
      console.log('Updated remaining null user cart with a unique guest identifier');
    }
    
    // 5. Create new indexes with proper sparse settings
    console.log('Creating new indexes...');
    await collection.createIndex({ user: 1 }, { sparse: true });
    await collection.createIndex({ userId: 1 }, { sparse: true });
    
    console.log('Cart collection repair completed successfully');
  } catch (error) {
    console.error('Cart repair failed:', error);
  }
};

// Run the repair process
const runRepair = async () => {
  try {
    await connectDB();
    await repairCartCollection();
    
    console.log('Repair process completed. Exiting now.');
    process.exit(0);
  } catch (error) {
    console.error('Repair process failed:', error);
    process.exit(1);
  }
};

runRepair(); 