const express = require("express");

const {
  createTradingAccount,
  getMyAccount,
  getAccountById
} = require("../controllers/account.controller");

const {
  authenticateToken
} = require("../middleware/auth.middleware");

const router = express.Router();

router.post(
  "/",
  authenticateToken,
  createTradingAccount
);

router.get(
  "/me",
  authenticateToken,
  getMyAccount
);

router.get(
  "/:accountId",
  authenticateToken,
  getAccountById
);

module.exports = router;