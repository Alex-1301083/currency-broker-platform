const http = require("http");

const {
  testDatabaseConnection,
} = require("./config/database");

const {
  updateMarketPrice,
} = require("./services/market-data.service");

const {
  startTwelveDataProvider,
} = require("./providers/twelvedata.provider");

const PORT = Number(
  process.env.MARKET_DATA_PORT ||
    process.env.PORT ||
    5002,
);

const PROVIDER_MODE =
  String(process.env.PROVIDER_MODE || "demo")
    .trim()
    .toLowerCase() === "provider";

async function readRequestBody(req) {
  return new Promise(
    (resolve, reject) => {
      let body = "";

      req.on(
        "data",
        (chunk) => {
          body += chunk.toString();
        },
      );

      req.on(
        "end",
        () => {
          try {
            resolve(
              body
                ? JSON.parse(body)
                : {},
            );
          } catch {
            reject(
              new Error(
                "Invalid JSON request body.",
              ),
            );
          }
        },
      );

      req.on("error", reject);
    },
  );
}

const server = http.createServer(
  async (req, res) => {
    res.setHeader(
      "Content-Type",
      "application/json",
    );

    /*
    ========================================
    HEALTH
    ========================================
    */

    if (
      req.method === "GET" &&
      req.url === "/health"
    ) {
      res.writeHead(200);

      return res.end(
        JSON.stringify({
          success: true,
          service: "market-data",
          status: "healthy",
          provider: PROVIDER_MODE
            ? "provider-bridge"
            : process.env
                .TWELVE_DATA_API_KEY
              ? "twelvedata"
              : "not-configured",
          providerMode: PROVIDER_MODE
            ? "provider"
            : "demo",
        }),
      );
    }

    /*
    ========================================
    INTERNAL PRICE
    ========================================
    */

    if (
      req.method === "POST" &&
      req.url ===
        "/internal/market-price"
    ) {
      try {
        const body =
          await readRequestBody(req);

        const result =
          await updateMarketPrice({
            symbol: body.symbol,
            bid: body.bid,
            ask: body.ask,
            spread: body.spread,
            timestamp:
              body.timestamp,
          });

        res.writeHead(200);

        return res.end(
          JSON.stringify({
            success: true,
            data: result,
          }),
        );
      } catch (error) {
        console.error(
          "[MARKET DATA ERROR]",
          error.message,
        );

        res.writeHead(400);

        return res.end(
          JSON.stringify({
            success: false,
            message: error.message,
          }),
        );
      }
    }

    /*
    ========================================
    404
    ========================================
    */

    res.writeHead(404);

    return res.end(
      JSON.stringify({
        success: false,
        message: "Route not found.",
      }),
    );
  },
);

async function startMarketDataService() {
  try {
    await testDatabaseConnection();

    server.listen(
      PORT,
      () => {
        console.log("");
        console.log(
          "==========================================",
        );
        console.log(
          "        TRADEX MARKET DATA",
        );
        console.log(
          "==========================================",
        );
        console.log(
          `HTTP: http://localhost:${PORT}`,
        );
        console.log(
          `Health: http://localhost:${PORT}/health`,
        );
        console.log(
          "==========================================",
        );
        console.log("");

        /*
        ========================================
        MARKET DATA PROVIDER MODE
        ========================================
        */

        if (PROVIDER_MODE) {
          console.log(
            "[MARKET DATA] Provider mode detected.",
          );

          console.log(
            "[MARKET DATA] Twelve Data direct feed is DISABLED.",
          );

          console.log(
            "[MARKET DATA] Provider Bridge is the authoritative market-price source.",
          );
        } else {
          console.log(
            "[MARKET DATA] Demo/Twelve Data mode detected.",
          );

          console.log(
            "[MARKET DATA] Starting Twelve Data provider...",
          );

          startTwelveDataProvider();
        }
      },
    );
  } catch (error) {
    console.error(
      "[MARKET DATA START ERROR]",
      error,
    );

    process.exit(1);
  }
}

startMarketDataService();