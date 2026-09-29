const net = require("net");

const MARKET_DATA_HEALTH_URL =
  process.env.MARKET_DATA_HEALTH_URL ||
  "http://localhost:5002/health";

const PROVIDER_BRIDGE_HEALTH_URL =
  process.env.PROVIDER_BRIDGE_HEALTH_URL ||
  "http://localhost:5003/health";

const WEBSOCKET_HOST =
  process.env.WS_HOST ||
  "localhost";

const WEBSOCKET_PORT = Number(
  process.env.WS_PORT || 5001
);

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

function checkWebSocketPort() {
  return new Promise((resolve) => {
    const socket = new net.Socket();

    let settled = false;

    const finish = (result) => {
      if (settled) {
        return;
      }

      settled = true;

      socket.destroy();

      resolve(result);
    };

    socket.setTimeout(HEALTH_TIMEOUT_MS);

    socket.once("connect", () => {
      finish({
        healthy: true,
        host: WEBSOCKET_HOST,
        port: WEBSOCKET_PORT,
      });
    });

    socket.once("timeout", () => {
      finish({
        healthy: false,
        host: WEBSOCKET_HOST,
        port: WEBSOCKET_PORT,
        error: "WebSocket port check timeout",
      });
    });

    socket.once("error", (error) => {
      finish({
        healthy: false,
        host: WEBSOCKET_HOST,
        port: WEBSOCKET_PORT,
        error: error.message,
      });
    });

    socket.connect(
      WEBSOCKET_PORT,
      WEBSOCKET_HOST
    );
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
    checkWebSocketPort(),
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
          ? "connected"
          : "disconnected",
        host: websocket.host,
        port: websocket.port,
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