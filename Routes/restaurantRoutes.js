// Backend/Routes/restaurantRoutes.js
const express = require("express");
const router = express.Router();
const Restaurant = require("../model/restaurantModel");

// Create a new restaurant (public - for initial setup)
router.post("/", async (req, res) => {
  try {
    const { name, siteCode, email, phone } = req.body;
    
    if (!name || !siteCode || !email || !phone) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const normalizedSiteCode = siteCode.toUpperCase().trim();
    
    // Check if siteCode already exists
    const existing = await Restaurant.findOne({ siteCode: normalizedSiteCode });
    if (existing) {
      return res.status(409).json({ message: "Site code already exists" });
    }

    const restaurant = new Restaurant({
      name,
      siteCode: normalizedSiteCode,
      email,
      phone,
      status: "ACTIVE"
    });

    await restaurant.save();
    res.status(201).json({ message: "Restaurant created successfully", restaurant });
  } catch (error) {
    console.error("Create restaurant error:", error);
    res.status(500).json({ message: "Error creating restaurant", error: error.message });
  }
});

// Get restaurant by siteCode (public)
router.get("/:siteCode", async (req, res) => {
  try {
    const siteCode = req.params.siteCode.toUpperCase();
    const restaurant = await Restaurant.findOne({ siteCode });
    
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    res.json(restaurant);
  } catch (error) {
    res.status(500).json({ message: "Error fetching restaurant", error: error.message });
  }
});

// Get all restaurants (admin only - could be protected)
router.get("/", async (req, res) => {
  try {
    const restaurants = await Restaurant.find().sort({ createdAt: -1 });
    res.json(restaurants);
  } catch (error) {
    res.status(500).json({ message: "Error fetching restaurants", error: error.message });
  }
});

// Update restaurant
router.put("/:siteCode", async (req, res) => {
  try {
    const siteCode = req.params.siteCode.toUpperCase();
    const { name, email, phone, status } = req.body;
    
    const restaurant = await Restaurant.findOneAndUpdate(
      { siteCode },
      { name, email, phone, status },
      { new: true }
    );

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    res.json({ message: "Restaurant updated", restaurant });
  } catch (error) {
    res.status(500).json({ message: "Error updating restaurant", error: error.message });
  }
});

module.exports = router;
