require("dotenv").config({
  path: require("path").resolve(
    __dirname,
    "../../../../.env",
  ),
});

const { pool } = require("../config/database");

const {
  getMaxOpenPositions,
  validateMaxOpenPositions,
  getMaxTotalExposure,
  calculateExposure,
  validateMaxTotalExposure,
  getMaxOrderVolume,
  validateMaxOrderVolume,
  getMaxSymbolVolume,
  validateSymbolVolumeLimit,
  getMaxExposureLeverage,
  validateAccountExposureLeverage,
} = require("../services/risk-limit.service");

const ACCOUNT_ID =
  "ad401a26-8aef-45b4-ba03-5e9ef4a2969b";

async function expectFailure(
  name,
  callback,
) {
  try {
    await callback();

    console.error(
      `❌ ${name}: FAILED - expected rejection`,
    );

    return false;
  } catch (error) {
    console.log(
      `✅ ${name}: PASSED`,
    );

    console.log(
      `   Reason: ${error.message}`,
    );

    return true;
  }
}

async function runTest() {
  const client = await pool.connect();

  let passed = 0;
  let failed = 0;

  try {
    console.log(
      "\n==============================================",
    );

    console.log(
      "PHASE 15.4 - COMPLETE RISK LIMIT TEST",
    );

    console.log(
      "==============================================\n",
    );

    // ======================================================
    // Configuration
    // ======================================================

    console.log(
      "Risk configuration:",
    );

    console.log(
      "MAX_OPEN_POSITIONS:",
      getMaxOpenPositions(),
    );

    console.log(
      "MAX_TOTAL_EXPOSURE:",
      getMaxTotalExposure(),
    );

    console.log(
      "MAX_ORDER_VOLUME:",
      getMaxOrderVolume(),
    );

    console.log(
      "MAX_SYMBOL_VOLUME:",
      getMaxSymbolVolume(),
    );

    console.log(
      "MAX_EXPOSURE_LEVERAGE:",
      getMaxExposureLeverage(),
    );

    // ======================================================
    // Test 1 - Maximum Open Positions
    // ======================================================

    console.log(
      "\n--- TEST 1: MAX OPEN POSITIONS ---",
    );

    const openPositionResult =
      await validateMaxOpenPositions({
        client,
        accountId: ACCOUNT_ID,
      });

    console.log(
      "Current open positions:",
      openPositionResult.openPositions,
    );

    console.log(
      "Maximum allowed:",
      openPositionResult.maxOpenPositions,
    );

    console.log(
      "Remaining:",
      openPositionResult.remaining,
    );

    if (
      openPositionResult.allowed ===
      true
    ) {
      console.log(
        "✅ Maximum open positions validation PASSED",
      );

      passed++;
    } else {
      console.log(
        "❌ Maximum open positions validation FAILED",
      );

      failed++;
    }

    // ======================================================
    // Test 2 - Exposure Calculation
    // ======================================================

    console.log(
      "\n--- TEST 2: EXPOSURE CALCULATION ---",
    );

    const exposure =
      calculateExposure({
        volume: 0.01,
        contractSize: 100,
        price: 3400,
      });

    console.log(
      "Volume: 0.01",
    );

    console.log(
      "Contract Size: 100",
    );

    console.log(
      "Price: 3400",
    );

    console.log(
      "Calculated Exposure:",
      exposure,
    );

    if (
      exposure === 3400
    ) {
      console.log(
        "✅ Exposure calculation PASSED",
      );

      passed++;
    } else {
      console.log(
        "❌ Exposure calculation FAILED",
      );

      failed++;
    }

    // ======================================================
    // Test 3 - Maximum Total Exposure
    // ======================================================

    console.log(
      "\n--- TEST 3: MAX TOTAL EXPOSURE ---",
    );

    const totalExposureResult =
      await validateMaxTotalExposure({
        client,
        accountId: ACCOUNT_ID,
        volume: 0.01,
        contractSize: 100,
        price: 3400,
      });

    console.log(
      "Existing exposure:",
      totalExposureResult.existingExposure,
    );

    console.log(
      "New order exposure:",
      totalExposureResult.newOrderExposure,
    );

    console.log(
      "Total exposure:",
      totalExposureResult.totalExposure,
    );

    console.log(
      "Maximum exposure:",
      totalExposureResult.maxTotalExposure,
    );

    if (
      totalExposureResult.allowed ===
      true
    ) {
      console.log(
        "✅ Maximum total exposure validation PASSED",
      );

      passed++;
    } else {
      console.log(
        "❌ Maximum total exposure validation FAILED",
      );

      failed++;
    }

    // ======================================================
    // Test 4 - Maximum Order Volume
    // ======================================================

    console.log(
      "\n--- TEST 4: MAX ORDER VOLUME ---",
    );

    const orderVolumeResult =
      validateMaxOrderVolume({
        volume: 0.01,
      });

    console.log(
      "Requested volume:",
      orderVolumeResult.volume,
    );

    console.log(
      "Maximum order volume:",
      orderVolumeResult.maxOrderVolume,
    );

    console.log(
      "Remaining:",
      orderVolumeResult.remaining,
    );

    if (
      orderVolumeResult.allowed ===
      true
    ) {
      console.log(
        "✅ Maximum order volume validation PASSED",
      );

      passed++;
    } else {
      console.log(
        "❌ Maximum order volume validation FAILED",
      );

      failed++;
    }

    // ======================================================
    // Test 5 - Order Volume Rejection
    // ======================================================

    console.log(
      "\n--- TEST 5: ORDER VOLUME REJECTION ---",
    );

    const volumeRejected =
      await expectFailure(
        "Order volume above maximum",
        async () => {
          validateMaxOrderVolume({
            volume:
              getMaxOrderVolume() +
              1,
          });
        },
      );

    if (volumeRejected) {
      passed++;
    } else {
      failed++;
    }

    // ======================================================
    // Test 6 - Symbol Volume
    // ======================================================

    console.log(
      "\n--- TEST 6: SYMBOL VOLUME LIMIT ---",
    );

    const symbolResult =
      await client.query(
        `
        SELECT
          id,
          symbol,
          max_lot
        FROM symbols
        WHERE is_active = true
        ORDER BY symbol
        LIMIT 1
        `,
      );

    if (
      !symbolResult.rows.length
    ) {
      throw new Error(
        "No active symbol found for symbol-volume test.",
      );
    }

    const symbol =
      symbolResult.rows[0];

    console.log(
      "Testing symbol:",
      symbol.symbol,
    );

    const symbolVolumeResult =
      await validateSymbolVolumeLimit({
        client,
        accountId: ACCOUNT_ID,
        symbolId: symbol.id,
        volume: 0.01,
        symbolMaxLot: symbol.max_lot,
      });

    console.log(
      "Existing symbol volume:",
      symbolVolumeResult.existingSymbolVolume,
    );

    console.log(
      "New volume:",
      symbolVolumeResult.newOrderVolume,
    );

    console.log(
      "Total symbol volume:",
      symbolVolumeResult.totalSymbolVolume,
    );

    console.log(
      "Maximum symbol volume:",
      symbolVolumeResult.maxSymbolVolume,
    );

    if (
      symbolVolumeResult.allowed ===
      true
    ) {
      console.log(
        "✅ Symbol volume validation PASSED",
      );

      passed++;
    } else {
      console.log(
        "❌ Symbol volume validation FAILED",
      );

      failed++;
    }

    // ======================================================
    // Test 7 - Account Exposure / Leverage
    // ======================================================

    console.log(
      "\n--- TEST 7: ACCOUNT EXPOSURE / LEVERAGE ---",
    );

    const accountResult =
      await client.query(
        `
        SELECT
          id,
          equity
        FROM accounts
        WHERE id = $1
          AND status = 'active'
        `,
        [ACCOUNT_ID],
      );

    if (
      !accountResult.rows.length
    ) {
      throw new Error(
        "Trading account not found for leverage test.",
      );
    }

    const account =
      accountResult.rows[0];

    const leverageResult =
      await validateAccountExposureLeverage({
        client,
        accountId: ACCOUNT_ID,
        equity: account.equity,
        newOrderExposure: 3400,
      });

    console.log(
      "Account equity:",
      leverageResult.equity,
    );

    console.log(
      "Existing exposure:",
      leverageResult.existingExposure,
    );

    console.log(
      "New order exposure:",
      leverageResult.newOrderExposure,
    );

    console.log(
      "Total exposure:",
      leverageResult.totalExposure,
    );

    console.log(
      "Exposure leverage:",
      leverageResult.exposureLeverage,
    );

    console.log(
      "Maximum exposure leverage:",
      leverageResult.maxExposureLeverage,
    );

    if (
      leverageResult.allowed ===
      true
    ) {
      console.log(
        "✅ Account exposure/leverage validation PASSED",
      );

      passed++;
    } else {
      console.log(
        "❌ Account exposure/leverage validation FAILED",
      );

      failed++;
    }

    // ======================================================
    // Test 8 - Exposure / Leverage Rejection
    // ======================================================

    console.log(
      "\n--- TEST 8: EXPOSURE / LEVERAGE REJECTION ---",
    );

    const leverageRejected =
      await expectFailure(
        "Exposure leverage above maximum",
        async () => {
          await validateAccountExposureLeverage({
            client,
            accountId:
              ACCOUNT_ID,
            equity: 1000,
            newOrderExposure:
              200000,
          });
        },
      );

    if (leverageRejected) {
      passed++;
    } else {
      failed++;
    }

    // ======================================================
    // Final Result
    // ======================================================

    console.log(
      "\n==============================================",
    );

    console.log(
      "PHASE 15.4 RISK LIMIT TEST RESULT",
    );

    console.log(
      "==============================================",
    );

    console.log(
      "Tests Passed:",
      passed,
    );

    console.log(
      "Tests Failed:",
      failed,
    );

    console.log(
      "==============================================\n",
    );

    if (failed > 0) {
      throw new Error(
        `Risk limit tests failed: ${failed}`,
      );
    }

    console.log(
      "🎉 PHASE 15.4 RISK LIMITS COMPLETE",
    );

    console.log(
      "All risk-limit tests passed successfully.",
    );

    console.log(
      "\n==============================================\n",
    );
  } catch (error) {
    console.error(
      "\n❌ PHASE 15.4 TEST FAILED:",
    );

    console.error(
      error.message,
    );

    process.exitCode = 1;
  } finally {
    client.release();

    await pool.end();
  }
}

runTest();idempotency.service.js