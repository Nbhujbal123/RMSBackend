// Backend/controllers/authController.js
const User = require("../model/userModel");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { google } = require("googleapis");

// 🔹 Generate random 6-digit OTP
const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

// 🔹 Build HTML OTP email body
const buildOtpHtml = (otp, restaurantName) => `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:30px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#FF6A00,#FFA500);padding:28px 32px;text-align:center;">
              <h1 style="color:#fff;margin:0;font-size:22px;">🍽️ ${restaurantName}</h1>
              <p style="color:rgba(255,255,255,0.9);margin:6px 0 0;font-size:14px;">Login Verification</p>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 32px;text-align:center;">
              <p style="color:#555;font-size:15px;margin:0 0 24px;">
                Use the code below to complete your login. It expires in <strong>10 minutes</strong>.
              </p>
              <div style="display:inline-block;background:#fff7f0;border:2px dashed #FF6A00;
                          border-radius:12px;padding:18px 40px;margin:0 0 24px;">
                <span style="font-size:36px;font-weight:700;letter-spacing:10px;color:#FF6A00;">
                  ${otp}
                </span>
              </div>
              <p style="color:#999;font-size:13px;margin:0;">
                If you did not request this, please ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f9fafb;padding:16px 32px;text-align:center;border-top:1px solid #eee;">
              <p style="color:#bbb;font-size:12px;margin:0;">
                © ${new Date().getFullYear()} ${restaurantName} · Powered by RestoM
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

// 🔹 Send email via Gmail REST API (HTTPS port 443 — not blocked by any host)
const sendOtpEmail = async (toEmail, otp, subject, restaurantName = "Restaurant") => {
  const EMAIL_USER          = (process.env.EMAIL_USER          || "").trim();
  const GMAIL_CLIENT_ID     = (process.env.GMAIL_CLIENT_ID     || "").trim();
  const GMAIL_CLIENT_SECRET = (process.env.GMAIL_CLIENT_SECRET || "").trim();
  const GMAIL_REFRESH_TOKEN = (process.env.GMAIL_REFRESH_TOKEN || "").trim();

  if (!EMAIL_USER || !GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
    throw new Error(
      "Missing Gmail API credentials. Set EMAIL_USER, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN in environment variables."
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET,
    "https://developers.google.com/oauthplayground"
  );
  oauth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const html = buildOtpHtml(otp, restaurantName);
  const text = `Your OTP is ${otp}. It will expire in 10 minutes.`;

  // Build RFC-2822 MIME message
  const mime = [
    `From: "${restaurantName}" <${EMAIL_USER}>`,
    `To: ${toEmail}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "",
    html,
  ].join("\r\n");

  const raw = Buffer.from(mime)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
  return { sent: true };
};

