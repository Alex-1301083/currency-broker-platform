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

if (!MARKET_DATA_WS_SECRET) {
  console.warn(
    "MARKET_DATA_WS_SECRET is not configured. API WebSocket publisher will not connect."
  );
}

let socket = null;
let reconnectTimer = null;

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

  /*
   * The WebSocket server expects:
   *
   * market-data.<SECRET>
   *
   * as the WebSocket subprotocol.
   */
  const protocol = `market-data.${MARKET_DATA_WS_SECRET}`;

  socket = new WebSocket(
    WS_URL,
    protocol
  );

  socket.on("open", () => {
    console.log(
      "API WebSocket publisher connected to:",
      WS_URL
    );

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  });

  socket.on("message", (message) => {
    try {
      const data = JSON.parse(
        message.toString()
      );

      console.log(
        "API WebSocket publisher received:",
        data
      );
    } catch (error) {
      console.error(
        "API WebSocket publisher received invalid message:",
        error.message
      );
    }
  });

  socket.on("close", (code, reason) => {
    console.log(
      `API WebSocket publisher disconnected. code=${code} reason=${reason.toString()}`
    );

    socket = null;

    scheduleReconnect();
  });

  socket.on("error", (error) => {
    console.error(
      "API WebSocket publisher error:",
      error.message
    );
  });
}

function scheduleReconnect() {
  if (reconnectTimer) {
    return;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;

    connectWebSocket();
  }, 3000);
}

function publish(message) {
  if (
    !socket ||
    socket.readyState !== WebSocket.OPEN
  ) {
    console.warn(
      "WebSocket is not connected. Message was not published."
    );

    return false;
  }

  socket.send(
    JSON.stringify(message)
  );

  return true;
}

function publishMarketPrice({
  symbol,
  bid,
  ask,
  spread
}) {
  return publish({
    type: "market_price",
    data: {
      symbol,
      bid: Number(bid),
      ask: Number(ask),
      spread: Number(spread),
      timestamp: new Date().toISOString()
    }
  });
}

connectWebSocket();

module.exports = {
  connectWebSocket,
  publish,
  publishMarketPrice
};