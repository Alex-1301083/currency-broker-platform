const providerManager = require("./services/provider-manager");

const {
  getProviderAccount,
} = require("./services/account-adapter.service");

async function testAccountAdapter() {
  try {
    console.log("\n=================================");
    console.log("14.6 ACCOUNT ADAPTER TEST");
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

    // Check provider status
    const status =
      await provider.getConnectionStatus();

    console.log(
      "[TEST] Provider status:",
      status,
    );

    if (!status.connected) {
      throw new Error(
        "Provider is not connected.",
      );
    }

    // Get normalized account
    const account =
      await getProviderAccount();

    console.log(
      "\n[TEST] ACCOUNT RESULT:",
      account,
    );

    // Basic validation
    if (account.balance < 0) {
      throw new Error(
        "Account balance cannot be negative.",
      );
    }

    if (account.equity < 0) {
      throw new Error(
        "Account equity cannot be negative.",
      );
    }

    if (account.margin < 0) {
      throw new Error(
        "Account margin cannot be negative.",
      );
    }

    if (account.freeMargin < 0) {
      throw new Error(
        "Account free margin cannot be negative.",
      );
    }

    console.log(
      "\n=================================",
    );

    console.log(
      "14.6 ACCOUNT ADAPTER TEST PASSED",
    );

    console.log(
      "=================================\n",
    );
  } catch (error) {
    console.error(
      "\n[14.6 TEST ERROR]",
      error.message,
    );

    process.exitCode = 1;
  }
}

testAccountAdapter();