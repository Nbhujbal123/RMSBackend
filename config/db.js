const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    console.log("Attempting to connect to MongoDB Atlas...");
    await mongoose.connect(process.env.MONGO_URI, {
      family: 4, // 👈 FORCE IPv4 (FIXES THIS ERROR)
    });
    console.log("MongoDB Atlas Connected");
  } catch (atlasError) {
    console.error("MongoDB Atlas connection failed:", atlasError.message);
    console.log("Attempting fallback to local MongoDB...");

    try {
      await mongoose.connect(process.env.FALLBACK_URI);
      console.log("Local MongoDB Connected (fallback)");
    } catch (localError) {
      console.error(
        "Local MongoDB connection also failed:",
        localError.message
      );
      console.error("Atlas error details:", atlasError);
      console.error("Local error details:", localError);
      process.exit(1);
    }
  }
};

module.exports = connectDB;
