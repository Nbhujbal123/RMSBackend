// Backend/Routes/superAdminRoutes.js
const express = require("express");
const router = express.Router();
const { superAdminMiddleware } = require("../middleware/superAdminMiddleware");
const {
  createRestaurant,
  getAllRestaurants,
  toggleRestaurantStatus,
  getRestaurantBySiteCode,
  getRestaurantUsers,
  createStaffUser,
  getDashboardSummary,
  deleteRestaurant
} = require("../controllers/superAdminController");

// All routes require superadmin authentication
router.use(superAdminMiddleware);

// Create a new restaurant with admin user
router.post("/create-restaurant", createRestaurant);

// Get all restaurants
router.get("/restaurants", getAllRestaurants);

// Get restaurant by siteCode
router.get("/restaurants/:siteCode", getRestaurantBySiteCode);

// Deactivate/Activate restaurant
router.put("/restaurants/:siteCode/status", toggleRestaurantStatus);

// Get all users for a restaurant
router.get("/restaurants/:siteCode/users", getRestaurantUsers);

// Create staff user for a restaurant
router.post("/restaurants/:siteCode/users", createStaffUser);

// Delete a restaurant and all its data
router.delete("/restaurants/:siteCode", deleteRestaurant);

// Get dashboard summary for superadmin
router.get("/dashboard-summary", getDashboardSummary);

module.exports = router;
