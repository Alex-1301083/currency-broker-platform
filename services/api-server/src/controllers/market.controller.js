const {
  getAllSymbols,
  getSymbolByName,
  createSymbol,
  updateSymbolPrice,
} = require("../models/symbol.model");

const {
  updateOpenPositionsForSymbol,
  checkStopLossTakeProfit,
} = require("../services/position.service");

const { getOpenPositionsBySymbol } = require("../models/position.model");

const { findAccountsBySymbol } = require("../models/account.model");



async function getSymbols(req, res) {
  try {
    const symbols = await getAllSymbols();

    return res.json({
      success: true,
      data: symbols.map((symbol) => ({
        id: symbol.id,
        symbol: symbol.symbol,
        name: symbol.name,

        baseCurrency: symbol.base_currency,
        quoteCurrency: symbol.quote_currency,
        assetType: symbol.asset_type,

        bid: symbol.bid !== null ? Number(symbol.bid) : null,

        ask: symbol.ask !== null ? Number(symbol.ask) : null,

        spread: symbol.spread !== null ? Number(symbol.spread) : null,

        digits: Number(symbol.digits),

        contractSize: Number(symbol.contract_size),
        contract_size: Number(symbol.contract_size),
        minLot: Number(symbol.min_lot),
        min_lot: Number(symbol.min_lot),
        max_lot: Number(symbol.max_lot),
        maxLot: Number(symbol.max_lot),

        isActive: symbol.is_active,

        createdAt: symbol.created_at,
        updatedAt: symbol.updated_at,
      })),
    });
  } catch (error) {
    console.error("Get symbols error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load market symbols.",
    });
  }
}

async function getSymbol(req, res) {
  try {
    const { symbol } = req.params;

    const result = await getSymbolByName(symbol);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Symbol not found.",
      });
    }

    return res.json({
      success: true,
      data: {
        id: result.id,
        symbol: result.symbol,
        name: result.name,

        baseCurrency: result.base_currency,
        quoteCurrency: result.quote_currency,
        assetType: result.asset_type,

        bid: result.bid !== null ? Number(result.bid) : null,

        ask: result.ask !== null ? Number(result.ask) : null,

        spread: result.spread !== null ? Number(result.spread) : null,

        digits: Number(result.digits),

        contractSize: Number(result.contract_size),
        contract_size: Number(result.contract_size),
        minLot: Number(result.min_lot),
        min_lot: Number(result.min_lot),
        max_lot: Number(result.max_lot),
        maxLot: Number(result.max_lot),

        isActive: result.is_active,

        createdAt: result.created_at,
        updatedAt: result.updated_at,
      },
    });
  } catch (error) {
    console.error("Get symbol error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load symbol.",
    });
  }
}

async function seedSymbols(req, res) {
  try {
    const symbols = [
      {
        symbol: "XAUUSD",
        name: "Gold / US Dollar",
        baseCurrency: "XAU",
        quoteCurrency: "USD",
        assetType: "metal",
        bid: 3400.0,
        ask: 3400.3,
        digits: 2,
        contractSize: 100,
        minLot: 0.01,
        maxLot: 100,
      },
      {
        symbol: "EURUSD",
        name: "Euro / US Dollar",
        baseCurrency: "EUR",
        quoteCurrency: "USD",
        assetType: "forex",
        bid: 1.17,
        ask: 1.1702,
        digits: 5,
        contractSize: 100000,
        minLot: 0.01,
        maxLot: 100,
      },
      {
        symbol: "GBPUSD",
        name: "British Pound / US Dollar",
        baseCurrency: "GBP",
        quoteCurrency: "USD",
        assetType: "forex",
        bid: 1.35,
        ask: 1.3502,
        digits: 5,
        contractSize: 100000,
        minLot: 0.01,
        maxLot: 100,
      },
      {
        symbol: "BTCUSD",
        name: "Bitcoin / US Dollar",
        baseCurrency: "BTC",
        quoteCurrency: "USD",
        assetType: "crypto",
        bid: 110000,
        ask: 110050,
        digits: 2,
        contractSize: 1,
        minLot: 0.01,
        maxLot: 100,
      },
    ];

    const createdSymbols = [];

    for (const item of symbols) {
      const existing = await getSymbolByName(item.symbol);

      if (existing) {
        createdSymbols.push(existing);
        continue;
      }

      const created = await createSymbol(item);

      createdSymbols.push(created);
    }

    return res.status(201).json({
      success: true,
      message: "Symbols seeded successfully",
      data: {
        count: createdSymbols.length,
        symbols: createdSymbols,
      },
    });
  } catch (error) {
    console.error("Seed symbols error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to seed symbols",
    });
  }
}

async function updatePrice(req, res) {
  try {
    const { symbol } = req.params;
    const { bid, ask } = req.body;

    if (bid === undefined || ask === undefined) {
      return res.status(400).json({
        success: false,
        message: "bid and ask are required",
      });
    }

    const numericBid = Number(bid);
    const numericAsk = Number(ask);

    if (!Number.isFinite(numericBid) || !Number.isFinite(numericAsk)) {
      return res.status(400).json({
        success: false,
        message: "bid and ask must be valid numbers",
      });
    }

    if (numericBid <= 0 || numericAsk <= 0) {
      return res.status(400).json({
        success: false,
        message: "bid and ask must be greater than zero",
      });
    }

    if (numericAsk < numericBid) {
      return res.status(400).json({
        success: false,
        message: "ask must be greater than or equal to bid",
      });
    }

    // 1. Update market price
    const updatedSymbol = await updateSymbolPrice({
      symbol,
      bid: numericBid,
      ask: numericAsk,
    });

    const positionUpdate = await updateOpenPositionsForSymbol(symbol);

    const stopTakeResult = await checkStopLossTakeProfit(symbol);
// 4. Fetch FINAL open positions
    //    after SL / TP processing
    const finalPositions = await getOpenPositionsBySymbol(symbol);

    // 5. Fetch FINAL account values
    //    after SL / TP processing
    const finalAccounts = await findAccountsBySymbol(symbol);

    return res.json({
      success: true,
      message: "Market price updated successfully",
      data: {
        market: updatedSymbol,

        positions: finalPositions,

        accounts: finalAccounts,

        triggeredPositions: stopTakeResult.triggeredPositions,
      },
    });
  } catch (error) {
    console.error("Update price error:", error);

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

module.exports = {
  getSymbols,
  getSymbol,
  seedSymbols,
  updatePrice,
};
