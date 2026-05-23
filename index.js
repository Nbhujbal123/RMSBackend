// Load dotenv at the very top
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");

// Routes
const authRoutes = require("./Routes/authRoutes");
const menuRoutes = require("./Routes/menuRoutes");
const orderRoutes = require("./Routes/orderRoutes");
const billRoutes = require("./Routes/billRoutes");
const restaurantRoutes = require("./Routes/restaurantRoutes");
const superAdminRoutes = require("./Routes/superAdminRoutes");
const dashboardRoutes = require("./Routes/dashboardRoutes");

const app = express();

// Use environment PORT (Render provides this) or default to 5000
const PORT = process.env.PORT || 5000;

// CORS configuration for production deployment
// Allow requests from Render's domain and localhost for development
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176", 
  // Add Render production domain if available in environment
  ...(process.env.RENDER_EXTERNAL_URL ? [process.env.RENDER_EXTERNAL_URL] : []),
];

// More permissive CORS for production - allow any Render domain
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    // Or allow if origin is in allowed list
    // Or allow if we're in production (Render sets RENDER_EXTERNAL_URL)
    if (!origin || allowedOrigins.includes(origin) || process.env.RENDER_EXTERNAL_URL) {
      return callback(null, true);
    }
    // In development, still allow localhost origins
    if (origin.startsWith("http://localhost")) {
      return callback(null, true);
    }
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-site-code"],
};

// Apply CORS middleware
app.use(cors(corsOptions));

app.use(express.json()); // replaces body-parser

// ---------- Routes ----------
app.use("/api/auth", authRoutes);
app.use("/api/superadmin", superAdminRoutes);
app.use("/api/restaurants", restaurantRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/bills", billRoutes);

// ---------- Health Check ----------
app.get("/", (req, res) => {
  res.status(200).send("🚀 Server is running fine!");
});

// ---------- Debug (remove in production) ----------
console.log("Mongo URI Loaded:", process.env.MONGO_URI ? "Yes" : "No");
console.log("PORT:", PORT);
console.log("Environment:", process.env.NODE_ENV || "development");

// ---------- MongoDB connection helper ----------
const connectMongo = async () => {
  // Common options: short selection timeout so Atlas failures are detected quickly
  const ATLAS_OPTS = {
    family: 4,
    serverSelectionTimeoutMS: 5000,   // give Atlas 5 s instead of the 30 s default
    connectTimeoutMS: 10000,
  };
  const LOCAL_OPTS = {
    family: 4,
    serverSelectionTimeoutMS: 5000,
  };

  if (process.env.MONGO_URI) {
    try {
      await mongoose.connect(process.env.MONGO_URI, ATLAS_OPTS);
      console.log("✅ MongoDB Atlas Connected");
      return "atlas";
    } catch (atlasErr) {
      console.warn("⚠️  Atlas unreachable:", atlasErr.message);
      console.log("   → Falling back to local MongoDB...");
    }
  }

  if (process.env.FALLBACK_URI) {
    try {
      await mongoose.connect(process.env.FALLBACK_URI, LOCAL_OPTS);
      console.log("✅ Local MongoDB Connected (fallback)");
      return "local";
    } catch (localErr) {
      console.error("❌ Local MongoDB also failed:", localErr.message);
    }
  }

  console.error("❌ No MongoDB connection available.");
  console.log("   Fix options:");
  console.log("   1. Whitelist your IP in MongoDB Atlas → Network Access → Add IP");
  console.log("   2. Install & start MongoDB locally (mongod)");
  process.exit(1);
};

// ---------- Start Server with MongoDB Connection ----------
const startServer = async () => {
  const source = await connectMongo();

  // Re-connect automatically if the connection drops mid-run
  mongoose.connection.on("disconnected", () => {
    console.warn("⚠️  MongoDB disconnected — reconnecting in 5 s...");
    setTimeout(connectMongo, 5000);
  });
  mongoose.connection.on("error", (err) => {
    console.error("MongoDB connection error:", err.message);
  });

  // Fix: drop old incorrect index on menuitems if it exists
  try {
    const MenuItem = require("./model/menuItemModel");
    await MenuItem.collection.dropIndex("id_1").catch(() => {});
  } catch (_) {}

  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT} (DB: ${source})`);
    if (process.env.RENDER_EXTERNAL_URL) {
      console.log(`   Production: ${process.env.RENDER_EXTERNAL_URL}`);
    }
  });
};

// Handle uncaught exceptions gracefully
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err.message);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
});

// Start the server
startServer();