// ========== SIGNUP ==========
exports.signup = async (req, res) => {
  try {
    const { name, email, phone, mobile, password, siteCode, role } = req.body;
    const normalizedEmail = (email || "").trim().toLowerCase();
    const normalizedMobile = (phone || mobile || "").toString().trim();
    const normalizedSiteCode = (siteCode || "").toString().toUpperCase().trim();

    // Validation
    if (!name || !normalizedEmail || !normalizedMobile || !password || !normalizedSiteCode) {
      return res.status(400).json({ message: "All fields are required including siteCode" });
    }
    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });
    }
    const emailRegex = /\S+@\S+\.\S+/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    // Verify restaurant exists
    const Restaurant = require("../model/restaurantModel");
    const restaurant = await Restaurant.findOne({ siteCode: normalizedSiteCode });
    if (!restaurant) {
      return res.status(404).json({ message: "Invalid site code. Restaurant not found." });
    }
    if (restaurant.status !== 'ACTIVE') {
      return res.status(403).json({ message: "This restaurant is currently inactive. Please contact the Super Admin to activate your restaurant." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = generateOTP();

    // Check user exists for this siteCode + email combination
    let user = await User.findOne({ siteCode: normalizedSiteCode, email: normalizedEmail });

    if (user && user.isVerified) {
      return res.status(409).json({ message: "Email already registered for this restaurant" });
    }

    // Determine role - only allow 'customer' by default, admin/staff must be created by superadmin
    const validRoles = ["customer", "admin", "staff"];
    const userRole = (role && validRoles.includes(role)) ? role : "customer";

    if (!user) {
      user = new User({
        siteCode: normalizedSiteCode,
        name,
        email: normalizedEmail,
        mobile: normalizedMobile,
        password: hashedPassword,
        role: userRole,
        otp,
        otpExpires: Date.now() + 10 * 60 * 1000,
      });
    } else {
      // Existing but unverified user -> refresh details & OTP
      user.name = name;
      user.mobile = normalizedMobile;
      user.password = hashedPassword;
      user.role = userRole;
      user.otp = otp;
      user.otpExpires = Date.now() + 10 * 60 * 1000;
    }

    await user.save();

    try {
      await sendOtpEmail(normalizedEmail, otp, `Verify your email - ${restaurant.name}`, restaurant.name);
      return res.status(201).json({ message: "OTP sent to email" });
    } catch (emailError) {
      console.error("Signup OTP email send failed:", emailError.message);
      return res.status(502).json({
        message:
          "Signup created, but OTP email could not be sent. Please check mail configuration and try again.",
      });
    }
  } catch (error) {
    console.error("Signup error:", error.message);
    res.status(500).json({ message: "Signup failed due to server error" });
  }
};

// ========== VERIFY OTP ==========
exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp, siteCode } = req.body;
    const normalizedEmail = (email || "").trim().toLowerCase();
    const normalizedOtp = (otp || "").toString().trim();
    const normalizedSiteCode = (siteCode || "").toString().toUpperCase().trim();

    if (!normalizedSiteCode) {
      return res.status(400).json({ message: "Site code is required" });
    }

    const user = await User.findOne({ siteCode: normalizedSiteCode, email: normalizedEmail });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.otp !== normalizedOtp)
      return res.status(400).json({ message: "Invalid OTP" });
    if (user.otpExpires < Date.now())
      return res.status(400).json({ message: "OTP expired" });

    user.isVerified = true;
    user.otp = null;
    user.otpExpires = null;
    await user.save();

    res.json({ message: "Email verified successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "OTP verification failed", error: error.message });
  }
};

// ========== LOGIN ==========
// Helper function to ensure superadmin exists
exports.ensureSuperAdminExists = async () => {
  try {
    const superAdminEmail = "superadmin@restom.com";
    
    // Check if superadmin already exists
    let superAdmin = await User.findOne({ email: superAdminEmail, role: "superadmin" });
    
    if (!superAdmin) {
      console.log("Creating superadmin account...");
      
      // Hash the password with bcrypt
      const hashedPassword = await bcrypt.hash("123456", 10);
      
      superAdmin = new User({
        siteCode: "SUPERADMIN",
        name: "Super Admin",
        email: superAdminEmail,
        mobile: "0000000000",
        password: hashedPassword,
        role: "superadmin",
        isVerified: true,
        otp: null,
        otpExpires: null,
      });
      
      await superAdmin.save();
      console.log("Superadmin created successfully!");
    }
    
    return superAdmin;
  } catch (error) {
    console.error("Error ensuring superadmin exists:", error.message);
    throw error;
  }
};

