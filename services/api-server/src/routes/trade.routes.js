const express = require("express");

const {
  getMyTradeHistory
} = require("../controllers/trade.controller");

const {
  authenticateToken
} = require("../middleware/auth.middleware");

const router = express.Router();


router.get(
  "/",
  authenticateToken,
  getMyTradeHistory
);


module.exports = router;