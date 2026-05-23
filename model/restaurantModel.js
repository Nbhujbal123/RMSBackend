// Backend/model/restaurantModel.js
const mongoose = require("mongoose");

const restaurantSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true 
  },
  siteCode: { 
    type: String, 
    required: true, 
    unique: true,
    uppercase: true,
    trim: true
  },
  email: { 
    type: String, 
    required: true 
  },
  phone: { 
    type: String, 
    required: true 
  },
  status: { 
    type: String, 
    enum: ["ACTIVE", "INACTIVE", "SUSPENDED"], 
    default: "ACTIVE" 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Index for faster queries
restaurantSchema.index({ siteCode: 1 });

module.exports = mongoose.model("Restaurant", restaurantSchema);
