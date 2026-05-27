// Backend/controllers/superAdminController.js
const User = require("../model/userModel");
const Restaurant = require("../model/restaurantModel");
const bcrypt = require("bcryptjs");

// Generate unique siteCode with retry logic
const generateUniqueSiteCode = async (maxAttempts = 10) => {
  const prefix = "RESTO";
  
  for (let i = 0; i < maxAttempts; i++) {
    const randomNum = Math.floor(1000 + Math.random() * 9000); // 4 digit number (1000-9999)
    const siteCode = `${prefix}${randomNum}`;
    
    // Check if siteCode exists in Restaurant collection
    const existingRestaurant = await Restaurant.findOne({ siteCode });
    if (!existingRestaurant) {
      return siteCode;
    }
  }
  
  // If all attempts failed, try with timestamp
  const timestamp = Date.now().toString().slice(-4);
  return `${prefix}${timestamp}`;
};

// Create a new restaurant with admin user
exports.createRestaurant = async (req, res) => {
  let savedRestaurant = null;

  try {
    const {
      restaurantName,
      restaurantEmail,
      restaurantPhone,
      adminName,
      adminEmail,
      adminMobile,
      adminPassword
    } = req.body;

    // Validation
    if (!restaurantName || !restaurantEmail || !restaurantPhone) {
      return res.status(400).json({ message: "Restaurant details are required" });
    }
    if (!adminName || !adminEmail || !adminMobile || !adminPassword) {
      return res.status(400).json({ message: "Admin user details are required" });
    }
    if (adminPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const normalizedAdminEmail = adminEmail.toLowerCase().trim();

    // Step 1: Generate unique siteCode
    const siteCode = await generateUniqueSiteCode();

    // Step 2: Save restaurant
    const restaurant = new Restaurant({
      name: restaurantName,
      siteCode,
      email: restaurantEmail.toLowerCase().trim(),
      phone: restaurantPhone,
      status: "ACTIVE",
      createdAt: new Date()
    });
    await restaurant.save();
    savedRestaurant = restaurant;

    // Step 3: Check for duplicate admin email under this siteCode
    const existingUser = await User.findOne({ siteCode, email: normalizedAdminEmail });
    if (existingUser) {
      await Restaurant.deleteOne({ _id: restaurant._id });
      return res.status(409).json({
        message: "An admin with this email already exists. Please use a different email."
      });
    }

    // Step 4: Save admin user
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    const adminUser = new User({
      siteCode,
      name: adminName,
      email: normalizedAdminEmail,
      mobile: adminMobile,
      password: hashedPassword,
      role: "admin",
      isVerified: true,
      otp: null,
      otpExpires: null
    });
    await adminUser.save();

    res.status(201).json({
      success: true,
      message: "Restaurant created successfully",
      restaurant: {
        _id: restaurant._id,
        name: restaurant.name,
        siteCode: restaurant.siteCode,
        email: restaurant.email,
        phone: restaurant.phone,
        status: restaurant.status,
        createdAt: restaurant.createdAt
      },
      adminCredentials: {
        email: adminUser.email,
        password: adminPassword,
        role: adminUser.role,
        siteCode: adminUser.siteCode
      }
    });

  } catch (error) {
    // Manual rollback: delete the restaurant if admin save failed
    if (savedRestaurant) {
      await Restaurant.deleteOne({ _id: savedRestaurant._id }).catch(() => {});
    }

    console.error("Create restaurant error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        message: "Restaurant or admin user already exists. Please try again."
      });
    }

    res.status(500).json({
      message: "Error creating restaurant",
      error: error.message
    });
  }
};

// Get all restaurants
exports.getAllRestaurants = async (req, res) => {
  try {
    const restaurants = await Restaurant.find().sort({ createdAt: -1 });
    
    // Get order counts for each restaurant
    const Order = require("../model/orderModel");
    const restaurantsWithCounts = await Promise.all(
      restaurants.map(async (restaurant) => {
        const orderCount = await Order.countDocuments({ siteCode: restaurant.siteCode });
        return {
          ...restaurant.toObject(),
          orderCount
        };
      })
    );
    
    res.json(restaurantsWithCounts);
  } catch (error) {
    console.error("Get restaurants error:", error);
    res.status(500).json({ message: "Error fetching restaurants", error: error.message });
  }
};