// ========== LOGIN ==========
exports.login = async (req, res) => {
  try {
    const { email, password, siteCode } = req.body;

    const normalizedEmail = (email || "").trim().toLowerCase();
    const normalizedSiteCode = (siteCode || "").toString().toUpperCase().trim();

    // Validate required fields
    if (!normalizedEmail) {
      return res.status(400).json({ message: "Email is required" });
    }
    if (!password) {
      return res.status(400).json({ message: "Password is required" });
    }

    let user;

    // 🔹 Determine login type based on email or siteCode
    // Check if this is a superadmin login (by email or explicit flag)
    const isSuperAdminEmail = normalizedEmail === "superadmin@restom.com";
    
    // If siteCode is SUPERADMIN, treat as superadmin login
    if (normalizedSiteCode === "SUPERADMIN" || isSuperAdminEmail) {
      // Ensure superadmin exists
      try {
        await exports.ensureSuperAdminExists();
      } catch (superAdminError) {
        console.error("Error creating superadmin:", superAdminError);
        return res.status(500).json({ 
          message: "Failed to initialize superadmin account" 
        });
      }
      
      // Find superadmin by email
      user = await User.findOne({
        email: normalizedEmail,
        role: "superadmin"
      });

      if (!user) {
        return res.status(404).json({ 
          message: "Superadmin account not found" 
        });
      }

      // Validate password using bcrypt.compare
      const isMatch = await bcrypt.compare(password, user.password);

      if (!isMatch) {
        return res.status(400).json({ 
          message: "Invalid password" 
        });
      }

      // Generate JWT token
      const token = jwt.sign(
        {
          id: user._id,
          role: user.role,
          siteCode: user.siteCode
        },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      return res.json({
        message: "Superadmin login successful",
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          siteCode: user.siteCode
        }
      });
    }

    // 🔹 Restaurant user login - siteCode is optional for admin/staff, required for customers
    // If no siteCode provided, try to find user by email and use their siteCode
    let userSiteCode = normalizedSiteCode;
    
    if (!normalizedSiteCode) {
      // Try to find user by email only (for admin/staff login)
      const userByEmail = await User.findOne({ email: normalizedEmail });
      
      if (!userByEmail) {
        return res.status(404).json({
          message: "User not found. Please check your email."
        });
      }
      
      // Use the user's stored siteCode
      userSiteCode = userByEmail.siteCode;
      
      // Only allow admin/staff to login without siteCode
      if (userByEmail.role === 'customer') {
        return res.status(400).json({ 
          message: "Site code is required for customer login" 
        });
      }
    }

    // Find user by email and siteCode (or just email if siteCode not provided)
    user = await User.findOne({
      email: normalizedEmail,
      siteCode: userSiteCode
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found. Please check your email and site code."
      });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        message: "Email not verified. Please verify your email first."
      });
    }

    // Validate password using bcrypt.compare
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({
        message: "Invalid password"
      });
    }

    // Get restaurant details
    const Restaurant = require("../model/restaurantModel");
    const restaurant = await Restaurant.findOne({
      siteCode: userSiteCode
    });

    if (!restaurant) {
      return res.status(404).json({
        message: "Restaurant not found for this site code"
      });
    }

    if (restaurant.status !== 'ACTIVE') {
      return res.status(403).json({
        message: "This restaurant is currently inactive. Please contact the Super Admin to activate your restaurant."
      });
    }

    // For customers: send email OTP instead of issuing token directly
    if (user.role === 'customer') {
      const otp = generateOTP();
      user.otp = otp;
      user.otpExpires = Date.now() + 10 * 60 * 1000;
      await user.save();

      try {
        await sendOtpEmail(
          user.email,
          otp,
          `Your login OTP – ${restaurant.name}`,
          restaurant.name
        );
      } catch (emailErr) {
        console.error("Email OTP send failed:", emailErr.message);
        return res.status(502).json({
          message: "Could not send OTP email. Please check mail configuration."
        });
      }

      return res.json({
        otpSent: true,
        message: "OTP sent to your email. Please verify to complete login."
      });
    }

    // Admin / Staff: issue token directly (no OTP needed)
    const token = jwt.sign(
      {
        id: user._id,
        siteCode: user.siteCode,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.mobile,
        siteCode: user.siteCode,
        role: user.role
      },
      restaurant: restaurant
        ? {
            name: restaurant.name,
            siteCode: restaurant.siteCode
          }
        : null
    });

  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      message: "Login failed due to server error",
      error: error.message
    });
  }
};

