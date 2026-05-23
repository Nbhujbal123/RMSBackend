// Backend/controllers/dashboardController.js
const Order = require("../model/orderModel");
const MenuItem = require("../model/menuItemModel");
const Bill = require("../model/billModel");

// Get dashboard summary with all analytics
exports.getDashboardSummary = async (req, res) => {
  try {
    const { siteCode } = req;

    // Get start and end of today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Use MongoDB aggregation for orders
    const orderStats = await Order.aggregate([
      {
        $match: {
          siteCode: siteCode,
          createdAt: { $gte: today, $lt: tomorrow }
        }
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: "$total" }
        }
      }
    ]);

    // Get total menu items
    const totalMenuItems = await MenuItem.countDocuments({ siteCode });

    // Note: For tables, we don't have a Table model
    // If tables are stored in restaurant settings, you would query that
    // For now, we'll return 0 as placeholder
    const totalTables = 0;

    // Get paid bills for today (revenue)
    const billStats = await Bill.aggregate([
      {
        $match: {
          siteCode: siteCode,
          status: "PAID",
          createdAt: { $gte: today, $lt: tomorrow }
        }
      },
      {
        $group: {
          _id: null,
          totalPaid: { $sum: "$totalAmount" }
        }
      }
    ]);

    // Calculate totals
    const totalOrdersToday = orderStats.length > 0 ? orderStats[0].totalOrders : 0;
    const revenueFromOrders = orderStats.length > 0 ? orderStats[0].totalRevenue : 0;
    const revenueFromBills = billStats.length > 0 ? billStats[0].totalPaid : 0;
    
    // Use the higher of the two (orders vs bills revenue)
    const totalRevenueToday = Math.max(revenueFromOrders, revenueFromBills);

    res.json({
      success: true,
      data: {
        totalOrdersToday,
        totalRevenueToday: parseFloat(totalRevenueToday.toFixed(2)),
        totalMenuItems,
        totalTables,
        date: new Date().toISOString().split('T')[0]
      }
    });

  } catch (error) {
    console.error("Dashboard summary error:", error);
    res.status(500).json({ 
      success: false,
      message: "Error fetching dashboard summary", 
      error: error.message 
    });
  }
};

// Get detailed order analytics
exports.getOrderAnalytics = async (req, res) => {
  try {
    const { siteCode } = req;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Orders by status
    const ordersByStatus = await Order.aggregate([
      {
        $match: { siteCode: siteCode }
      },
      {
        $group: {
          _id: "$orderStatus",
          count: { $sum: 1 }
        }
      }
    ]);

    // Orders by type
    const ordersByType = await Order.aggregate([
      {
        $match: { siteCode: siteCode }
      },
      {
        $group: {
          _id: "$orderType",
          count: { $sum: 1 }
        }
      }
    ]);

    // Today's orders by status
    const todayOrdersByStatus = await Order.aggregate([
      {
        $match: {
          siteCode: siteCode,
          createdAt: { $gte: today, $lt: tomorrow }
        }
      },
      {
        $group: {
          _id: "$orderStatus",
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        allTime: {
          byStatus: ordersByStatus,
          byType: ordersByType
        },
        today: {
          byStatus: todayOrdersByStatus
        }
      }
    });

  } catch (error) {
    console.error("Order analytics error:", error);
    res.status(500).json({ 
      success: false,
      message: "Error fetching order analytics", 
      error: error.message 
    });
  }
};

// Get revenue analytics
exports.getRevenueAnalytics = async (req, res) => {
  try {
    const { siteCode } = req;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Revenue by day (last 7 days)
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date(today);
      day.setDate(day.getDate() - i);
      last7Days.push(day);
    }

    const dailyRevenue = await Bill.aggregate([
      {
        $match: {
          siteCode: siteCode,
          status: "PAID",
          createdAt: { $gte: last7Days[0], $lt: tomorrow }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          revenue: { $sum: "$totalAmount" },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Total revenue all time
    const totalRevenue = await Bill.aggregate([
      {
        $match: {
          siteCode: siteCode,
          status: "PAID"
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$totalAmount" },
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        dailyRevenue,
        totalRevenue: totalRevenue.length > 0 ? totalRevenue[0].total : 0,
        totalTransactions: totalRevenue.length > 0 ? totalRevenue[0].count : 0
      }
    });

  } catch (error) {
    console.error("Revenue analytics error:", error);
    res.status(500).json({ 
      success: false,
      message: "Error fetching revenue analytics", 
      error: error.message 
    });
  }
};
