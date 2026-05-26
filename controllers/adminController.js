// Backend/controllers/adminController.js
const User = require("../model/userModel");
const bcrypt = require("bcryptjs");
const Restaurant = require("../model/restaurantModel");

exports.createChief = async (req, res) => {
  try {
    const { name, email, mobile, password, siteCode } = req.body;

    if (!name || !email || !mobile || !password || !siteCode) {
      return res.status(400).json({ message: "All fields are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }
    const emailRegex = /\S+@\S+\.\S+/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }
    const mobileStr = mobile.toString().trim();
    if (mobileStr.length < 10) {
      return res.status(400).json({ message: "Mobile number must be at least 10 digits" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedSiteCode = siteCode.toString().toUpperCase().trim();

    const restaurant = await Restaurant.findOne({ siteCode: normalizedSiteCode });
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found for this site code" });
    }

    const existingUser = await User.findOne({ email: normalizedEmail, siteCode: normalizedSiteCode });
    if (existingUser) {
      return res.status(409).json({ message: "A user with this email already exists for this restaurant" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const chief = new User({
      siteCode: normalizedSiteCode,
      name: name.trim(),
      email: normalizedEmail,
      mobile: mobileStr,
      password: hashedPassword,
      role: "chief",
      isVerified: true,
    });

    await chief.save();

    res.status(201).json({
      message: "Chief created successfully",
      chief: {
        id: chief._id,
        name: chief.name,
        email: chief.email,
        mobile: chief.mobile,
        role: chief.role,
        siteCode: chief.siteCode,
        restaurantName: restaurant.name,
      },
    });
  } catch (error) {
    console.error("Create chief error:", error);
    res.status(500).json({ message: "Failed to create chief", error: error.message });
  }
};

exports.listChiefs = async (req, res) => {
  try {
    const siteCode = req.user.siteCode;
    const chiefs = await User.find({ siteCode, role: "chief" }).select("-password -otp -otpExpires");
    res.json({ chiefs });
  } catch (error) {
    console.error("List chiefs error:", error);
    res.status(500).json({ message: "Failed to fetch chiefs", error: error.message });
  }
};
