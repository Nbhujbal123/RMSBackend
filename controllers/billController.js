// Backend/controllers/billController.js
const Bill = require("../model/billModel");

// Get all bills with filters
exports.getAllBills = async (req, res) => {
  try {
    const { status, search, startDate, endDate, page = 1, limit = 20 } = req.query;
    const siteCode = req.siteCode;
    
    let query = { siteCode };
    
    // Filter by status
    if (status && status !== 'ALL') {
      query.status = status;
    }
    
    // Search by invoice number or customer name
    if (search) {
      query.$or = [
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const bills = await Bill.find(query)
      .populate("customerId", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Bill.countDocuments(query);
    
    res.json({
      bills,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching bills", error: error.message });
  }
};

// Get unpaid bills only
exports.getUnpaidBills = async (req, res) => {
  try {
    console.log("Fetching unpaid bills...");
    const siteCode = req.siteCode;
    const bills = await Bill.find({ siteCode, status: "UNPAID" })
      .populate("customerId", "name email")
      .sort({ createdAt: -1 });
    console.log(`Found ${bills.length} unpaid bills`);
    res.json(bills);
  } catch (error) {
    console.error("Error fetching unpaid bills:", error);
    res
      .status(500)
      .json({ message: "Error fetching unpaid bills", error: error.message });
  }
};

// Get paid bills only
exports.getPaidBills = async (req, res) => {
  try {
    const siteCode = req.siteCode;
    const bills = await Bill.find({ siteCode, status: "PAID" })
      .populate("customerId", "name email")
      .sort({ createdAt: -1 });
    res.json(bills);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching paid bills", error: error.message });
  }
};

// Mark bill as paid
exports.payBill = async (req, res) => {
  try {
    const { billId } = req.params;
    const { paymentMethod } = req.body;
    
    const updateData = { status: "PAID" };
    if (paymentMethod) {
      updateData.paymentMethod = paymentMethod;
    }
    
    const updatedBill = await Bill.findByIdAndUpdate(
      billId,
      updateData,
      { new: true }
    ).populate("customerId", "name email");
    
    if (!updatedBill) {
      return res.status(404).json({ message: "Bill not found" });
    }
    
    // Update all associated orders to mark them as paid
    if (updatedBill.orderIds && updatedBill.orderIds.length > 0) {
      const Order = require("../model/orderModel");
      await Order.updateMany(
        { _id: { $in: updatedBill.orderIds } },
        { isPaid: true }
      );
      console.log(`Updated ${updatedBill.orderIds.length} orders as paid`);
    }
    
    res.json({ message: "Bill marked as paid", bill: updatedBill });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error updating bill", error: error.message });
  }
};

// Toggle bill payment status
exports.toggleBillStatus = async (req, res) => {
  try {
    const { billId } = req.params;
    const bill = await Bill.findById(billId);
    
    if (!bill) {
      return res.status(404).json({ message: "Bill not found" });
    }
    
    const newStatus = bill.status === 'PAID' ? 'UNPAID' : 'PAID';
    
    const updatedBill = await Bill.findByIdAndUpdate(
      billId,
      { status: newStatus },
      { new: true }
    ).populate("customerId", "name email");
    
    // Update all associated orders based on the new status
    if (updatedBill.orderIds && updatedBill.orderIds.length > 0) {
      const Order = require("../model/orderModel");
      await Order.updateMany(
        { _id: { $in: updatedBill.orderIds } },
        { isPaid: newStatus === 'PAID' }
      );
      console.log(`Updated ${updatedBill.orderIds.length} orders to isPaid: ${newStatus === 'PAID'}`);
    }
    
    res.json({ message: `Bill marked as ${newStatus}`, bill: updatedBill });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error updating bill status", error: error.message });
  }
};

// Get paid bills for a customer
exports.getPaidBillsByCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;
    console.log("Fetching paid bills for customer:", customerId);
    const bills = await Bill.find({ customerId, status: "PAID" }).sort({
      createdAt: -1,
    });
    console.log(`Found ${bills.length} paid bills for customer ${customerId}`);
    res.json(bills);
  } catch (error) {
    console.error("Error fetching paid bills:", error);
    res
      .status(500)
      .json({ message: "Error fetching paid bills", error: error.message });
  }
};

// Get all bills for a customer
exports.getAllBillsByCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;
    console.log("Fetching all bills for customer:", customerId);
    const bills = await Bill.find({ customerId }).sort({
      createdAt: -1,
    });
    console.log(`Found ${bills.length} bills for customer ${customerId}`);
    res.json(bills);
  } catch (error) {
    console.error("Error fetching bills:", error);
    res
      .status(500)
      .json({ message: "Error fetching bills", error: error.message });
  }
};

// Get bills by user email (alternative lookup)
exports.getBillsByEmail = async (req, res) => {
  try {
    const { email } = req.params;
    console.log("Fetching bills for email:", email);
    
    // First find user by email
    const User = require("../model/userModel");
    const user = await User.findOne({ email: new RegExp(`^${email}$`, "i") });
    
    if (!user) {
      return res.json([]);
    }
    
    const bills = await Bill.find({ customerId: user._id }).sort({
      createdAt: -1,
    });
    console.log(`Found ${bills.length} bills for email ${email}`);
    res.json(bills);
  } catch (error) {
    console.error("Error fetching bills by email:", error);
    res
      .status(500)
      .json({ message: "Error fetching bills", error: error.message });
  }
};

// Get bills by customer name (alternative lookup)
exports.getBillsByName = async (req, res) => {
  try {
    const { name } = req.params;
    console.log("Fetching bills for name:", name);
    
    const bills = await Bill.find({ 
      customerName: new RegExp(name, "i") 
    }).sort({
      createdAt: -1,
    });
    console.log(`Found ${bills.length} bills for name ${name}`);
    res.json(bills);
  } catch (error) {
    console.error("Error fetching bills by name:", error);
    res
      .status(500)
      .json({ message: "Error fetching bills", error: error.message });
  }
};

// Get all bills with customer info (for customer self-service)
exports.getAllBillsWithInfo = async (req, res) => {
  try {
    const siteCode = req.siteCode;
    const bills = await Bill.find({ siteCode })
      .populate("customerId", "name email")
      .sort({ createdAt: -1 })
      .limit(100);
    console.log(`Found ${bills.length} bills with customer info for site ${siteCode}`);
    // Make sure orderIds is included in response
    const billsWithOrderIds = bills.map(bill => ({
      ...bill.toObject(),
      orderIds: bill.orderIds || []
    }));
    res.json(billsWithOrderIds);
  } catch (error) {
    console.error("Error fetching bills:", error);
    res.status(500).json({ message: "Error fetching bills", error: error.message });
  }
};

// Get bill by ID
exports.getBillById = async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.billId).populate(
      "customerId",
      "name email"
    );
    if (!bill) {
      return res.status(404).json({ message: "Bill not found" });
    }
    res.json(bill);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching bill", error: error.message });
  }
};

