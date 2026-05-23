// Backend/Routes/dashboardRoutes.js
const express = require("express");
const router = express.Router();
const { siteMiddleware } = require("../middleware/siteMiddleware");
const {
  getDashboardSummary,
  getOrderAnalytics,
  getRevenueAnalytics
} = require("../controllers/dashboardController");

// Apply siteMiddleware to all routes
router.use(siteMiddleware);

// Dashboard summary endpoint
router.get("/summary", getDashboardSummary);

// Additional analytics endpoints
router.get("/orders/analytics", getOrderAnalytics);
router.get("/revenue/analytics", getRevenueAnalytics);

module.exports = router;
