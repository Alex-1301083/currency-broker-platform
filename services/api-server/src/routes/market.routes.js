const express = require("express");

const {
  getSymbols,
  getSymbol,
  seedSymbols,
  updatePrice
} = require("../controllers/market.controller");

const {
  authenticateToken
} = require("../middleware/auth.middleware");

const router = express.Router();

router.get(
  "/symbols",
  authenticateToken,
  getSymbols
);

router.get(
  "/symbols/:symbol",
  authenticateToken,
  getSymbol
);

router.post(
  "/symbols/seed",
  authenticateToken,
  seedSymbols
);

router.patch(
  "/symbols/:symbol/price",
  authenticateToken,
  updatePrice
);

module.exports = router;