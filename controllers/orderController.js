// Backend/controllers/orderController.js
const Order = require("../model/orderModel");
const Bill = require("../model/billModel");
const User = require("../model/userModel");
const { emitToSite } = require("../socket");

// Create a new order
exports.createOrder = async (req, res) => {
  try {
    const siteCode = req.siteCode;
    const { user, items, totalAmount, customer, tableNumber, orderType } = req.body;

    console.log("Creating order with customer data:", customer);

    // Format items with proper menuItemId
    const formattedItems = items.map((item) => ({
      menuItemId: item.id || item.menuItemId,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
    }));

    const newOrder = new Order({
      siteCode,
      user: user || null, // Allow null for guest orders
      tableNumber: tableNumber || null,
      orderType: orderType || 'delivery',
      customer: customer || { name: 'Guest', email: '', phone: '', address: '' }, // Store customer info for guest orders
      items: formattedItems,
      total: totalAmount,
    });

    await newOrder.save();
    console.log("Order saved:", newOrder);

    // Notify admin/chief dashboards in real time
    emitToSite(siteCode, "order:new", { order: newOrder });

    res
      .status(201)
      .json({ message: "Order created successfully", order: newOrder });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error creating order", error: error.message });
  }
};

// Get orders for a user
exports.getOrdersByUser = async (req, res) => {
  try {
    const siteCode = req.siteCode;
    const { userId } = req.params;
    console.log("Fetching orders for user:", userId);
    const orders = await Order.find({ siteCode, user: userId }).sort({ createdAt: -1 });
    console.log("Orders found:", orders.length);
    res.json(orders);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching orders", error: error.message });
  }
};

// Get all orders for a customer by email
exports.getOrdersByEmail = async (req, res) => {
  try {
    const siteCode = req.siteCode;
    const { email } = req.params;
    console.log("Fetching orders for email:", email);
    
    // First find the user by email and siteCode
    const user = await User.findOne({ siteCode, email: new RegExp("^" + email + "$", "i") });
    
    let orders = [];
    if (user) {
      // If user exists, find orders by user ID
      orders = await Order.find({ siteCode, user: user._id }).sort({ createdAt: -1 });
    }
    
    // Also fetch orders that have customer.email matching (for guest orders with email)
    const guestOrders = await Order.find({
      siteCode,
      'customer.email': new RegExp("^" + email + "$", "i")
    }).sort({ createdAt: -1 });
    
    // Merge orders, avoiding duplicates
    const orderIds = new Set(orders.map(o => o._id.toString()));
    guestOrders.forEach(order => {
      if (!orderIds.has(order._id.toString())) {
        orders.push(order);
      }
    });
    
    // Sort by date
    orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    console.log("Orders found:", orders.length);
    res.json(orders);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching orders", error: error.message });
  }
};

// Get all orders (for admin)
exports.getAllOrders = async (req, res) => {
  try {
    const siteCode = req.siteCode;
    const orders = await Order.find({ siteCode })
      .populate("user", "name email")
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching orders", error: error.message });
  }
};

