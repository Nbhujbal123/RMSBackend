// Backend/model/userModel.js
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  siteCode: { 
    type: String, 
    required: function() { return this.role !== 'superadmin'; },
    uppercase: true,
    trim: true
  },
  name: { type: String, required: true },
  email: { type: String, required: true },
  mobile: { type: String, required: true },
  password: { type: String, required: true },
  role: { 
    type: String, 
    enum: ["superadmin", "admin", "staff", "customer"], 
    default: "customer" 
  },
  otp: { type: String },
  otpExpires: { type: Date },
  isVerified: { type: Boolean, default: false },
}, {
  timestamps: true
});

// Compound index for unique email per restaurant (only when siteCode exists)
userSchema.index({ siteCode: 1, email: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("User", userSchema);
