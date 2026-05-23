// Backend/middleware/siteMiddleware.js

/**
 * Middleware to extract and validate siteCode from request headers
 * 
 * This middleware:
 * 1. Extracts siteCode from x-site-code header
 * 2. Attaches it to req.siteCode
 * 3. Rejects the request if siteCode is missing
 */

// Required middleware - rejects if siteCode is missing
const siteMiddleware = (req, res, next) => {
  try {
    // Get siteCode from header
    const siteCode = (req.headers['x-site-code'] || '').toString().toUpperCase().trim();
    
    if (!siteCode) {
      return res.status(400).json({ 
        success: false,
        message: "Site code is required. Please provide 'x-site-code' header." 
      });
    }

    // Attach siteCode to request for use in controllers
    req.siteCode = siteCode;
    
    next();
  } catch (error) {
    console.error("SiteMiddleware error:", error.message);
    res.status(500).json({ 
      success: false,
      message: "Server error processing site code" 
    });
  }
};

// Optional middleware - doesn't fail if no siteCode, but adds it if present
const optionalSiteMiddleware = (req, res, next) => {
  try {
    const siteCode = (req.headers['x-site-code'] || '').toString().toUpperCase().trim();
    
    if (siteCode) {
      req.siteCode = siteCode;
    }
    
    next();
  } catch (error) {
    // Don't fail on optional middleware error
    next();
  }
};

module.exports = { siteMiddleware, optionalSiteMiddleware };
