// Backend/Routes/billRoutes.js
const express = require("express");
const router = express.Router();
const { siteCodeMiddleware } = require("../middleware/siteCodeMiddleware");
const {
  getAllBills,
  getUnpaidBills,
  getPaidBills,
  payBill,
  toggleBillStatus,
  getBillById,
  getPaidBillsByCustomer,
  getAllBillsByCustomer,
  getBillsByEmail,
  getBillsByName,
  getAllBillsWithInfo,
  createBill,
  getBillingStats,
} = require("../controllers/billController");

// Apply siteCodeMiddleware to all routes
router.use(siteCodeMiddleware);

// Routes
router.get("/", getAllBills);
router.get("/stats", getBillingStats);
router.get("/unpaid", getUnpaidBills);
router.get("/paid", getPaidBills);
router.get("/paid/:customerId", getPaidBillsByCustomer);
router.get("/customer/:customerId", getAllBillsByCustomer);
router.get("/email/:email", getBillsByEmail);
router.get("/name/:name", getBillsByName);
router.get("/all-with-info", getAllBillsWithInfo);
router.put("/pay/:billId", payBill);
router.put("/toggle/:billId", toggleBillStatus);
router.post("/", createBill);
router.get("/:billId", getBillById);

module.exports = router;
