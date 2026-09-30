require("dotenv").config({
  path: "C:/Users/Dell/OneDrive/Desktop/currency-broker-platform/.env",
});
const http = require("http");

const providerManager = require("./services/provider-manager");

const {
  placeProviderOrder,
  cancelProviderOrder,
  closeProviderPosition,
} = require("./services/order-execution.service");

const PRICE_INTERVAL = 1000;

const PROVIDER_BRIDGE_PORT = Number(process.env.PORT || 5003);
const PROVIDER_RECONNECT_INTERVAL = 5000;
const PROVIDER_HEALTH_INTERVAL = 5000;

const MARKET_DATA_URL =
  process.env.MARKET_DATA_URL || "http://localhost:5002/internal/market-price";

// ==========================================
// INTERNAL SECURITY
// ==========================================

const PROVIDER_INTERNAL_SECRET = process.env.PROVIDER_INTERNAL_SECRET;

if (!PROVIDER_INTERNAL_SECRET) {
  console.error("[SECURITY] PROVIDER_INTERNAL_SECRET is missing.");

  process.exit(1);
}

// ==========================================
// HTTP REQUEST BODY
// ==========================================

async function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error("Invalid JSON request body."));
      }
    });

    req.on("error", reject);
  });
}

// ==========================================
// JSON RESPONSE
// ==========================================

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
  });

  res.end(JSON.stringify(data));
}

// ==========================================
// INTERNAL REQUEST AUTHENTICATION
// ==========================================

function isAuthorizedInternalRequest(req) {
  const providedSecret = req.headers["x-provider-secret"];

  if (!providedSecret) {
    return false;
  }

  return providedSecret === PROVIDER_INTERNAL_SECRET;
}

function requireInternalAuth(req, res) {
  if (isAuthorizedInternalRequest(req)) {
    return true;
  }

  console.warn(
    `[SECURITY] Unauthorized Provider Bridge request: ${req.method} ${req.url}`,
  );

  sendJson(res, 401, {
    success: false,
    message: "Unauthorized.",
  });

  return false;
}

// ==========================================
// MARKET DATA → MARKET DATA SERVICE
// ==========================================

async function sendPriceToMarketData(price) {
  try {
    const response = await fetch(MARKET_DATA_URL, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        symbol: price.symbol,
        bid: price.bid,
        ask: price.ask,
        spread: price.spread,
        timestamp: price.timestamp || new Date().toISOString(),
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || `Market Data HTTP ${response.status}`);
    }

    console.log("[PROVIDER → MARKET DATA]", result.data);

    return result;
  } catch (error) {
    console.error(`[MARKET DATA PUSH ERROR] ${price.symbol}`, error.message);

    return null;
  }
}

// ==========================================
// PROVIDER BRIDGE HTTP SERVER
// ==========================================

function startHttpServer() {
  const server = http.createServer(async (req, res) => {
    // ------------------------------------
    // HEALTH
    // ------------------------------------

    if (req.method === "GET" && req.url === "/health") {
      return sendJson(res, 200, {
        success: true,
        service: "provider-bridge",
        providerMode: process.env.PROVIDER_MODE || "demo",
        status: "healthy",
      });
    }

    // ------------------------------------
    // PLACE ORDER
    // ------------------------------------

    if (req.method === "POST" && req.url === "/internal/orders") {
      if (!requireInternalAuth(req, res)) {
        return;
      }

      try {
        const body = await readRequestBody(req);

        console.log("[PROVIDER BRIDGE] Authorized order request:", {
          symbol: body.symbol,
          side: body.side,
          volume: body.volume,
        });

        const result = await placeProviderOrder({
          symbol: body.symbol,
          side: body.side,
          volume: body.volume,
          stopLoss: body.stopLoss ?? null,
          takeProfit: body.takeProfit ?? null,
        });

        return sendJson(res, 200, {
          success: true,
          data: result,
        });
      } catch (error) {
        console.error("[PROVIDER ORDER ERROR]", error.message);

        return sendJson(res, 400, {
          success: false,
          message: error.message,
        });
      }
    }

    // ------------------------------------
    // CANCEL ORDER
    // ------------------------------------

    if (req.method === "POST" && req.url === "/internal/orders/cancel") {
      if (!requireInternalAuth(req, res)) {
        return;
      }

      try {
        const body = await readRequestBody(req);

        const result = await cancelProviderOrder(body.orderId);

        return sendJson(res, 200, {
          success: true,
          data: result,
        });
      } catch (error) {
        console.error("[PROVIDER CANCEL ERROR]", error.message);

        return sendJson(res, 400, {
          success: false,
          message: error.message,
        });
      }
    }

    // ------------------------------------
    // CLOSE POSITION
    // ------------------------------------

    if (req.method === "POST" && req.url === "/internal/positions/close") {
      if (!requireInternalAuth(req, res)) {
        return;
      }

      try {
        const body = await readRequestBody(req);

        const result = await closeProviderPosition(body.positionId);

        return sendJson(res, 200, {
          success: true,
          data: result,
        });
      } catch (error) {
        console.error("[PROVIDER CLOSE ERROR]", error.message);

        return sendJson(res, 400, {
          success: false,
          message: error.message,
        });
      }
    }

    // ------------------------------------
    // NOT FOUND
    // ------------------------------------

    return sendJson(res, 404, {
      success: false,
      message: "Provider Bridge route not found.",
    });
  });

  server.listen(PROVIDER_BRIDGE_PORT, () => {
    console.log(
      `[PROVIDER BRIDGE HTTP] Running on http://localhost:${PROVIDER_BRIDGE_PORT}`,
    );

    console.log(
      "[PROVIDER BRIDGE HTTP] Health:",
      `http://localhost:${PROVIDER_BRIDGE_PORT}/health`,
    );

    console.log("[PROVIDER BRIDGE HTTP] Internal endpoints are protected.");
  });

  server.on("error", (error) => {
    console.error("[PROVIDER BRIDGE HTTP ERROR]", error);
  });

  return server;
}

