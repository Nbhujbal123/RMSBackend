// Backend/Routes/menuRoutes.js
const express = require("express");
const router = express.Router();
const { siteCodeMiddleware, optionalSiteCodeMiddleware } = require("../middleware/siteCodeMiddleware");
const {
  getAllMenuItems,
  getMenuItemById,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
} = require("../controllers/menuController");

// Apply optionalSiteCodeMiddleware for GET requests (browsing menu)
// Apply siteCodeMiddleware for POST/PUT/DELETE (requires siteCode)
router.get("/", optionalSiteCodeMiddleware, getAllMenuItems);
router.get("/:id", optionalSiteCodeMiddleware, getMenuItemById);

// Protected routes - require siteCode
router.post("/", siteCodeMiddleware, createMenuItem);
router.put("/:id", siteCodeMiddleware, updateMenuItem);
router.delete("/:id", siteCodeMiddleware, deleteMenuItem);

module.exports = router;