// ========== SEND EMAIL LOGIN OTP (name + email — no password) ==========
exports.sendEmailLoginOtp = async (req, res) => {
  try {
    const { name, email, siteCode } = req.body;
    const normalizedName  = (name  || "").trim();
    const normalizedEmail = (email || "").trim().toLowerCase();
    const normalizedSiteCode = (siteCode || "").toString().toUpperCase().trim();

    if (!normalizedName) {
      return res.status(400).json({ message: "Name is required" });
    }
    const emailRegex = /\S+@\S+\.\S+/;
    if (!normalizedEmail || !emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ message: "Valid email address is required" });
    }
    if (!normalizedSiteCode) {
      return res.status(400).json({ message: "Site code is required" });
    }

    // Validate restaurant
    const Restaurant = require("../model/restaurantModel");
    const restaurant = await Restaurant.findOne({ siteCode: normalizedSiteCode });
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found for this site code" });
    }
    if (restaurant.status !== "ACTIVE") {
      return res.status(403).json({ message: "This restaurant is currently inactive" });
    }

    // Find or auto-create customer by email + siteCode
    let user = await User.findOne({ email: normalizedEmail, siteCode: normalizedSiteCode, role: "customer" });

    if (!user) {
      const autoPassword = await bcrypt.hash(Math.random().toString(36), 10);
      user = new User({
        siteCode: normalizedSiteCode,
        name: normalizedName,
        email: normalizedEmail,
        mobile: "0000000000",
        password: autoPassword,
        role: "customer",
        isVerified: false,
      });
    } else {
      user.name = normalizedName;
    }

    const otp = generateOTP();
    user.otp = otp;
    user.otpExpires = Date.now() + 10 * 60 * 1000;
    await user.save();

    try {
      await sendOtpEmail(normalizedEmail, otp, `Your login OTP – ${restaurant.name}`, restaurant.name);
      console.log(`[OTP] Email sent to ${normalizedEmail}, code: ${otp}`);
    } catch (emailErr) {
      console.error("Email OTP send failed:", emailErr.code, emailErr.message);
      // EAUTH = wrong App Password / 2FA not enabled
      const hint =
        emailErr.code === "EAUTH"
          ? "Gmail authentication failed. Regenerate the App Password at myaccount.google.com/apppasswords."
          : emailErr.message;
      return res.status(502).json({ message: `Could not send OTP email: ${hint}` });
    }

    return res.json({ otpSent: true, message: "OTP sent to your email" });
  } catch (error) {
    console.error("Send email login OTP error:", error);
    res.status(500).json({ message: "Failed to send OTP", error: error.message });
  }
};

// ========== VERIFY EMAIL LOGIN OTP ==========
exports.verifyEmailLoginOtp = async (req, res) => {
  try {
    const { email, siteCode, otp } = req.body;
    const normalizedEmail = (email || "").trim().toLowerCase();
    const normalizedSiteCode = (siteCode || "").toString().toUpperCase().trim();
    const normalizedOtp = (otp || "").toString().trim();

    if (!normalizedEmail || !normalizedSiteCode || !normalizedOtp) {
      return res.status(400).json({ message: "Email, site code, and OTP are required" });
    }

    const user = await User.findOne({ email: normalizedEmail, siteCode: normalizedSiteCode });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.otp !== normalizedOtp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }
    if (!user.otpExpires || user.otpExpires < Date.now()) {
      return res.status(400).json({ message: "OTP has expired. Please request a new one." });
    }

    user.isVerified = true;
    user.otp = null;
    user.otpExpires = null;
    await user.save();

    const token = jwt.sign(
      { id: user._id, siteCode: user.siteCode, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const Restaurant = require("../model/restaurantModel");
    const restaurant = await Restaurant.findOne({ siteCode: normalizedSiteCode });

    return res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.mobile,
        siteCode: user.siteCode,
        role: user.role,
      },
      restaurant: restaurant ? { name: restaurant.name, siteCode: restaurant.siteCode } : null
    });
  } catch (error) {
    console.error("Verify email login OTP error:", error);
    res.status(500).json({ message: "OTP verification failed", error: error.message });
  }
};

// ========== FORGOT PASSWORD ==========
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const normalizedEmail = (email || "").trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(404).json({ message: "User not found" });

    const otp = generateOTP();
    user.otp = otp;
    user.otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();

    try {
      await sendOtpEmail(normalizedEmail, otp, "Reset your password - RestoM");
      res.json({ message: "OTP sent to email" });
    } catch (emailError) {
      console.error("Forgot password OTP email send failed:", emailError.message);
      res.status(502).json({
        message: "Failed to send OTP email. Please verify mail configuration.",
      });
    }
  } catch (error) {
    res
      .status(500)
      .json({ message: "Forgot password failed", error: error.message });
  }
};

