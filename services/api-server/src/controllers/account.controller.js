const {
  findAccountByUserId,
  findAccountById,
  createAccount,
} = require("../models/account.model");

const {
  evaluateMarginCall,
} = require("../services/risk.service");

function generateAccountNumber() {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(1000 + Math.random() * 9000);

  return `TRX${timestamp}${random}`;
}

async function createTradingAccount(req, res) {
  try {
    const userId = req.user.userId;

    // Check if user already has an account
    const existingAccount =
      await findAccountByUserId(userId);

    if (existingAccount) {
      return res.status(409).json({
        success: false,
        message: "Trading account already exists",
        data: {
          account: existingAccount,
        },
      });
    }

    const accountNumber =
      generateAccountNumber();

    const account =
      await createAccount({
        userId,
        accountNumber,
        currency: "USD",
        initialBalance: 10000,
        leverage: 100,
      });

    return res.status(201).json({
      success: true,
      message:
        "Trading account created successfully",
      data: {
        account,
      },
    });
  } catch (error) {
    console.error(
      "Create account error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to create trading account",
    });
  }
}

async function getMyAccount(req, res) {
  try {
    const userId = req.user.userId;

    const account =
      await findAccountByUserId(userId);

    if (!account) {
      return res.status(404).json({
        success: false,
        message:
          "Trading account not found",
      });
    }

    // Calculate margin call status
    const risk =
      evaluateMarginCall({
        equity: account.equity,
        margin: account.margin,
      });

    return res.json({
      success: true,
      data: {
        account,
        risk,
      },
    });
  } catch (error) {
    console.error(
      "Get account error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to fetch trading account",
    });
  }
}

async function getAccountById(req, res) {
  try {
    const userId = req.user.userId;
    const { accountId } = req.params;

    const account =
      await findAccountById(
        accountId,
        userId
      );

    if (!account) {
      return res.status(404).json({
        success: false,
        message:
          "Trading account not found",
      });
    }

    // Calculate margin call status
    const risk =
      evaluateMarginCall({
        equity: account.equity,
        margin: account.margin,
      });

    return res.json({
      success: true,
      data: {
        account,
        risk,
      },
    });
  } catch (error) {
    console.error(
      "Get account by ID error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to fetch trading account",
    });
  }
}

module.exports = {
  createTradingAccount,
  getMyAccount,
  getAccountById,
};