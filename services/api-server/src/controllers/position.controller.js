const {
  getOpenPositions
} = require("../models/position.model");

const {
  findAccountByUserId
} = require("../models/account.model");

const {
  getPositionHistory
} = require("../models/position.model");

const {
  closePosition
} = require("../services/position.service");

async function getMyPositions(req, res) {
  try {
    const account =
      await findAccountByUserId(req.user.userId);

    if (!account) {
      return res.status(404).json({
        success: false,
        message: "Trading account not found"
      });
    }

    const positions =
      await getOpenPositions(account.id);

    return res.json({
      success: true,
      data: {
        positions
      }
    });
  } catch (error) {
    console.error("Get positions error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch positions"
    });
  }
}

async function closeMyPosition(req, res) {
  try {
    const {
      positionId
    } = req.params;

    if (!positionId) {
      return res.status(400).json({
        success: false,
        message: "positionId is required"
      });
    }

    const result =
      await closePosition({
        userId: req.user.userId,
        positionId
      });

    return res.json({
      success: true,
      message: "Position closed successfully",
      data: result
    });

  } catch (error) {
    console.error(
      "Close position error:",
      error
    );

    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
}

async function getMyPositionHistory(req, res) {
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

    const positions =
      await getPositionHistory(account.id);

    return res.json({
      success: true,
      data: {
        positions
      }
    });

  } catch (error) {
    console.error(
      "Get position history error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to fetch position history"
    });
  }
}

module.exports = {
  getMyPositions,
  closeMyPosition,
  getMyPositionHistory
};