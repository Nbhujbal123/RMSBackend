// Backend/controllers/menuController.js
const MenuItem = require("../model/menuItemModel");

// Get all menu items
exports.getAllMenuItems = async (req, res) => {
  try {
    const siteCode = req.siteCode;
    
    // If no siteCode provided (browsing without login), return empty array
    // User needs to login or select a restaurant to see menu items
    if (!siteCode) {
      return res.json([]);
    }
    
    const menuItems = await MenuItem.find({ siteCode });
    res.json(menuItems);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching menu items", error: error.message });
  }
};

// Get menu item by ID
exports.getMenuItemById = async (req, res) => {
  try {
    const siteCode = req.siteCode;
    const menuItem = await MenuItem.findOne({ siteCode, id: req.params.id });
    if (!menuItem)
      return res.status(404).json({ message: "Menu item not found" });
    res.json(menuItem);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching menu item", error: error.message });
  }
};

// Create new menu item
exports.createMenuItem = async (req, res) => {
  try {
    const siteCode = req.siteCode;
    
    console.log("Creating menu item with siteCode:", siteCode);
    console.log("Request body:", req.body);
    
    if (!siteCode) {
      return res.status(400).json({ message: "Site code is missing. Please ensure you are logged in as admin." });
    }
    
    const { name, price, category, image, description, foodType, spiceLevel } =
      req.body;

    // Validate required fields
    if (!name || !price || !category || !image || !description) {
      return res.status(400).json({ message: "All fields are required." });
    }

    // Auto-generate unique id for this siteCode (ignore any id provided in request)
    const lastItem = await MenuItem.findOne({ siteCode }).sort({ id: -1 });
    const newId = lastItem ? lastItem.id + 1 : 1;

    console.log("Creating menu item with data:", {
      siteCode,
      id: newId,
      name,
      price,
      category,
      image,
      description,
      foodType,
      spiceLevel
    });

    const newMenuItem = new MenuItem({
      siteCode,
      id: newId,
      name,
      price,
      category,
      image,
      description,
      foodType,
      spiceLevel: spiceLevel || "medium",
    });

    await newMenuItem.save();
    res.status(201).json({
      message: "Menu item created successfully",
      menuItem: newMenuItem,
    });
  } catch (error) {
    console.error("Error creating menu item:", error);
    res
      .status(500)
      .json({ message: "Error creating menu item", error: error.message });
  }
};

// Update menu item
exports.updateMenuItem = async (req, res) => {
  try {
    const siteCode = req.siteCode;
    const { name, price, category, image, description, foodType, spiceLevel } =
      req.body;

    const updatedItem = await MenuItem.findOneAndUpdate(
      { siteCode, id: req.params.id },
      {
        name,
        price,
        category,
        image,
        description,
        foodType,
        spiceLevel: spiceLevel || "medium" // Default to medium if not provided
      },
      { new: true }
    );

    if (!updatedItem)
      return res.status(404).json({ message: "Menu item not found" });

    res.json({
      message: "Menu item updated successfully",
      menuItem: updatedItem,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error updating menu item", error: error.message });
  }
};

// Delete menu item
exports.deleteMenuItem = async (req, res) => {
  try {
    const siteCode = req.siteCode;
    const deletedItem = await MenuItem.findOneAndDelete({ siteCode, id: req.params.id });
    if (!deletedItem)
      return res.status(404).json({ message: "Menu item not found" });
    res.json({ message: "Menu item deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error deleting menu item", error: error.message });
  }
};
