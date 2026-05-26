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
const adminRoutes = require("./Routes/adminRoutes");
const chiefRoutes = require("./Routes/chiefRoutes");
const dashboardRoutes = require("./Routes/dashboardRoutes");

const app = express();

// Use environment PORT (Render provides this) or default to 5000
const PORT = process.env.PORT || 5000;

// CORS — allow localhost dev, Vercel deployments, and any custom domain
const corsOptions = {
  origin: function (origin, callback) {
    // No origin = curl / Postman / mobile — always allow
    if (!origin) return callback(null, true);

    // Localhost dev
    if (origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1")) {
      return callback(null, true);
    }

    // Any Vercel deployment (*.vercel.app)
    if (origin.endsWith(".vercel.app")) return callback(null, true);

    // Explicit FRONTEND_URL env var (set this on Render to your custom domain)
    if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL) {
      return callback(null, true);
    }

    callback(new Error("Not allowed by CORS: " + origin));
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
app.use("/api/admin", adminRoutes);
app.use("/api/chief", chiefRoutes);
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
  const ATLAS_OPTS = {
    serverSelectionTimeoutMS: 30000,  // 30 s — Atlas SRV + TLS can be slow on cold start
    connectTimeoutMS: 30000,
    socketTimeoutMS: 45000,
  };
  const LOCAL_OPTS = {
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000,
  };

  if (process.env.MONGO_URI) {
    try {
      console.log("⏳ Connecting to MongoDB Atlas...");
      await mongoose.connect(process.env.MONGO_URI, ATLAS_OPTS);
      console.log("✅ MongoDB Atlas Connected");
      return "atlas";
    } catch (atlasErr) {
      const msg = atlasErr.message || "";
      console.error("❌ Atlas connection failed:", msg);

      if (msg.includes("bad auth") || msg.includes("Authentication failed")) {
        console.error("   → Check MONGO_URI username/password in .env");
      } else if (msg.includes("ECONNREFUSED") || msg.includes("timed out") || msg.includes("ENOTFOUND")) {
        console.error("   → IP not whitelisted in Atlas. Go to:");
        console.error("     MongoDB Atlas → Network Access → Add IP Address → Allow from Anywhere (0.0.0.0/0)");
      } else if (msg.includes("Cluster is paused") || msg.includes("paused")) {
        console.error("   → Your Atlas cluster is paused. Log in to atlas.mongodb.com and resume it.");
      }

      console.log("   → Trying local MongoDB fallback...");
    }
  }

  if (process.env.FALLBACK_URI) {
    try {
      console.log("⏳ Connecting to local MongoDB...");
      await mongoose.connect(process.env.FALLBACK_URI, LOCAL_OPTS);
      console.log("✅ Local MongoDB Connected (fallback)");
      return "local";
    } catch (localErr) {
      console.error("❌ Local MongoDB also failed:", localErr.message);
      console.error("   → Make sure MongoDB is installed and running: mongod --dbpath /data/db");
    }
  }

  console.error("\n❌ No MongoDB connection available. Server cannot start.");
  console.error("   Fix: Go to atlas.mongodb.com → Network Access → Add 0.0.0.0/0");
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
