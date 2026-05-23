// Backend/middleware/siteCodeMiddleware.js
const Restaurant = require("../model/restaurantModel");

// Middleware to extract and validate siteCode from request
// Supports both header and query parameter
const siteCodeMiddleware = async (req, res, next) => {
  try {
    // Get siteCode from header (preferred) or query parameter
    const siteCode = (req.headers['x-site-code'] || req.query.siteCode || '').toString().toUpperCase().trim();
    
    if (!siteCode) {
      return res.status(400).json({ message: "Site code is required. Please provide x-site-code header or siteCode query parameter." });
    }

    // Allow superadmin to bypass restaurant validation
    if (siteCode === 'SUPERADMIN') {
      req.siteCode = siteCode;
      req.restaurant = null;
      return next();
    }
    
    // Verify restaurant exists and is active
    const restaurant = await Restaurant.findOne({ siteCode });
    
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found with this site code." });
    }

    if (restaurant.status !== 'ACTIVE') {
      return res.status(403).json({ message: "This restaurant's account is currently inactive." });
    }

    // Attach siteCode to request for use in controllers
    req.siteCode = siteCode;
    req.restaurant = restaurant;
    
    next();
  } catch (error) {
    console.error("SiteCode middleware error:", error.message);
    res.status(500).json({ message: "Server error validating site code" });
  }
};

// Optional middleware - doesn't fail if no siteCode, but adds it if present
const optionalSiteCodeMiddleware = async (req, res, next) => {
  try {
    const siteCode = (req.headers['x-site-code'] || req.query.siteCode || '').toString().toUpperCase().trim();
    
    if (siteCode) {
      const restaurant = await Restaurant.findOne({ siteCode });
      if (restaurant && restaurant.status === 'ACTIVE') {
        req.siteCode = siteCode;
        req.restaurant = restaurant;
      }
    }
    
    next();
  } catch (error) {
    // Don't fail on optional middleware error
    next();
  }
};

module.exports = { siteCodeMiddleware, optionalSiteCodeMiddleware };
