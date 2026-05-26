// Backend/middleware/superAdminMiddleware.js
const jwt = require("jsonwebtoken");
const User = require("../model/userModel");

// Middleware to check if user is superadmin
const superAdminMiddleware = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Find user by id
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if user is superadmin
    if (user.role !== "superadmin") {
      return res.status(403).json({ message: "Access denied. Superadmin only." });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "Invalid token" });
    }
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired" });
    }
    console.error("Superadmin middleware error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Middleware to check if user is admin or superadmin
const adminMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if user is admin or superadmin
    if (!["superadmin", "admin"].includes(user.role)) {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "Invalid token" });
    }
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired" });
    }
    console.error("Admin middleware error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Middleware to check if user is staff, admin or superadmin
const staffMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if user has staff or higher role
    if (!["superadmin", "admin", "staff"].includes(user.role)) {
      return res.status(403).json({ message: "Access denied. Staff only." });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "Invalid token" });
    }
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired" });
    }
    console.error("Staff middleware error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Middleware to check if user is chief (or admin/superadmin)
const chiefMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!["superadmin", "admin", "chief"].includes(user.role)) {
      return res.status(403).json({ message: "Access denied. Chief only." });
    }
    req.user = user;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError") return res.status(401).json({ message: "Invalid token" });
    if (error.name === "TokenExpiredError") return res.status(401).json({ message: "Token expired" });
    console.error("Chief middleware error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { superAdminMiddleware, adminMiddleware, staffMiddleware, chiefMiddleware };