// Get dashboard statistics
exports.getDashboardStats = async (req, res) => {
  try {
    const siteCode = req.siteCode;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get all orders for this site
    const allOrders = await Order.find({ siteCode })
      .populate("user", "name email")
      .sort({ createdAt: -1 });

    // Filter today's orders
    const todayOrders = allOrders.filter(order => {
      const orderDate = new Date(order.createdAt);
      return orderDate >= today && orderDate < tomorrow;
    });

    // Calculate today's revenue
    const todayRevenue = todayOrders.reduce((sum, order) => {
      return sum + (order.total || order.items.reduce((s, i) => s + (i.price || 0) * (i.quantity || 0), 0));
    }, 0);

    // Count pending orders (all pending, not just today)
    const pendingOrders = allOrders.filter(o => o.orderStatus === 'PENDING').length;

    // Count completed orders today (support both COMPLETED and DELIVERED)
    const completedToday = todayOrders.filter(o => o.orderStatus === 'COMPLETED' || o.orderStatus === 'DELIVERED').length;

    // Total orders today
    const todayOrdersCount = todayOrders.length;

    res.json({
      todayOrders: todayOrdersCount,
      todayRevenue: todayRevenue.toFixed(2),
      pendingOrders,
      completedToday,
      recentOrders: allOrders.slice(0, 10)
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching statistics", error: error.message });
  }
};

// Get order by ID
exports.getOrderById = async (req, res) => {
  try {
    const siteCode = req.siteCode;
    const order = await Order.findOne({ siteCode, _id: req.params.orderId });
    if (!order) return res.status(404).json({ message: "Order not found" });
    res.json(order);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching order", error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared billing helper — called by both admin and chief when an order
// reaches COMPLETED / DELIVERED status.
//
// Rules:
//   • Registered user  → find existing UNPAID bill by customerId in this site.
//                         If found, MERGE (add items, add to total).
//                         If not found, create a new bill.
//   • Guest with table → find existing UNPAID bill by tableNumber in this site.
//                         Same merge-or-create logic.
//   • Guest with email → find existing UNPAID bill by customerEmail (no userId).
//                         Same merge-or-create logic.
//   • No match         → create a new bill.
// ─────────────────────────────────────────────────────────────────────────────
const mergeItems = (existingItems, newItems) => {
  // Clone existing items as plain objects (no Mongoose subdoc quirks)
  const merged = existingItems.map((i) => ({
    productId: i.productId,
    name: i.name,
    price: i.price,
    quantity: i.quantity,
  }));

  for (const newItem of newItems) {
    const idx = merged.findIndex((i) => i.productId === newItem.productId);
    if (idx !== -1) {
      merged[idx].quantity += newItem.quantity; // same dish ordered again → add qty
    } else {
      merged.push(newItem); // new dish → append
    }
  }
  return merged;
};

const processBilling = async (order) => {
  const siteCode = order.siteCode;

  const billItems = order.items.map((item) => ({
    productId: item.menuItemId,
    name: item.name,
    price: item.price,
    quantity: item.quantity,
  }));

  const orderSubtotal =
    order.total ||
    order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  if (order.user) {
    // ── Registered user ──────────────────────────────────────────────────────
    const userDoc = order.user; // already populated with name/email

    const existing = await Bill.findOne({
      siteCode,
      customerId: userDoc._id,
      status: "UNPAID",
    });

    if (existing) {
      // Merge new order into the existing unpaid bill
      const merged = mergeItems(existing.items, billItems);
      await Bill.findByIdAndUpdate(existing._id, {
        $set: { items: merged },
        $push: { orderIds: order._id },
        $inc: { subtotal: orderSubtotal, totalAmount: orderSubtotal },
      });
      console.log(`Bill ${existing._id} updated (+₹${orderSubtotal}) for ${userDoc.name}`);
    } else {
      // First order — create a fresh bill
      const bill = new Bill({
        siteCode,
        customerId: userDoc._id,
        customerName: userDoc.name,
        customerEmail: userDoc.email,
        orderIds: [order._id],
        items: billItems,
        subtotal: orderSubtotal,
        totalAmount: orderSubtotal,
        status: "UNPAID",
      });
      await bill.save();
      console.log(`New bill ${bill._id} created for ${userDoc.name} ₹${orderSubtotal}`);
    }
  } else {
    // ── Guest order ───────────────────────────────────────────────────────────
    const customerName = order.customer?.name || "Guest Customer";
    const customerEmail = order.customer?.email || "";
    const customerPhone = order.customer?.phone || "";
    const tableNumber = order.tableNumber || "";

    // Try to find existing unpaid bill: prefer table match, fall back to email
    let existing = null;
    if (tableNumber) {
      existing = await Bill.findOne({ siteCode, tableNumber, status: "UNPAID" });
    }
    if (!existing && customerEmail) {
      existing = await Bill.findOne({
        siteCode,
        customerEmail,
        customerId: null,   // guest bills only
        status: "UNPAID",
      });
    }

    if (existing) {
      const merged = mergeItems(existing.items, billItems);
      await Bill.findByIdAndUpdate(existing._id, {
        $set: { items: merged },
        $push: { orderIds: order._id },
        $inc: { subtotal: orderSubtotal, totalAmount: orderSubtotal },
      });
      console.log(`Guest bill ${existing._id} updated (+₹${orderSubtotal})`);
    } else {
      const bill = new Bill({
        siteCode,
        customerName,
        customerEmail,
        customerPhone,
        tableNumber,
        orderIds: [order._id],
        items: billItems,
        subtotal: orderSubtotal,
        totalAmount: orderSubtotal,
        status: "UNPAID",
      });
      await bill.save();
      console.log(`New guest bill ${bill._id} created ₹${orderSubtotal}`);
    }
  }

  // Mark order as billed regardless of merge / create
  await Order.findByIdAndUpdate(order._id, { isBilled: true });
};

exports.processBilling = processBilling;

// Update order status by id (for admin)
exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const updatedOrder = await Order.findByIdAndUpdate(
      req.params.id,
      { orderStatus: status },
      { new: true }
    ).populate("user", "name email");

    if (!updatedOrder) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (status === "COMPLETED" || status === "DELIVERED") {
      await processBilling(updatedOrder);
    }

    // Notify all clients in this restaurant's room (customers, admin, chief)
    emitToSite(updatedOrder.siteCode, "order:status-updated", {
      orderId: updatedOrder._id,
      status,
      order: updatedOrder,
    });

    res.json({ message: "Order status updated", order: updatedOrder });
  } catch (error) {
    console.error("Error updating order:", error);
    res
      .status(500)
      .json({ message: "Error updating order", error: error.message });
  }
};

// Generate bills for all completed orders that are not billed
exports.generateBillsForCompletedOrders = async (req, res) => {
  try {
    const siteCode = req.siteCode;
    
    if (!siteCode) {
      return res.status(400).json({ message: "Site code is missing" });
    }
    
    console.log("=== GENERATING BILLS FOR COMPLETED ORDERS ===");
    console.log("SiteCode:", siteCode);
    
    // Find all completed orders that are not billed
    const completedOrders = await Order.find({
      siteCode,
      orderStatus: { $in: ["COMPLETED", "DELIVERED"] },
      isBilled: false
    }).populate("user", "name email");
    
    console.log(`Found ${completedOrders.length} completed orders without bills`);
    
    let billsCreated = 0;
    const billsUpdated = 0;

    for (const order of completedOrders) {
      console.log(`\nProcessing order: ${order._id}, Status: ${order.orderStatus}, isBilled: ${order.isBilled}`);
      await processBilling(order);
      billsCreated++;
    }
    
    console.log(`\n=== SUMMARY ===`);
    console.log(`Bills created: ${billsCreated}`);
    console.log(`Bills updated: ${billsUpdated}`);
    console.log(`Total processed: ${completedOrders.length}`);
    
    res.json({
      message: "Bills generated successfully",
      billsCreated,
      billsUpdated,
      totalProcessed: completedOrders.length
    });
  } catch (error) {
    console.error("Error generating bills:", error);
    res
      .status(500)
      .json({ message: "Error generating bills", error: error.message });
  }
};
