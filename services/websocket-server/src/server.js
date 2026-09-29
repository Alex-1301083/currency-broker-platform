const WebSocket = require("ws");
const jwt = require("jsonwebtoken");
const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "../../../.env"),
});

const PORT = 5001;

const JWT_SECRET = process.env.JWT_SECRET;
const MARKET_DATA_WS_SECRET =
  process.env.MARKET_DATA_WS_SECRET;

const HEARTBEAT_INTERVAL = 30000;

if (!JWT_SECRET) {
  throw new Error(
    "JWT_SECRET is required for WebSocket authentication",
  );
}

if (!MARKET_DATA_WS_SECRET) {
  throw new Error(
    "MARKET_DATA_WS_SECRET is required for market-data authentication",
  );
}

const wss = new WebSocket.Server({
  port: PORT,
});

// ==========================================
// JWT
// ==========================================

function verifyJwtToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

// ==========================================
// SUBPROTOCOL
// ==========================================

function getSubprotocols(request) {
  const protocols =
    request.headers["sec-websocket-protocol"];

  if (!protocols) {
    return [];
  }

  return protocols
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

// ==========================================
// AUTHENTICATION
// ==========================================

function authenticateConnection(request) {
  const protocols = getSubprotocols(request);

  // ----------------------------------------
  // MARKET DATA PUBLISHER
  // ----------------------------------------

  const marketDataProtocol = protocols.find(
    (protocol) =>
      protocol.startsWith("market-data."),
  );

  if (marketDataProtocol) {
    const suppliedSecret =
      marketDataProtocol.substring(
        "market-data.".length,
      );

    if (
      suppliedSecret === MARKET_DATA_WS_SECRET
    ) {
      return {
        type: "market-data",
        authenticated: true,
        role: "market-data",
      };
    }
  }

  // ----------------------------------------
  // NORMAL USER
  // ----------------------------------------

  const bearerProtocol = protocols.find(
    (protocol) =>
      protocol
        .toLowerCase()
        .startsWith("bearer."),
  );

  if (bearerProtocol) {
    const token =
      bearerProtocol.substring(
        "bearer.".length,
      );

    const payload = verifyJwtToken(token);

    if (payload) {
      return {
        type: "user",
        authenticated: true,
        role: payload.role || "user",
        user: payload,
      };
    }
  }

  return null;
}

// ==========================================
// BROADCAST
// ==========================================

function broadcast(message) {
  const data = JSON.stringify(message);

  wss.clients.forEach((client) => {
    if (
      client.readyState === WebSocket.OPEN &&
      client.isAuthenticated
    ) {
      try {
        client.send(data);
      } catch (error) {
        console.error(
          "WebSocket broadcast error:",
          error.message,
        );

        try {
          client.terminate();
        } catch (terminateError) {
          console.error(
            "WebSocket terminate error:",
            terminateError.message,
          );
        }
      }
    }
  });
}

// ==========================================
// CONNECTION
// ==========================================

wss.on("connection", (ws, request) => {
  const authentication =
    authenticateConnection(request);

  // ----------------------------------------
  // REJECT UNAUTHENTICATED
  // ----------------------------------------

  if (!authentication) {
    console.warn(
      "Rejected unauthenticated WebSocket connection",
    );

    ws.close(
      1008,
      "Authentication required",
    );

    return;
  }

  // ----------------------------------------
  // CONNECTION STATE
  // ----------------------------------------

  ws.isAuthenticated = true;
  ws.authType = authentication.type;
  ws.role = authentication.role;

  // Heartbeat state
  ws.isAlive = true;

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  // ----------------------------------------
  // USER
  // ----------------------------------------

  if (authentication.type === "user") {
    ws.user = authentication.user;

    console.log(
      `Authenticated user WebSocket connected: ${
        authentication.user.email ||
        authentication.user.userId
      }`,
    );
  }

  // ----------------------------------------
  // MARKET DATA
  // ----------------------------------------

  if (authentication.type === "market-data") {
    console.log(
      "Authenticated market-data publisher connected.",
    );
  }

  // ----------------------------------------
  // CONNECTION MESSAGE
  // ----------------------------------------

  ws.send(
    JSON.stringify({
      type: "connection",
      success: true,
      authenticated: true,
      authType: authentication.type,
      message:
        "Connected to Currency Broker WebSocket",
    }),
  );

  // ========================================
  // MESSAGE
  // ========================================

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(
        message.toString(),
      );

      // --------------------------------------
      // PING
      // --------------------------------------

      if (data.type === "ping") {
        ws.send(
          JSON.stringify({
            type: "pong",
            timestamp:
              new Date().toISOString(),
          }),
        );

        return;
      }

      // --------------------------------------
      // MARKET PRICE
      // --------------------------------------

      if (data.type === "market_price") {
        if (
          ws.authType !== "market-data"
        ) {
          ws.send(
            JSON.stringify({
              type: "error",
              message:
                "Only the market-data publisher can publish market prices.",
            }),
          );

          return;
        }

        if (
          !data.data ||
          typeof data.data !== "object"
        ) {
          ws.send(
            JSON.stringify({
              type: "error",
              message:
                "Invalid market price payload.",
            }),
          );

          return;
        }

        if (!data.data.symbol) {
          ws.send(
            JSON.stringify({
              type: "error",
              message:
                "Market price symbol is required.",
            }),
          );

          return;
        }

        if (
          !Number.isFinite(
            Number(data.data.bid),
          ) ||
          !Number.isFinite(
            Number(data.data.ask),
          )
        ) {
          ws.send(
            JSON.stringify({
              type: "error",
              message:
                "Market price bid and ask must be valid numbers.",
            }),
          );

          return;
        }

        broadcast({
          type: "market_price",
          data: {
            symbol: String(
              data.data.symbol,
            ).toUpperCase(),

            bid: Number(
              data.data.bid,
            ),

            ask: Number(
              data.data.ask,
            ),

            spread: Number(
              data.data.spread || 0,
            ),

            timestamp:
              data.data.timestamp ||
              new Date().toISOString(),
          },
        });

        console.log(
          "Market price broadcasted:",
          data.data,
        );

        return;
      }

      // --------------------------------------
      // UNSUPPORTED
      // --------------------------------------

      ws.send(
        JSON.stringify({
          type: "error",
          message:
            "Unsupported WebSocket message type.",
        }),
      );
    } catch (error) {
      console.error(
        "Invalid WebSocket message:",
        error.message,
      );

      ws.send(
        JSON.stringify({
          type: "error",
          message:
            "Invalid WebSocket message.",
        }),
      );
    }
  });

  // ========================================
  // CLOSE
  // ========================================

  ws.on("close", (code, reason) => {
    if (ws.authType === "market-data") {
      console.log(
        `Market-data publisher disconnected. code=${code} reason=${reason.toString()}`,
      );
    } else {
      console.log(
        `User WebSocket disconnected. code=${code} reason=${reason.toString()}`,
      );
    }
  });

  // ========================================
  // ERROR
  // ========================================

  ws.on("error", (error) => {
    console.error(
      "WebSocket client error:",
      error.message,
    );
  });
});

