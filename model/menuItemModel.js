// Backend/model/menuItemModel.js
const mongoose = require("mongoose");

const menuItemSchema = new mongoose.Schema({
  siteCode: { 
    type: String, 
    required: true,
    uppercase: true,
    trim: true
  },
  id: { type: Number, required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  category: { type: String, required: true },
  image: { type: String, required: true },
  description: { type: String, required: true },
  foodType: { type: String, enum: ["veg", "non-veg"], default: "veg" },
  spiceLevel: { type: String, enum: ["mild", "medium", "hot"], default: "medium" },
}, {
  timestamps: true
});

// Compound index for unique id per restaurant
menuItemSchema.index({ siteCode: 1, id: 1 }, { unique: true });

module.exports = mongoose.model("MenuItem", menuItemSchema);
