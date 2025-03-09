// When fetching single order
const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('items.product', 'name price image') // Add image to populated fields
      .exec();
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// When fetching all orders
const getOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate('items.product', 'name price image') // Add image here too
      .exec();
    
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
}; 