// ==========================================
// HEARTBEAT
// ==========================================

const heartbeatTimer = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.warn(
        "Terminating stale WebSocket connection.",
      );

      ws.terminate();

      return;
    }

    ws.isAlive = false;

    try {
      ws.ping();
    } catch (error) {
      console.error(
        "WebSocket heartbeat error:",
        error.message,
      );

      try {
        ws.terminate();
      } catch (terminateError) {
        console.error(
          "WebSocket terminate error:",
          terminateError.message,
        );
      }
    }
  });
}, HEARTBEAT_INTERVAL);

// ==========================================
// SERVER ERROR
// ==========================================

wss.on("error", (error) => {
  console.error(
    "WebSocket server error:",
    error.message,
  );
});

// ==========================================
// SERVER LISTEN
// ==========================================

wss.on("listening", () => {
  console.log(
    `Currency Broker WebSocket running on ws://localhost:${PORT}`,
  );
});

// ==========================================
// GRACEFUL SHUTDOWN
// ==========================================

async function shutdown(signal) {
  console.log(
    `WebSocket server received ${signal}. Shutting down...`,
  );

  clearInterval(heartbeatTimer);

  wss.clients.forEach((ws) => {
    try {
      ws.close(
        1001,
        "Server shutting down",
      );
    } catch (error) {
      console.error(
        "WebSocket close error:",
        error.message,
      );

      try {
        ws.terminate();
      } catch (terminateError) {
        console.error(
          "WebSocket terminate error:",
          terminateError.message,
        );
      }
    }
  });

  wss.close(() => {
    console.log(
      "WebSocket server closed.",
    );

    process.exit(0);
  });

  setTimeout(() => {
    console.warn(
      "WebSocket shutdown timeout. Forcing exit.",
    );

    process.exit(1);
  }, 5000);
}

process.on(
  "SIGINT",
  () => shutdown("SIGINT"),
);

process.on(
  "SIGTERM",
  () => shutdown("SIGTERM"),
);

// ==========================================
// EXPORT
// ==========================================

module.exports = {
  wss,
  broadcast,
};