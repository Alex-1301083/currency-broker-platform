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

function verifyJwtToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

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

function authenticateConnection(request) {
  const protocols = getSubprotocols(request);

  /*
   * Internal market-data publisher
   *
   * Expected protocol:
   * market-data.<SECRET>
   */
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

  /*
   * Normal authenticated client
   *
   * Expected protocol:
   * bearer.<JWT>
   */
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

function broadcast(message) {
  const data = JSON.stringify(message);

  wss.clients.forEach((client) => {
    if (
      client.readyState === WebSocket.OPEN &&
      client.isAuthenticated
    ) {
      client.send(data);
    }
  });
}

wss.on("connection", (ws, request) => {
  const authentication =
    authenticateConnection(request);

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

  ws.isAuthenticated = true;
  ws.authType = authentication.type;
  ws.role = authentication.role;

  if (authentication.type === "user") {
    ws.user = authentication.user;

    console.log(
      `Authenticated user WebSocket connected: ${
        authentication.user.email ||
        authentication.user.userId
      }`,
    );
  }

  if (authentication.type === "market-data") {
    console.log(
      "Authenticated market-data publisher connected.",
    );
  }

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

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(
        message.toString(),
      );

      console.log(
        "Received WebSocket message:",
        data,
      );

      /*
       * Ping is allowed for every authenticated
       * connection.
       */
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

      /*
       * ONLY market-data publisher can publish
       * market prices.
       */
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

      /*
       * Users cannot publish internal events.
       */
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

  ws.on("error", (error) => {
    console.error(
      "WebSocket client error:",
      error.message,
    );
  });
});

console.log(
  `Currency Broker WebSocket running on ws://localhost:${PORT}`,
);

module.exports = {
  wss,
  broadcast,
};