// ==========================================
// LIVE MARKET PRICE FEED
// ==========================================

async function startProviderBridge() {
  let provider;
  let symbols = [];

  try {
    provider = providerManager.initialize();

    await connectProvider();

    // Start internal HTTP API
    startHttpServer();

    console.log("[PROVIDER BRIDGE] Starting live price feed...");

    setInterval(monitorProviderConnection, PROVIDER_HEALTH_INTERVAL);

    setInterval(publishPrices, PRICE_INTERVAL);

    await publishPrices();
  } catch (error) {
    console.error("[PROVIDER BRIDGE STARTUP ERROR]", error.message);

    console.error(
      "[PROVIDER BRIDGE] Service will continue and attempt recovery.",
    );

    startHttpServer();

    setInterval(monitorProviderConnection, PROVIDER_HEALTH_INTERVAL);

    setInterval(publishPrices, PRICE_INTERVAL);

    await publishPrices();
  }

  async function connectProvider() {
    try {
      console.log("[PROVIDER BRIDGE] Connecting to provider...");

      const connection = await providerManager.connect();

      console.log("[PROVIDER BRIDGE]", connection);

      const status = await providerManager.getConnectionStatus();

      console.log("[PROVIDER STATUS]", status);

      if (!status.connected) {
        throw new Error("Provider is not connected.");
      }

      const newSymbols = await provider.getSymbols();

      if (!Array.isArray(newSymbols) || newSymbols.length === 0) {
        throw new Error("No symbols received from provider.");
      }

      symbols = newSymbols;

      console.log("[PROVIDER SYMBOLS]", symbols);

      console.log("[PROVIDER BRIDGE] Provider connection ready.");

      return true;
    } catch (error) {
      console.error("[PROVIDER CONNECTION ERROR]", error.message);

      symbols = [];

      return false;
    }
  }

  async function monitorProviderConnection() {
    try {
      const status = await providerManager.getConnectionStatus();

      if (status.connected) {
        return;
      }

      console.warn("[PROVIDER RECOVERY] Provider disconnected.");

      console.warn(
        `[PROVIDER RECOVERY] Retrying in ${PROVIDER_RECONNECT_INTERVAL}ms...`,
      );

      await new Promise((resolve) => {
        setTimeout(resolve, PROVIDER_RECONNECT_INTERVAL);
      });

      const recovered = await providerManager.reconnect();

      if (!recovered) {
        console.error("[PROVIDER RECOVERY] Provider still unavailable.");

        return;
      }

      const newStatus = await providerManager.getConnectionStatus();

      if (!newStatus.connected) {
        console.error(
          "[PROVIDER RECOVERY] Provider reconnect returned disconnected.",
        );

        return;
      }

      try {
        const newSymbols = await provider.getSymbols();

        if (Array.isArray(newSymbols) && newSymbols.length > 0) {
          symbols = newSymbols;
        }
      } catch (symbolError) {
        console.error(
          "[PROVIDER RECOVERY] Failed to reload symbols:",
          symbolError.message,
        );
      }

      console.log("[PROVIDER RECOVERY] Provider connection restored.");
    } catch (error) {
      console.error("[PROVIDER RECOVERY ERROR]", error.message);
    }
  }

  async function publishPrices() {
    if (!providerManager.isConnected()) {
      console.warn(
        "[PROVIDER PRICE] Provider unavailable. Skipping price cycle.",
      );

      return;
    }

    if (!Array.isArray(symbols) || symbols.length === 0) {
      console.warn("[PROVIDER PRICE] No provider symbols available.");

      return;
    }

    try {
      if (typeof provider.updateDemoPrices === "function") {
        provider.updateDemoPrices();
      }

      for (const symbolData of symbols) {
        try {
          const symbol = symbolData.symbol;

          const price = await provider.getMarketPrice(symbol);

          await sendPriceToMarketData(price);
        } catch (error) {
          console.error(`[PROVIDER PRICE ERROR] ${symbol}`, error.message);
        }
      }
    } catch (error) {
      console.error("[PROVIDER PRICE UPDATE ERROR]", error.message);

      providerManager.connected = false;
      providerManager.lastError = error.message;
    }
  }
}
startProviderBridge();
