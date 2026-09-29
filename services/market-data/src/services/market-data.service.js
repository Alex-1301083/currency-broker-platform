const { pool } = require("../config/database");

const {
  updateOpenPositionsForSymbol,
  checkStopLossTakeProfit,
} = require("../../../api-server/src/services/position.service");

const WebSocket = require("ws");
const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "../../../../.env"),
});

const WS_URL =
  process.env.MARKET_DATA_WS_URL ||
  "ws://localhost:5001";

const MARKET_DATA_WS_SECRET =
  process.env.MARKET_DATA_WS_SECRET;

if (!MARKET_DATA_WS_SECRET) {
  throw new Error(
    "MARKET_DATA_WS_SECRET is required for market-data WebSocket authentication",
  );
}

let socket = null;
let reconnectTimer = null;

/**
 * Connect Market Data Service to WebSocket Server
 */
function connectWebSocket() {
  if (
    socket &&
    (
      socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING
    )
  ) {
    return;
  }

  console.log(
    `[MARKET DATA] Connecting to WebSocket: ${WS_URL}`,
  );

  socket = new WebSocket(
    WS_URL,
    `market-data.${MARKET_DATA_WS_SECRET}`,
  );

  socket.on("open", () => {
    console.log(
      "[MARKET DATA] Authenticated WebSocket publisher connected.",
    );

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  });

  socket.on("message", (message) => {
    try {
      const data = JSON.parse(
        message.toString(),
      );

      console.log(
        "[MARKET DATA] WebSocket server message:",
        data,
      );
    } catch (error) {
      console.error(
        "[MARKET DATA] Invalid WebSocket server message:",
        error.message,
      );
    }
  });

  socket.on("error", (error) => {
    console.error(
      "[MARKET DATA] WebSocket publisher error:",
      error.message,
    );
  });

  socket.on("close", (code, reason) => {
    console.log(
      `[MARKET DATA] WebSocket publisher disconnected. code=${code} reason=${reason.toString()}`,
    );

    socket = null;

    scheduleReconnect();
  });
}

/**
 * Schedule WebSocket reconnect
 */
function scheduleReconnect() {
  if (reconnectTimer) {
    return;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectWebSocket();
  }, 3000);
}

/**
 * Publish market price through WebSocket
 */
function publishMarketPrice(price) {
  if (
    !socket ||
    socket.readyState !== WebSocket.OPEN
  ) {
    console.warn(
      "[MARKET DATA] WebSocket not connected. Price not published.",
    );

    return;
  }

  const message = {
    type: "market_price",
    data: {
      symbol: price.symbol,
      bid: Number(price.bid),
      ask: Number(price.ask),
      spread: Number(price.spread),
      timestamp: price.timestamp,
    },
  };

  socket.send(JSON.stringify(message));

  console.log(
    "[MARKET DATA] Published market price:",
    message,
  );
}

connectWebSocket();

/**
 * Update market price
 *
 * Flow:
 *
 * Provider Bridge
 *       ↓
 * updateMarketPrice()
 *       ↓
 * symbols table
 *       ↓
 * open positions P/L
 *       ↓
 * account equity/free margin
 *       ↓
 * SL/TP check
 *       ↓
 * WebSocket
 */
async function updateMarketPrice({
  symbol,
  bid,
  ask,
  spread,
  timestamp,
}) {
  if (!symbol) {
    throw new Error(
      "Market price symbol is required.",
    );
  }

  if (
    !Number.isFinite(Number(bid)) ||
    !Number.isFinite(Number(ask))
  ) {
    throw new Error(
      `Invalid market price for ${symbol}.`,
    );
  }

  const normalizedSymbol =
    String(symbol).toUpperCase();

  const normalizedBid = Number(bid);
  const normalizedAsk = Number(ask);

  const normalizedSpread =
    Number.isFinite(Number(spread))
      ? Number(spread)
      : normalizedAsk - normalizedBid;

  /**
   * 1. Update symbol market price
   */
  const result = await pool.query(
    `
    UPDATE symbols
    SET
      bid = $1,
      ask = $2,
      spread = $3,
      updated_at = NOW()
    WHERE symbol = $4
      AND is_active = TRUE
    RETURNING
      id,
      symbol,
      bid,
      ask,
      spread,
      updated_at
    `,
    [
      normalizedBid,
      normalizedAsk,
      normalizedSpread,
      normalizedSymbol,
    ],
  );

  if (result.rows.length === 0) {
    throw new Error(
      `Active symbol not found: ${normalizedSymbol}`,
    );
  }

  const updatedSymbol = result.rows[0];

  const marketPrice = {
    symbol: updatedSymbol.symbol,
    bid: Number(updatedSymbol.bid),
    ask: Number(updatedSymbol.ask),
    spread: Number(updatedSymbol.spread),
    timestamp:
      timestamp || new Date().toISOString(),
  };

  console.log(
    "[MARKET DATA] Price updated:",
    marketPrice,
  );

  /**
   * 2. Update all open positions
   *
   * This recalculates:
   * - current_price
   * - unrealized_pnl
   * - account equity
   * - account free margin
   */
  try {
    const positionResult =
      await updateOpenPositionsForSymbol(
        normalizedSymbol,
      );

    console.log(
      "[MARKET DATA] Open positions updated:",
      positionResult,
    );
  } catch (error) {
    console.error(
      "[MARKET DATA] Position update failed:",
      error.message,
    );

    throw error;
  }

  /**
   * 3. Check Stop Loss / Take Profit
   */
  try {
    const stopTakeResult =
      await checkStopLossTakeProfit(
        normalizedSymbol,
      );

    if (stopTakeResult) {
      console.log(
        "[MARKET DATA] SL/TP check completed:",
        stopTakeResult,
      );
    }
  } catch (error) {
    console.error(
      "[MARKET DATA] SL/TP check failed:",
      error.message,
    );

    throw error;
  }

  /**
   * 4. Publish latest price through WebSocket
   */
  publishMarketPrice(marketPrice);

  /**
   * 5. Return updated market price
   */
  return marketPrice;
}

module.exports = {
  updateMarketPrice,
};