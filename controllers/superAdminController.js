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
  const session = await require("mongoose").startSession();
  session.startTransaction();
  
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
      await session.abortTransaction();
      return res.status(400).json({ message: "Restaurant details are required" });
    }
    if (!adminName || !adminEmail || !adminMobile || !adminPassword) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Admin user details are required" });
    }
    if (adminPassword.length < 6) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    // Step 1: Generate unique siteCode
    const siteCode = await generateUniqueSiteCode();
    
    // Step 2: Create and save restaurant in Restaurant collection
    const restaurant = new Restaurant({
      name: restaurantName,
      siteCode: siteCode,
      email: restaurantEmail.toLowerCase().trim(),
      phone: restaurantPhone,
      status: "ACTIVE",
      createdAt: new Date()
    });

    await restaurant.save({ session });
    
    // Step 3: Create default admin user with same siteCode
    const normalizedAdminEmail = adminEmail.toLowerCase().trim();
    
    // Check if admin email already exists for this siteCode
    const existingUser = await User.findOne({ 
      siteCode: siteCode, 
      email: normalizedAdminEmail 
    }).session(session);
    
    if (existingUser) {
      await session.abortTransaction();
      return res.status(409).json({ 
        message: "Admin user with this email already exists for this restaurant" 
      });
    }

    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    const adminUser = new User({
      siteCode: siteCode,
      name: adminName,
      email: normalizedAdminEmail,
      mobile: adminMobile,
      password: hashedPassword,
      role: "admin",
      isVerified: true,
      otp: null,
      otpExpires: null
    });

    await adminUser.save({ session });
    
    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    // Step 4: Return success response with admin login credentials
    res.status(201).json({
      success: true,
      message: "Restaurant created successfully with default admin",
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
        password: adminPassword, // Return the plaintext password set by superadmin
        role: adminUser.role,
        siteCode: adminUser.siteCode
      },
      loginDetails: {
        siteCode: adminUser.siteCode,
        email: adminUser.email,
        // Note: Password should be changed by admin after first login for security
        temporaryPassword: adminPassword
      }
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error("Create restaurant error:", error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(409).json({ 
        message: "Restaurant or user already exists. Please try again." 
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
