require("dotenv").config({
  path: "../../.env",
});

const express = require("express");
const cors = require("cors");

const {
  generalLimiter,
  authLimiter,
} = require("./middleware/rate-limit.middleware");

const {
  errorHandler,
} = require("./middleware/error.middleware");

const {
  testDatabaseConnection,
  checkDatabaseHealth,
} = require("./config/database");

const {
  getSystemHealth,
  setDatabaseHealthChecker,
} = require("./services/system-health.service");

const {
  asyncHandler,
} = require("./middleware/async-handler.middleware");

const authRoutes = require("./routes/auth.routes");
const accountRoutes = require("./routes/account.routes");
const marketRoutes = require("./routes/market.routes");
const orderRoutes = require("./routes/order.routes");
const positionRoutes = require("./routes/position.routes");
const tradeRoutes = require("./routes/trade.routes");
const candleRoutes = require("./routes/candle.routes");
const adminRoutes = require("./routes/admin.routes");

setDatabaseHealthChecker(checkDatabaseHealth);

require("./services/websocket.publisher");

const app = express();

const PORT = process.env.PORT || 5000;

/*
==========================================================
CORS
==========================================================
*/

const allowedOrigins = (
  process.env.CLIENT_URLS ||
  "http://localhost:5173,http://localhost:5174"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(
        new Error("CORS origin not allowed"),
      );
    },

    credentials: true,
  }),
);

/*
==========================================================
BODY
==========================================================
*/

app.use(express.json());

/*
==========================================================
GENERAL API RATE LIMIT
==========================================================
*/

app.use("/api", generalLimiter);

/*
==========================================================
ROUTES
==========================================================
*/

app.use(
  "/api/auth",
  authLimiter,
  authRoutes,
);

app.use(
  "/api/account",
  accountRoutes,
);

app.use(
  "/api/market",
  marketRoutes,
);

app.use(
  "/api/order",
  orderRoutes,
);

app.use(
  "/api/positions",
  positionRoutes,
);

app.use(
  "/api/trades",
  tradeRoutes,
);

app.use(
  "/api/market/candles",
  candleRoutes,
);

app.use(
  "/api/admin",
  adminRoutes,
);

/*
==========================================================
ROOT
==========================================================
*/

app.get("/", (req, res) => {
  return res.json({
    success: true,
    message: "TradeX Currency Broker API is running",
  });
});

/*
==========================================================
BASIC HEALTH
==========================================================
*/

app.get(
  "/api/health",
  asyncHandler(async (req, res) => {
    const database =
      await checkDatabaseHealth();

    const healthy =
      database.connected === true;

    return res
      .status(healthy ? 200 : 503)
      .json({
        success: healthy,
        service: "currency-broker-api",
        status: healthy
          ? "healthy"
          : "degraded",
        database: healthy
          ? "connected"
          : "disconnected",
        timestamp:
          new Date().toISOString(),
      });
  }),
);

/*
==========================================================
FULL SYSTEM HEALTH
==========================================================
*/

app.get(
  "/api/system/health",
  asyncHandler(async (req, res) => {
    const health =
      await getSystemHealth();

    return res
      .status(
        health.healthy
          ? 200
          : 503,
      )
      .json({
        success: health.healthy,
        service:
          "currency-broker-platform",
        status: health.status,
        services:
          health.services,
        timestamp:
          health.timestamp,
      });
  }),
);

/*
==========================================================
ERROR HANDLER
==========================================================
*/

app.use(errorHandler);

/*
==========================================================
START
==========================================================
*/

async function startServer() {
  try {
    await testDatabaseConnection();

    app.listen(PORT, () => {
      console.log("");
      console.log(
        "==========================================",
      );
      console.log(
        "        TRADEX API SERVER",
      );
      console.log(
        "==========================================",
      );
      console.log(
        `API: http://localhost:${PORT}`,
      );
      console.log(
        `Health: http://localhost:${PORT}/api/health`,
      );
      console.log(
        `System: http://localhost:${PORT}/api/system/health`,
      );
      console.log(
        "==========================================",
      );
      console.log("");
    });
  } catch (error) {
    console.error(
      "Failed to start API server:",
      error,
    );

    process.exit(1);
  }
}

startServer();