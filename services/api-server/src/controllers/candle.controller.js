const {
  getHistoricalCandles,
} = require("../services/candle.service");

async function getCandles(req, res) {
  try {
    const { symbol } = req.params;

    const {
      timeframe = "1m",
      limit = 200,
    } = req.query;

    if (!symbol) {
      return res.status(400).json({
        success: false,
        message: "Symbol is required",
      });
    }

    const candles =
      await getHistoricalCandles({
        symbol:
          symbol.toUpperCase(),

        timeframe,

        limit,
      });

    return res.json({
      success: true,

      data: {
        symbol:
          symbol.toUpperCase(),

        timeframe,

        candles,
      },
    });
  } catch (error) {
    console.error(
      "Get candles error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to fetch historical candles",
    });
  }
}

module.exports = {
  getCandles,
};