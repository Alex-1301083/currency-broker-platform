const MARKET_DATA_HEALTH_URL =
  process.env.MARKET_DATA_HEALTH_URL ||
  "http://localhost:5002/health";

const PROVIDER_BRIDGE_HEALTH_URL =
  process.env.PROVIDER_BRIDGE_HEALTH_URL ||
  "http://localhost:5003/health";

const WEBSOCKET_HEALTH_URL =
  process.env.WS_HEALTH_URL ||
  "http://localhost:5001/health";

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

let checkDatabase = async () => {
  return {
    healthy: false,
    error: "Database health checker is not configured",
  };
};

function setDatabaseHealthChecker(databaseHealthChecker) {
  checkDatabase = async () => {
    try {
      const result = await databaseHealthChecker();

      return {
        healthy: result.connected === true,
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

    checkHttpService(
      WEBSOCKET_HEALTH_URL
    ),
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

        ...(database.error
          ? {
              error: database.error,
            }
          : {}),
      },

      marketData: {
        status: marketData.healthy
          ? "healthy"
          : "unhealthy",

        ...(marketData.error
          ? {
              error: marketData.error,
            }
          : {}),
      },

      providerBridge: {
        status: providerBridge.healthy
          ? "healthy"
          : "unhealthy",

        ...(providerBridge.error
          ? {
              error: providerBridge.error,
            }
          : {}),
      },

      websocket: {
        status: websocket.healthy
          ? "healthy"
          : "unhealthy",

        url: WEBSOCKET_HEALTH_URL,

        ...(websocket.error
          ? {
              error: websocket.error,
            }
          : {}),
      },
    },

    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  getSystemHealth,
  setDatabaseHealthChecker,
};