// ========== VERIFY RESET OTP ==========
exports.verifyResetOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const normalizedEmail = (email || "").trim().toLowerCase();
    const normalizedOtp = (otp || "").toString().trim();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.otp !== normalizedOtp)
      return res.status(400).json({ message: "Invalid OTP" });
    if (user.otpExpires < Date.now())
      return res.status(400).json({ message: "OTP expired" });

    // Don't clear OTP yet, will clear after password reset
    res.json({ message: "OTP verified" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "OTP verification failed", error: error.message });
  }
};

// ========== RESET PASSWORD ==========
exports.resetPassword = async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    const normalizedEmail = (email || "").trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.otp = null;
    user.otpExpires = null;
    await user.save();

    res.json({ message: "Password reset successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Password reset failed", error: error.message });
  }
};

// ========== SEND LOGIN OTP (Phone-based customer login — auto-registers new customers) ==========
exports.sendLoginOtp = async (req, res) => {
  try {
    const { name, phone, siteCode } = req.body;
    const normalizedName = (name || "").trim();
    const normalizedPhone = (phone || "").toString().replace(/\s/g, "").trim();
    const normalizedSiteCode = (siteCode || "").toString().toUpperCase().trim();

    if (!normalizedName) {
      return res.status(400).json({ message: "Name is required" });
    }
    if (!normalizedPhone || normalizedPhone.length !== 10) {
      return res.status(400).json({ message: "Valid 10-digit phone number is required" });
    }
    if (!normalizedSiteCode) {
      return res.status(400).json({ message: "Site code is required" });
    }

    // Validate restaurant
    const Restaurant = require("../model/restaurantModel");
    const restaurant = await Restaurant.findOne({ siteCode: normalizedSiteCode });
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found for this site code" });
    }
    if (restaurant.status !== "ACTIVE") {
      return res.status(403).json({ message: "This restaurant is currently inactive" });
    }

    // Find or auto-create customer
    let user = await User.findOne({
      mobile: normalizedPhone,
      siteCode: normalizedSiteCode,
      role: "customer",
    });

    if (!user) {
      // Auto-register: generate a placeholder email (phone-based, unique per siteCode)
      const autoEmail = `${normalizedPhone}@${normalizedSiteCode.toLowerCase()}.customer`;
      const autoPassword = await bcrypt.hash(Math.random().toString(36), 10);
      user = new User({
        siteCode: normalizedSiteCode,
        name: normalizedName,
        email: autoEmail,
        mobile: normalizedPhone,
        password: autoPassword,
        role: "customer",
        isVerified: false,
      });
    } else {
      // Update name in case it changed
      user.name = normalizedName;
    }

    // Generate OTP
    const otp = generateOTP();
    user.otp = otp;
    user.otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();

    // Try Twilio SMS if configured
    const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
    const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
    const TWILIO_PHONE = process.env.TWILIO_PHONE;

    let smsSent = false;
    if (TWILIO_SID && TWILIO_TOKEN && TWILIO_PHONE) {
      try {
        const twilio = require("twilio")(TWILIO_SID, TWILIO_TOKEN);
        await twilio.messages.create({
          body: `Your ${restaurant.name} login OTP is: ${otp}. Valid for 10 minutes.`,
          from: TWILIO_PHONE,
          to: `+91${normalizedPhone}`,
        });
        smsSent = true;
      } catch (smsError) {
        console.error("Twilio SMS failed:", smsError.message);
      }
    }

    if (!smsSent) {
      console.log(`\n=============================`);
      console.log(`[OTP] Phone: ${normalizedPhone}`);
      console.log(`[OTP] Code : ${otp}`);
      console.log(`==============================\n`);
    }

    return res.json({ message: "OTP sent successfully" });
  } catch (error) {
    console.error("Send login OTP error:", error.message);
    res.status(500).json({ message: "Failed to send OTP", error: error.message });
  }
};

