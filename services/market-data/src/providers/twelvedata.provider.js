const WebSocket =
  require("ws");

const path =
  require("path");

require("dotenv").config({
  path: path.resolve(
    __dirname,
    "../../../../.env",
  ),
});

const {
  updateMarketPrice,
} = require("../services/market-data.service");

const {
  processPriceTick,
} = require("../../../api-server/src/services/candle.service");

const {
  getSymbolByName,
} = require("../../../api-server/src/models/symbol.model");

const API_KEY =
  process.env.TWELVE_DATA_API_KEY;

const WS_URL =
  process.env.TWELVE_DATA_WS_URL ||
  "wss://ws.twelvedata.com/v1/quotes/price";

const rawMappings =
  process.env.TWELVE_DATA_SYMBOLS ||
  "XAUUSD:XAU/USD,EURUSD:EUR/USD,GBPUSD:GBP/USD,BTCUSD:BTC/USD";

const mappings =
  rawMappings
    .split(",")
    .map((item) => {
      const [
        internal,
        provider,
      ] = item.split(":");

      return {
        internal:
          internal
            ?.trim()
            .toUpperCase(),

        provider:
          provider?.trim(),
      };
    })
    .filter(
      (item) =>
        item.internal &&
        item.provider,
    );

const providerToInternal =
  new Map(
    mappings.map(
      (item) => [
        item.provider
          .toUpperCase(),
        item.internal,
      ],
    ),
  );

const spreadMap = {
  XAUUSD: Number(
    process.env
      .MARKET_SPREAD_XAUUSD ||
      0.3,
  ),

  EURUSD: Number(
    process.env
      .MARKET_SPREAD_EURUSD ||
      0.0002,
  ),

  GBPUSD: Number(
    process.env
      .MARKET_SPREAD_GBPUSD ||
      0.0002,
  ),

  BTCUSD: Number(
    process.env
      .MARKET_SPREAD_BTCUSD ||
      50,
  ),
};

let socket = null;
let reconnectTimer = null;
let heartbeatTimer = null;

function getSpread(
  symbol,
) {
  return (
    Number(
      spreadMap[symbol],
    ) || 0
  );
}

function scheduleReconnect() {
  if (reconnectTimer) {
    return;
  }

  reconnectTimer =
    setTimeout(() => {
      reconnectTimer = null;

      connect();
    }, 5000);
}

function startHeartbeat() {
  stopHeartbeat();

  heartbeatTimer =
    setInterval(() => {
      if (
        socket &&
        socket.readyState ===
          WebSocket.OPEN
      ) {
        socket.send(
          JSON.stringify({
            action:
              "heartbeat",
          }),
        );
      }
    }, 10000);
}

function stopHeartbeat() {
  if (
    heartbeatTimer
  ) {
    clearInterval(
      heartbeatTimer,
    );

    heartbeatTimer = null;
  }
}

async function handlePriceTick(
  providerSymbol,
  price,
  timestamp,
) {
  const internalSymbol =
    providerToInternal.get(
      String(
        providerSymbol,
      ).toUpperCase(),
    );

  if (
    !internalSymbol
  ) {
    return;
  }

  const mid =
    Number(price);

  if (
    !Number.isFinite(mid) ||
    mid <= 0
  ) {
    return;
  }

  /*
   * Twelve Data WebSocket currently
   * supplies latest price, not bid/ask.
   *
   * TradeX therefore creates a configured
   * display/execution spread around the
   * provider price.
   *
   * For production execution, replace
   * this with the actual broker's bid/ask.
   */

  const spread =
    getSpread(
      internalSymbol,
    );

  const bid =
    Number(
      (
        mid -
        spread / 2
      ).toFixed(
        internalSymbol ===
          "EURUSD" ||
        internalSymbol ===
          "GBPUSD"
          ? 5
          : 2,
      ),
    );

  const ask =
    Number(
      (
        mid +
        spread / 2
      ).toFixed(
        internalSymbol ===
          "EURUSD" ||
        internalSymbol ===
          "GBPUSD"
          ? 5
          : 2,
      ),
    );

  try {
    await updateMarketPrice({
      symbol:
        internalSymbol,

      bid,

      ask,

      spread,

      timestamp:
        timestamp
          ? new Date(
              Number(timestamp) *
                1000,
            ).toISOString()
          : new Date().toISOString(),
    });

    const symbol =
      await getSymbolByName(
        internalSymbol,
      );

    if (symbol) {
      await processPriceTick({
        symbolId:
          symbol.id,

        symbol:
          internalSymbol,

        bid,

        volume: 1, // tick volume (like TradingView "Vol · Ticks")

        timestamp:
          timestamp
            ? new Date(
                Number(timestamp) *
                  1000,
              )
            : new Date(),
      });
    }

    console.log(
      `[LIVE] ${internalSymbol} | BID ${bid} | ASK ${ask}`,
    );
  } catch (error) {
    console.error(
      `[LIVE] ${internalSymbol} update failed:`,
      error.message,
    );
  }
}

function connect() {
  if (
    !API_KEY
  ) {
    console.error(
      "[TWELVE DATA] TWELVE_DATA_API_KEY is missing.",
    );

    return;
  }

  if (
    socket &&
    (
      socket.readyState ===
        WebSocket.OPEN ||
      socket.readyState ===
        WebSocket.CONNECTING
    )
  ) {
    return;
  }

  const endpoint =
    `${WS_URL}?apikey=${encodeURIComponent(
      API_KEY,
    )}`;

  console.log(
    "[TWELVE DATA] Connecting...",
  );

  socket =
    new WebSocket(
      endpoint,
    );

  socket.on(
    "open",
    () => {
      console.log(
        "[TWELVE DATA] Connected.",
      );

      const symbols =
        mappings
          .map(
            (item) =>
              item.provider,
          )
          .join(",");

      socket.send(
        JSON.stringify({
          action:
            "subscribe",

          params: {
            symbols,
          },
        }),
      );

      console.log(
        "[TWELVE DATA] Subscribed:",
        symbols,
      );

      startHeartbeat();
    },
  );

  socket.on(
    "message",
    async (raw) => {
      try {
        const message =
          JSON.parse(
            raw.toString(),
          );

        if (
          message.event ===
          "price"
        ) {
          await handlePriceTick(
            message.symbol,
            message.price,
            message.timestamp,
          );

          return;
        }

        if (
          message.event ===
          "subscribe-status"
        ) {
          console.log(
            "[TWELVE DATA] Subscription:",
            message,
          );

          return;
        }

        if (
          message.event ===
          "heartbeat"
        ) {
          return;
        }

        if (
          message.code ||
          message.message
        ) {
          console.error(
            "[TWELVE DATA] Provider message:",
            message,
          );
        }
      } catch (error) {
        console.error(
          "[TWELVE DATA] Message parse error:",
          error.message,
        );
      }
    },
  );

  socket.on(
    "error",
    (error) => {
      console.error(
        "[TWELVE DATA] WebSocket error:",
        error.message,
      );
    },
  );

  socket.on(
    "close",
    (code, reason) => {
      console.warn(
        `[TWELVE DATA] Closed: ${code} ${reason.toString()}`,
      );

      socket = null;

      stopHeartbeat();

      scheduleReconnect();
    },
  );
}

function startTwelveDataProvider() {
  if (
    !API_KEY
  ) {
    console.warn(
      "[TWELVE DATA] Provider disabled because API key is missing.",
    );

    return;
  }

  console.log(
    "[TWELVE DATA] Symbols:",
    mappings,
  );

  connect();
}

module.exports = {
  startTwelveDataProvider,
};