// Deactivate/Activate restaurant
exports.toggleRestaurantStatus = async (req, res) => {
  try {
    const { siteCode } = req.params;
    const { status } = req.body; // ACTIVE, INACTIVE, SUSPENDED

    if (!["ACTIVE", "INACTIVE", "SUSPENDED"].includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    const restaurant = await Restaurant.findOneAndUpdate(
      { siteCode: siteCode.toUpperCase() },
      { status: status },
      { new: true }
    );

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    res.json({
      message: `Restaurant ${status === 'ACTIVE' ? 'activated' : status === 'INACTIVE' ? 'deactivated' : 'suspended'} successfully`,
      restaurant
    });
  } catch (error) {
    console.error("Toggle restaurant status error:", error);
    res.status(500).json({ message: "Error updating restaurant status", error: error.message });
  }
};

// Get restaurant by siteCode
exports.getRestaurantBySiteCode = async (req, res) => {
  try {
    const { siteCode } = req.params;
    
    const restaurant = await Restaurant.findOne({ siteCode: siteCode.toUpperCase() });
    
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    res.json(restaurant);
  } catch (error) {
    console.error("Get restaurant error:", error);
    res.status(500).json({ message: "Error fetching restaurant", error: error.message });
  }
};

// Get all users for a restaurant
exports.getRestaurantUsers = async (req, res) => {
  try {
    const { siteCode } = req.params;
    
    const users = await User.find({ siteCode: siteCode.toUpperCase() })
      .select("-password -otp -otpExpires")
      .sort({ createdAt: -1 });

    res.json(users);
  } catch (error) {
    console.error("Get restaurant users error:", error);
    res.status(500).json({ message: "Error fetching users", error: error.message });
  }
};

// Create staff user for a restaurant
exports.createStaffUser = async (req, res) => {
  try {
    const { siteCode } = req.params;
    const { name, email, mobile, password, role } = req.body;

    if (!name || !email || !mobile || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const validRoles = ["admin", "staff"];
    const userRole = role && validRoles.includes(role) ? role : "staff";

    // Check if user already exists
    const existingUser = await User.findOne({ 
      siteCode: siteCode.toUpperCase(), 
      email: email.toLowerCase().trim() 
    });

    if (existingUser) {
      return res.status(409).json({ message: "User with this email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      siteCode: siteCode.toUpperCase(),
      name,
      email: email.toLowerCase().trim(),
      mobile,
      password: hashedPassword,
      role: userRole,
      isVerified: true
    });

    await newUser.save();

    res.status(201).json({
      message: "Staff user created successfully",
      user: {
        name: newUser.name,
        email: newUser.email,
        role: newUser.role
      }
    });
  } catch (error) {
    console.error("Create staff user error:", error);
    res.status(500).json({ message: "Error creating user", error: error.message });
  }
};

// Delete a restaurant and all its associated data
exports.deleteRestaurant = async (req, res) => {
  try {
    const { siteCode } = req.params;
    const code = siteCode.toUpperCase();

    const restaurant = await Restaurant.findOne({ siteCode: code });
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    const Order = require("../model/orderModel");
    const Bill = require("../model/billModel");
    const MenuItem = require("../model/menuItemModel");

    await Promise.all([
      Restaurant.deleteOne({ siteCode: code }),
      User.deleteMany({ siteCode: code }),
      Order.deleteMany({ siteCode: code }),
      Bill.deleteMany({ siteCode: code }),
      MenuItem.deleteMany({ siteCode: code }),
    ]);

    res.json({ message: `Restaurant "${restaurant.name}" and all its data have been deleted.` });
  } catch (error) {
    console.error("Delete restaurant error:", error);
    res.status(500).json({ message: "Error deleting restaurant", error: error.message });
  }
};

// Get dashboard summary for superadmin (aggregate stats across all restaurants)
exports.getDashboardSummary = async (req, res) => {
  try {
    const Restaurant = require("../model/restaurantModel");
    const Order = require("../model/orderModel");
    const Bill = require("../model/billModel");
    const User = require("../model/userModel");

    // Get start of today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get all restaurants
    const restaurants = await Restaurant.find();
    const totalRestaurants = restaurants.length;
    const activeRestaurants = restaurants.filter(r => r.status === 'ACTIVE').length;

    // Get today's orders across all restaurants
    const ordersToday = await Order.countDocuments({
      createdAt: { $gte: today, $lt: tomorrow }
    });

    // Get today's revenue from bills (PAID bills only)
    const todayBills = await Bill.find({
      status: 'PAID',
      createdAt: { $gte: today, $lt: tomorrow }
    });
    const revenueToday = todayBills.reduce((sum, bill) => sum + (bill.totalAmount || 0), 0);

    // Get total customers across all restaurants (excluding admins and staff)
    const totalCustomers = await User.countDocuments({
      role: 'customer'
    });

    // Get total orders (all time)
    const totalOrders = await Order.countDocuments();

    // Get total revenue (all time from PAID bills)
    const allPaidBills = await Bill.find({ status: 'PAID' });
    const totalRevenue = allPaidBills.reduce((sum, bill) => sum + (bill.totalAmount || 0), 0);

    res.json({
      totalRestaurants,
      activeRestaurants,
      ordersToday,
      revenueToday,
      totalCustomers,
      totalOrders,
      totalRevenue
    });
  } catch (error) {
    console.error("Get dashboard summary error:", error);
    res.status(500).json({ message: "Error fetching dashboard summary", error: error.message });
  }
};
