const WebSocket = require("ws");

const MARKET_DATA_HEALTH_URL =
  process.env.MARKET_DATA_HEALTH_URL ||
  "http://localhost:5002/health";

const PROVIDER_BRIDGE_HEALTH_URL =
  process.env.PROVIDER_BRIDGE_HEALTH_URL ||
  "http://localhost:5003/health";

const WEBSOCKET_URL =
  process.env.WS_URL ||
  "ws://localhost:5001";

const WEBSOCKET_HEALTH_URL =
  process.env.WS_HEALTH_URL ||
  "http://localhost:5001/health";

  const [
  database,
  marketData,
  providerBridge,
  websocket,
] = await Promise.all([
  checkDatabase(),
  checkHttpService(MARKET_DATA_HEALTH_URL),
  checkHttpService(PROVIDER_BRIDGE_HEALTH_URL),
  checkHttpService(WEBSOCKET_HEALTH_URL),
]);

const HEALTH_TIMEOUT_MS = 3000;

async function checkHttpService(url) {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, HEALTH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });

    let data = null;

    try {
      data = await response.json();
    } catch {
      data = null;
    }

    return {
      healthy:
        response.ok &&
        data?.success === true,
      statusCode: response.status,
      data,
    };
  } catch (error) {
    return {
      healthy: false,
      statusCode: null,
      error:
        error.name === "AbortError"
          ? "Health check timeout"
          : error.message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function checkWebSocket() {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (result) => {
      if (settled) {
        return;
      }

      settled = true;

      if (ws) {
        try {
          ws.close();
        } catch {}
      }

      resolve(result);
    };

    let ws;

    try {
      ws = new WebSocket(WEBSOCKET_URL);
    } catch (error) {
      finish({
        healthy: false,
        url: WEBSOCKET_URL,
        error: error.message,
      });

      return;
    }

    const timeout = setTimeout(() => {
      finish({
        healthy: false,
        url: WEBSOCKET_URL,
        error: "WebSocket health check timeout",
      });
    }, HEALTH_TIMEOUT_MS);

    ws.once("open", () => {
      clearTimeout(timeout);

      finish({
        healthy: true,
        url: WEBSOCKET_URL,
      });
    });

    ws.once("error", (error) => {
      clearTimeout(timeout);

      finish({
        healthy: false,
        url: WEBSOCKET_URL,
        error: error.message,
      });
    });

    ws.once("close", () => {
      clearTimeout(timeout);

      if (!settled) {
        finish({
          healthy: false,
          url: WEBSOCKET_URL,
          error: "WebSocket connection closed",
        });
      }
    });
  });
}

async function getSystemHealth() {
  const [
    database,
    marketData,
    providerBridge,
    websocket,
  ] = await Promise.all([
    checkDatabase(),
    checkHttpService(
      MARKET_DATA_HEALTH_URL
    ),
    checkHttpService(
      PROVIDER_BRIDGE_HEALTH_URL
    ),
    checkHttpService(WEBSOCKET_HEALTH_URL)
  ]);

  const healthy =
    database.healthy &&
    marketData.healthy &&
    providerBridge.healthy &&
    websocket.healthy;

  return {
    healthy,

    status: healthy
      ? "healthy"
      : "degraded",

    services: {
      database: {
        status: database.healthy
          ? "connected"
          : "disconnected",
      },

      marketData: {
        status: marketData.healthy
          ? "healthy"
          : "unhealthy",
      },

      providerBridge: {
        status: providerBridge.healthy
          ? "healthy"
          : "unhealthy",
      },

      websocket: {
        status: websocket.healthy
          ? "healthy"
          : "unhealthy",

        url: websocket.url,

        ...(websocket.error
          ? {
              error: websocket.error,
            }
          : {}),
      },
    },

    timestamp:
      new Date().toISOString(),
  };
}

let checkDatabase;

function setDatabaseHealthChecker(
  databaseHealthChecker
) {
  checkDatabase = async () => {
    try {
      const result =
        await databaseHealthChecker();

      return {
        healthy:
          result.connected === true,
        data: result,
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
      };
    }
  };
}

module.exports = {
  getSystemHealth,
  setDatabaseHealthChecker,
};