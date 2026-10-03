const WebSocket = require("ws");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({
  path: path.resolve(__dirname, "../../../../.env"),
});

const WS_URL =
  process.env.WS_URL || "ws://localhost:5001";

const MARKET_DATA_WS_SECRET =
  process.env.MARKET_DATA_WS_SECRET;

const PROVIDER_MODE =
  String(process.env.PROVIDER_MODE || "demo")
    .trim()
    .toLowerCase() === "provider";

let socket = null;
let reconnectTimer = null;

if (PROVIDER_MODE) {
  console.log(
    "[API WS] Provider mode detected. API market-price publisher is DISABLED."
  );
  console.log(
    "[API WS] Market Data service is the authoritative price publisher."
  );
} else if (!MARKET_DATA_WS_SECRET) {
  console.warn(
    "MARKET_DATA_WS_SECRET is not configured. API WebSocket publisher will not connect."
  );
}

function connectWebSocket() {
  if (PROVIDER_MODE) {
    return;
  }

  if (
    socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  if (!MARKET_DATA_WS_SECRET) {
    console.warn(
      "API WebSocket publisher cannot connect because MARKET_DATA_WS_SECRET is missing."
    );
    return;
  }

  console.log(
    "Connecting API WebSocket publisher to:",
    WS_URL
  );

  const protocol =
    `market-data.${MARKET_DATA_WS_SECRET}`;

  socket = new WebSocket(
    WS_URL,
    protocol
  );

  socket.on("open", () => {
    console.log(
      "API WebSocket publisher connected to:",
      WS_URL
    );
  });

  socket.on("message", (data) => {
    try {
      console.log(
        "API WebSocket publisher received:",
        JSON.parse(data.toString())
      );
    } catch {
      console.warn(
        "API WebSocket publisher received invalid message:",
        data.toString()
      );
    }
  });

  socket.on("close", (code, reason) => {
    console.warn(
      `API WebSocket publisher disconnected. code=${code} reason=${reason.toString()}`
    );

    socket = null;

    if (!PROVIDER_MODE) {
      scheduleReconnect();
    }
  });

  socket.on("error", (error) => {
    console.error(
      "API WebSocket publisher error:",
      error.message
    );
  });
}

function scheduleReconnect() {
  if (PROVIDER_MODE) {
    return;
  }

  if (reconnectTimer) {
    return;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectWebSocket();
  }, 3000);
}

function publish(message) {
  if (PROVIDER_MODE) {
    return false;
  }

  if (
    !socket ||
    socket.readyState !== WebSocket.OPEN
  ) {
    connectWebSocket();
    return false;
  }

  try {
    socket.send(
      JSON.stringify(message)
    );

    return true;
  } catch (error) {
    console.error(
      "API WebSocket publish error:",
      error.message
    );

    return false;
  }
}

function publishMarketPrice({
  symbol,
  bid,
  ask,
  spread,
}) {
  return publish({
    type: "market_price",
    data: {
      symbol,
      bid: Number(bid),
      ask: Number(ask),
      spread: Number(spread),
      timestamp: new Date().toISOString(),
    },
  });
}

if (!PROVIDER_MODE) {
  connectWebSocket();
}

module.exports = {
  connectWebSocket,
  publish,
  publishMarketPrice,
};
