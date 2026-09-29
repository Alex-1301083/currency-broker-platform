const {
  findAccountByUserId
} = require("../models/account.model");

const {
  getTradeHistory
} = require("../models/trade.model");


async function getMyTradeHistory(req, res) {
  try {
    const account =
      await findAccountByUserId(
        req.user.userId
      );

    if (!account) {
      return res.status(404).json({
        success: false,
        message: "Trading account not found"
      });
    }

    const trades =
      await getTradeHistory(account.id);

    return res.json({
      success: true,
      data: {
        trades
      }
    });

  } catch (error) {
    console.error(
      "Get trade history error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to fetch trade history"
    });
  }
}


module.exports = {
  getMyTradeHistory
};