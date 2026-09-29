const express = require("express");

const router = express.Router();

const {
  placeMarketOrder,
  getMyOrderHistory,
} = require("../controllers/order.controller");

const {
  authenticateToken,
} = require("../middleware/auth.middleware");

const {
  validateIdempotencyKey,
} = require("../middleware/idempotency.middleware");

const {
  orderLimiter,
} = require("../middleware/rate-limit.middleware");

router.post(
  "/",
  authenticateToken,
  orderLimiter,
  validateIdempotencyKey,
  placeMarketOrder,
);

router.get(
  "/",
  authenticateToken,
  getMyOrderHistory,
);

module.exports = router;