// Backend/Routes/adminRoutes.js
const express = require("express");
const router = express.Router();
const { adminMiddleware } = require("../middleware/superAdminMiddleware");
const { createChief, listChiefs } = require("../controllers/adminController");

router.use(adminMiddleware);

router.post("/create-chief", createChief);
router.get("/chiefs", listChiefs);

module.exports = router;