// Create new bill
exports.createBill = async (req, res) => {
  try {
    const { customerId, customerName, customerEmail, customerPhone, tableNumber, items, subtotal, tax, deliveryFee, discount, totalAmount } = req.body;
    
    const bill = new Bill({
      customerId,
      customerName,
      customerEmail,
      customerPhone,
      tableNumber,
      items,
      subtotal,
      tax: tax || 0,
      deliveryFee: deliveryFee || 0,
      discount: discount || 0,
      totalAmount,
      status: 'UNPAID'
    });
    
    await bill.save();
    res.status(201).json(bill);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error creating bill", error: error.message });
  }
};

// Get billing statistics
exports.getBillingStats = async (req, res) => {
  try {
    const siteCode = req.siteCode;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [totalBills, paidBills, unpaidBills, todayRevenue, todayBills] = await Promise.all([
      Bill.countDocuments({ siteCode }),
      Bill.countDocuments({ siteCode, status: 'PAID' }),
      Bill.countDocuments({ siteCode, status: 'UNPAID' }),
      Bill.aggregate([
        { $match: { siteCode, status: 'PAID', createdAt: { $gte: today } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ]),
      Bill.countDocuments({ siteCode, createdAt: { $gte: today } })
    ]);
    
    res.json({
      totalBills,
      paidBills,
      unpaidBills,
      todayRevenue: todayRevenue[0]?.total || 0,
      todayBills
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching billing stats", error: error.message });
  }
};
