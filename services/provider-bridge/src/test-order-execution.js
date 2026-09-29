const providerManager = require("./services/provider-manager");

const {
  placeProviderOrder,
} = require("./services/order-execution.service");

async function testOrderExecution() {
  try {
    console.log("\n=================================");
    console.log("14.5 ORDER EXECUTION TEST");
    console.log("=================================\n");

    // Initialize provider
    const provider =
      providerManager.initialize();

    // Connect provider
    const connection =
      await provider.connect();

    console.log(
      "[TEST] Provider connection:",
      connection,
    );

    // Check status
    const status =
      await provider.getConnectionStatus();

    console.log(
      "[TEST] Provider status:",
      status,
    );

    // BUY test
    console.log("\n[TEST] Sending BUY order...\n");

    const buyResult =
      await placeProviderOrder({
        symbol: "XAUUSD",
        side: "BUY",
        volume: 0.01,
        stopLoss: null,
        takeProfit: null,
      });

    console.log(
      "\n[TEST] BUY RESULT:",
      buyResult,
    );

    // SELL test
    console.log("\n[TEST] Sending SELL order...\n");

    const sellResult =
      await placeProviderOrder({
        symbol: "XAUUSD",
        side: "SELL",
        volume: 0.01,
        stopLoss: null,
        takeProfit: null,
      });

    console.log(
      "\n[TEST] SELL RESULT:",
      sellResult,
    );

    console.log(
      "\n=================================",
    );
    console.log(
      "14.5 ORDER EXECUTION TEST PASSED",
    );
    console.log(
      "=================================\n",
    );
  } catch (error) {
    console.error(
      "\n[14.5 TEST ERROR]",
      error.message,
    );

    process.exitCode = 1;
  }
}

testOrderExecution();