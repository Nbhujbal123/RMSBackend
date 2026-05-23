// Backend/Routes/authRoutes.js
const express = require("express");
const router = express.Router();
const {
  signup,
  verifyOtp,
  login,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  createSuperAdmin,
  ensureSuperAdminExists,
  sendLoginOtp,
  verifyLoginOtp,
  sendEmailLoginOtp,
  verifyEmailLoginOtp,
} = require("../controllers/authController");

// Public routes - no siteCode required
router.post("/signup", signup);
router.post("/verify-otp", verifyOtp);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/verify-reset-otp", verifyResetOtp);
router.post("/reset-password", resetPassword);
router.post("/create-superadmin", createSuperAdmin);

// Customer phone-OTP login
router.post("/send-login-otp", sendLoginOtp);
router.post("/verify-login-otp", verifyLoginOtp);

// Customer email-OTP login (send + verify)
router.post("/send-email-login-otp", sendEmailLoginOtp);
router.post("/verify-email-login-otp", verifyEmailLoginOtp);

// Helper route to ensure superadmin exists (can be called once on setup)
router.get("/ensure-superadmin", ensureSuperAdminExists);

module.exports = router;
