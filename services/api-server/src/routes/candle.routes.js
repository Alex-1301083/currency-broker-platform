const express = require("express");

const {
  getCandles,
} = require("../controllers/candle.controller");

const {
  authenticateToken,
} = require("../middleware/auth.middleware");

const router =
  express.Router();

router.get(
  "/:symbol",
  authenticateToken,
  getCandles
);

module.exports = router;