// ========== VERIFY LOGIN OTP (Phone-based customer login) ==========
exports.verifyLoginOtp = async (req, res) => {
  try {
    const { phone, siteCode, otp } = req.body;
    const normalizedPhone = (phone || "").toString().replace(/\s/g, "").trim();
    const normalizedSiteCode = (siteCode || "").toString().toUpperCase().trim();
    const normalizedOtp = (otp || "").toString().trim();

    if (!normalizedPhone || !normalizedSiteCode || !normalizedOtp) {
      return res.status(400).json({ message: "Phone, site code, and OTP are required" });
    }

    const user = await User.findOne({
      mobile: normalizedPhone,
      siteCode: normalizedSiteCode,
      role: "customer",
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.otp !== normalizedOtp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }
    if (!user.otpExpires || user.otpExpires < Date.now()) {
      return res.status(400).json({ message: "OTP has expired. Please request a new one." });
    }

    // Mark verified + clear OTP
    user.isVerified = true;
    user.otp = null;
    user.otpExpires = null;
    await user.save();

    // Generate JWT
    const token = jwt.sign(
      { id: user._id, siteCode: user.siteCode, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.mobile,
        siteCode: user.siteCode,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Verify login OTP error:", error.message);
    res.status(500).json({ message: "OTP verification failed", error: error.message });
  }
};

// ========== CREATE SUPERADMIN (Setup only) ==========
exports.createSuperAdmin = async (req, res) => {
  try {
    const { name, email, mobile, password, superAdminKey } = req.body;
    
    // Verify super admin key (should be in env)
    const EXPECTED_KEY = process.env.SUPERADMIN_KEY || "SUPERADMIN2024";
    if (superAdminKey !== EXPECTED_KEY) {
      return res.status(403).json({ message: "Invalid superadmin key" });
    }

    const normalizedEmail = (email || "").trim().toLowerCase();
    const normalizedMobile = (mobile || "").toString().trim();

    if (!name || !normalizedEmail || !normalizedMobile || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Check if superadmin already exists
    const existingSuperAdmin = await User.findOne({ role: "superadmin" });
    if (existingSuperAdmin) {
      return res.status(409).json({ message: "Superadmin already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = generateOTP();

    // Create superadmin user (no siteCode needed)
    const superAdmin = new User({
      siteCode: "SUPERADMIN", // Special siteCode for superadmin
      name,
      email: normalizedEmail,
      mobile: normalizedMobile,
      password: hashedPassword,
      role: "superadmin",
      isVerified: true,
      otp,
      otpExpires: Date.now() + 10 * 60 * 1000,
    });

    await superAdmin.save();

    // Generate token
    const token = jwt.sign({ 
      id: superAdmin._id,
      siteCode: "SUPERADMIN",
      role: "superadmin" 
    }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.status(201).json({
      message: "Superadmin created successfully",
      token,
      user: {
        id: superAdmin._id.toString(),
        name: superAdmin.name,
        email: superAdmin.email,
        role: superAdmin.role
      }
    });
  } catch (error) {
    console.error("Create superadmin error:", error);
    res.status(500).json({ message: "Failed to create superadmin", error: error.message });
  }
};

// ========== TEST EMAIL (debug — call GET /api/auth/test-email?to=you@example.com) ==========
exports.testEmail = async (req, res) => {
  const to = req.query.to;
  if (!to) return res.status(400).json({ message: "Pass ?to=your@email.com" });

  const EMAIL_USER          = (process.env.EMAIL_USER          || "").trim();
  const GMAIL_CLIENT_ID     = (process.env.GMAIL_CLIENT_ID     || "").trim();
  const GMAIL_CLIENT_SECRET = (process.env.GMAIL_CLIENT_SECRET || "").trim();
  const GMAIL_REFRESH_TOKEN = (process.env.GMAIL_REFRESH_TOKEN || "").trim();

  const missing = ["EMAIL_USER","GMAIL_CLIENT_ID","GMAIL_CLIENT_SECRET","GMAIL_REFRESH_TOKEN"]
    .filter(k => !process.env[k]);
  if (missing.length) {
    return res.status(500).json({ ok: false, error: `Missing env vars: ${missing.join(", ")}` });
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET,
      "https://developers.google.com/oauthplayground"
    );
    oauth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    const mime = [
      `From: "RestoM" <${EMAIL_USER}>`,
      `To: ${to}`,
      "Subject: RestoM — Email test",
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "",
      "Gmail API is working correctly on Render.",
    ].join("\r\n");

    const raw = Buffer.from(mime).toString("base64")
      .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");

    await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
    return res.json({ ok: true, message: `Test email sent to ${to}` });
  } catch (err) {
    console.error("Test email error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
