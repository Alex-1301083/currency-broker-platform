const {
  updateSymbolPrice,
  getSymbolByName,
} = require("../models/symbol.model");

const {
  processPriceTick,
} = require("./candle.service");

const {
  updateOpenPositionsForSymbol,
  checkStopLossTakeProfit,
} = require("./position.service");

const {
  publishMarketPrice,
} = require("./websocket.publisher");

const SYMBOL = "XAUUSD";

// Price movement interval
const INTERVAL_MS = 2000;

// Maximum normal movement per tick
const MAX_MOVE = 0.80;

// Provider mode
const PROVIDER_MODE = (
  process.env.PROVIDER_MODE || "demo"
).toLowerCase();

let engineTimer = null;
let currentPrice = null;

/**
 * Validate provider mode.
 */
function isDemoMode() {
  return PROVIDER_MODE === "demo";
}

function isProviderMode() {
  return PROVIDER_MODE === "provider";
}

/**
 * Generate a small random price movement.
 *
 * DEMO/SIMULATION ONLY.
 * This must never run in provider mode.
 */
function generateNextPrice(price) {
  const randomDirection =
    Math.random() > 0.5 ? 1 : -1;

  const randomMovement =
    Math.random() * MAX_MOVE;

  let nextPrice =
    price +
    randomDirection *
      randomMovement;

  // Keep XAUUSD positive
  if (nextPrice <= 0) {
    nextPrice = price;
  }

  return Number(
    nextPrice.toFixed(2)
  );
}

/**
 * Update XAUUSD demo price.
 *
 * IMPORTANT:
 * This function is only executed in DEMO mode.
 */
async function updateDemoPrice() {
  // Safety check
  if (!isDemoMode()) {
    return;
  }

  try {
    const symbol =
      await getSymbolByName(SYMBOL);

    if (!symbol) {
      console.error(
        `Demo price engine: ${SYMBOL} not found`
      );

      return;
    }

    // First run uses DB price
    if (currentPrice === null) {
      currentPrice = Number(
        symbol.bid
      );
    }

    // Generate next BID
    const nextBid =
      generateNextPrice(
        currentPrice
      );

    // Keep existing spread
    const spread =
      Number(symbol.spread) || 0.30;

    const nextAsk =
      Number(
        (
          nextBid +
          spread
        ).toFixed(2)
      );

    currentPrice =
      nextBid;

    // Update database
    const updatedSymbol =
      await updateSymbolPrice({
        symbol: SYMBOL,
        bid: nextBid,
        ask: nextAsk,
      });

    // Create/update 1-minute OHLC candle
    const candleResult =
      await processPriceTick({
        symbolId: updatedSymbol.id,
        symbol: SYMBOL,
        bid: nextBid,
        volume: 0,
        timestamp: new Date(),
      });

    console.log(
      `[CANDLE] ${SYMBOL} | ${candleResult.status} | ` +
      `O:${candleResult.candle.open.toFixed(2)} ` +
      `H:${candleResult.candle.high.toFixed(2)} ` +
      `L:${candleResult.candle.low.toFixed(2)} ` +
      `C:${candleResult.candle.close.toFixed(2)}`
    );

    if (
      candleResult.status ===
      "new_candle"
    ) {
      console.log(
        `[CANDLE SAVED] ${SYMBOL} | ` +
        `${candleResult.completedCandle.openTime} → ` +
        `O:${candleResult.completedCandle.open.toFixed(2)} ` +
        `H:${candleResult.completedCandle.high.toFixed(2)} ` +
        `L:${candleResult.completedCandle.low.toFixed(2)} ` +
        `C:${candleResult.completedCandle.close.toFixed(2)}`
      );
    }

    // Update open positions
    const positionResult =
      await updateOpenPositionsForSymbol(
        SYMBOL
      );

    // Check Stop Loss / Take Profit
    const triggeredPositions =
      await checkStopLossTakeProfit(
        SYMBOL
      );

    // Send price to WebSocket
    const published =
      publishMarketPrice({
        symbol: SYMBOL,
        bid: updatedSymbol.bid,
        ask: updatedSymbol.ask,
        spread: updatedSymbol.spread,
      });

    console.log(
      `[DEMO MARKET] ${SYMBOL} | BID: ${nextBid.toFixed(
        2
      )} | ASK: ${nextAsk.toFixed(
        2
      )} | WebSocket: ${
        published
          ? "SENT"
          : "NOT CONNECTED"
      }`
    );

    if (
      positionResult?.updatedPositions
        ?.length
    ) {
      console.log(
        `[DEMO MARKET] Updated positions: ${positionResult.updatedPositions.length}`
      );
    }

    if (
      triggeredPositions?.length
    ) {
      console.log(
        `[DEMO MARKET] SL/TP triggered: ${triggeredPositions.length}`
      );
    }
  } catch (error) {
    console.error(
      "Demo market price engine error:",
      error
    );
  }
}

/**
 * Start demo market engine.
 *
 * DEMO mode:
 *   Starts the simulated XAUUSD price engine.
 *
 * PROVIDER mode:
 *   Does NOT start the demo engine.
 *   Provider Bridge becomes the price source.
 */
function startMarketPriceEngine() {
  if (isProviderMode()) {
    console.log(
      "[MARKET ENGINE] PROVIDER mode detected."
    );

    console.log(
      "[MARKET ENGINE] Demo market price engine is DISABLED."
    );

    console.log(
      "[MARKET ENGINE] Provider Bridge is the authoritative market-price source."
    );

    return;
  }

  if (!isDemoMode()) {
    console.error(
      `[MARKET ENGINE] Unsupported PROVIDER_MODE: ${PROVIDER_MODE}`
    );

    return;
  }

  if (engineTimer) {
    console.log(
      "Demo market price engine is already running."
    );

    return;
  }

  console.log(
    `[MARKET ENGINE] Mode: ${PROVIDER_MODE}`
  );

  console.log(
    `Demo market price engine starting for ${SYMBOL}...`
  );

  // Immediately generate first update
  updateDemoPrice();

  // Continue every 2 seconds
  engineTimer = setInterval(
    updateDemoPrice,
    INTERVAL_MS
  );
}

/**
 * Stop demo market engine.
 */
function stopMarketPriceEngine() {
  if (!engineTimer) {
    return;
  }

  clearInterval(engineTimer);

  engineTimer = null;

  currentPrice = null;

  console.log(
    "Demo market price engine stopped."
  );
}

module.exports = {
  startMarketPriceEngine,
  stopMarketPriceEngine,
};