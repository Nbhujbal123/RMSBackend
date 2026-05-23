// Backend/controllers/orderController.js
const Order = require("../model/orderModel");
const Bill = require("../model/billModel");
const User = require("../model/userModel");

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

// Update order status by id (for admin)
exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    console.log("=== UPDATE ORDER STATUS ===");
    console.log("Order ID:", req.params.id);
    console.log("New Status:", status);
    
    const updatedOrder = await Order.findByIdAndUpdate(
      req.params.id,
      { orderStatus: status },
      { new: true }
    ).populate("user", "name email");
    
    if (!updatedOrder) {
      console.log("Order not found!");
      return res.status(404).json({ message: "Order not found" });
    }
    
    console.log("Order updated. isBilled:", updatedOrder.isBilled);
    console.log("Order customer data:", updatedOrder.customer);

    // If order is completed/delivered, always create/update bill
    // This ensures each completed order gets its own bill
    if (status === "COMPLETED" || status === "DELIVERED") {
      console.log("=== PROCESSING BILLING ===");
      console.log("Order " + updatedOrder._id + " status changed to " + status + ". Processing billing.");
      
      // Get siteCode from the order
      const siteCode = updatedOrder.siteCode;
      
      // Process billing for all orders (registered users and guest orders)
      const billItems = updatedOrder.items.map((item) => ({
        productId: item.menuItemId,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
      }));

      if (updatedOrder.user) {
        // Registered user - create a new bill for this order
        const userDoc = updatedOrder.user;
        console.log("Registered user - customerId:", userDoc._id);
        console.log("Creating new bill for customer " + userDoc.name + " with siteCode:", siteCode);
        
        // Create new bill for this specific order
        const orderSubtotal = updatedOrder.total || updatedOrder.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const newBill = new Bill({
          siteCode,
          customerId: userDoc._id,
          customerName: userDoc.name,
          customerEmail: userDoc.email,
          orderIds: [updatedOrder._id],
          items: billItems,
          subtotal: orderSubtotal,
          totalAmount: orderSubtotal,
          status: "UNPAID",
        });
        await newBill.save();
        console.log("New bill created: " + newBill._id + " for " + newBill.totalAmount);
      } else {
        // Guest order - create a new bill for this order
        console.log("Guest order - creating bill for order " + updatedOrder._id);
        console.log("Customer info:", updatedOrder.customer);
        
        // Get customer info from the order
        const customerName = updatedOrder.customer?.name || 'Guest Customer';
        const customerEmail = updatedOrder.customer?.email || '';
        const customerPhone = updatedOrder.customer?.phone || '';
        const tableNumber = updatedOrder.tableNumber || '';
        
        console.log("Creating new bill for guest:" , { customerName, customerEmail, tableNumber });
        
        // Create new bill for this specific order
        const orderSubtotal = updatedOrder.total || updatedOrder.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const newBill = new Bill({
          siteCode,
          customerName: customerName,
          customerEmail: customerEmail,
          customerPhone: customerPhone,
          tableNumber: tableNumber,
          orderIds: [updatedOrder._id],
          items: billItems,
          subtotal: orderSubtotal,
          totalAmount: orderSubtotal,
          status: "UNPAID",
        });
        await newBill.save();
        console.log("New guest bill created: " + newBill._id + " for " + newBill.totalAmount);
      }

      // Mark order as billed
      await Order.findByIdAndUpdate(updatedOrder._id, { isBilled: true });
      console.log("Order " + updatedOrder._id + " marked as isBilled: true");
    } else {
      console.log("No billing needed. Status:", status, ", isBilled:", updatedOrder.isBilled);
    }

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
    let billsUpdated = 0;
    
    for (const order of completedOrders) {
      console.log(`\nProcessing order: ${order._id}, Status: ${order.orderStatus}, isBilled: ${order.isBilled}`);
      
      const billItems = order.items.map((item) => ({
        productId: item.menuItemId,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
      }));

      const customerName = order.customer?.name || order.user?.name || 'Guest Customer';
      const customerEmail = order.customer?.email || order.user?.email || '';
      const customerPhone = order.customer?.phone || '';
      const tableNumber = order.tableNumber || '';
      
      if (order.user) {
        // Registered user - create a new bill for this order
        const userDoc = order.user;
        console.log("Creating new bill for customer " + userDoc.name);
        
        // Create new bill for this specific order
        const orderSubtotal = order.total || order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const newBill = new Bill({
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
        await newBill.save();
        billsCreated++;
      } else {
        // Guest order - create a new bill for this order
        console.log("Creating new bill for guest: " + customerName);
        
        // Create new bill for this specific order
        const orderSubtotal = order.total || order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const newBill = new Bill({
          siteCode,
          customerName: customerName,
          customerEmail: customerEmail,
          customerPhone: customerPhone,
          tableNumber: tableNumber,
          orderIds: [order._id],
          items: billItems,
          subtotal: orderSubtotal,
          totalAmount: orderSubtotal,
          status: "UNPAID",
        });
        await newBill.save();
        billsCreated++;
      }
      
      // Mark order as billed
      await Order.findByIdAndUpdate(order._id, { isBilled: true });
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
