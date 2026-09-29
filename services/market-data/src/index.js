const http =
  require("http");

const {
  testDatabaseConnection,
} = require("./config/database");

const {
  updateMarketPrice,
} = require("./services/market-data.service");

const {
  startTwelveDataProvider,
} = require("./providers/twelvedata.provider");

const PORT = 5002;

async function readRequestBody(
  req,
) {
  return new Promise(
    (
      resolve,
      reject,
    ) => {
      let body = "";

      req.on(
        "data",
        (chunk) => {
          body +=
            chunk.toString();
        },
      );

      req.on(
        "end",
        () => {
          try {
            resolve(
              body
                ? JSON.parse(
                    body,
                  )
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

      req.on(
        "error",
        reject,
      );
    },
  );
}

const server =
  http.createServer(
    async (
      req,
      res,
    ) => {
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
        req.method ===
          "GET" &&
        req.url ===
          "/health"
      ) {
        res.writeHead(
          200,
        );

        return res.end(
          JSON.stringify({
            success: true,
            service:
              "market-data",
            status:
              "healthy",
            provider:
              process.env
                .TWELVE_DATA_API_KEY
                ? "twelvedata"
                : "not-configured",
          }),
        );
      }

      /*
      ========================================
      INTERNAL PRICE
      ========================================
      */

      if (
        req.method ===
          "POST" &&
        req.url ===
          "/internal/market-price"
      ) {
        try {
          const body =
            await readRequestBody(
              req,
            );

          const result =
            await updateMarketPrice({
              symbol:
                body.symbol,

              bid:
                body.bid,

              ask:
                body.ask,

              spread:
                body.spread,

              timestamp:
                body.timestamp,
            });

          res.writeHead(
            200,
          );

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

          res.writeHead(
            400,
          );

          return res.end(
            JSON.stringify({
              success: false,
              message:
                error.message,
            }),
          );
        }
      }

      /*
      ========================================
      404
      ========================================
      */

      res.writeHead(
        404,
      );

      return res.end(
        JSON.stringify({
          success: false,
          message:
            "Route not found.",
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

        startTwelveDataProvider();
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