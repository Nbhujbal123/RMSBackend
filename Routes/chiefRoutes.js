// Backend/Routes/chiefRoutes.js
const express = require("express");
const router = express.Router();
const { chiefMiddleware } = require("../middleware/superAdminMiddleware");
const Order = require("../model/orderModel");

router.use(chiefMiddleware);

// GET /api/chief/orders/stats — dashboard summary for chief's restaurant
router.get("/orders/stats", async (req, res) => {
  try {
    const siteCode = req.user.siteCode;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayOrders = await Order.find({ siteCode, createdAt: { $gte: today } });

    const totalRevenue = todayOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const pendingOrders = todayOrders.filter(o => o.orderStatus === "PENDING").length;
    const completedToday = todayOrders.filter(o => o.orderStatus === "COMPLETED").length;

    const recentOrders = await Order.find({ siteCode })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("user", "name email");

    res.json({
      todayOrders: todayOrders.length,
      todayRevenue: totalRevenue.toFixed(2),
      pendingOrders,
      completedToday,
      recentOrders,
    });
  } catch (error) {
    console.error("Chief orders stats error:", error);
    res.status(500).json({ message: "Failed to fetch order stats", error: error.message });
  }
});

// PUT /api/chief/orders/:id/status — update order status
router.put("/orders/:id/status", async (req, res) => {
  try {
    const siteCode = req.user.siteCode;
    const { status } = req.body;
    const validStatuses = ["PENDING", "PREPARING", "READY", "COMPLETED", "DELIVERED"];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, siteCode },
      { orderStatus: status, statusUpdatedAt: new Date() },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.json({ message: "Order status updated", order });
  } catch (error) {
    console.error("Chief update order status error:", error);
    res.status(500).json({ message: "Failed to update order status", error: error.message });
  }
});

module.exports = router;
