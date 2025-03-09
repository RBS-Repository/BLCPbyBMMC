// Add this new route to your admin routes
router.post('/disableAccount', adminOnly, async (req, res) => {
  try {
    const { uid } = req.body;
    
    // Update user's disabled status using Firebase Admin SDK
    await admin.auth().updateUser(uid, {
      disabled: true
    });

    res.status(200).json({ message: 'Account disabled successfully' });
  } catch (error) {
    console.error('Error disabling account:', error);
    res.status(500).json({ error: error.message });
  }
}); 