
const { pool } = require("../config/database");

const { validateRiskLimits } = require("./risk-limit.service");

const {
  normalizeIdempotencyKey,
  createRequestHash,
  getIdempotencyRecord,
  createIdempotencyRecord,
  completeIdempotencyRecord,
} = require("./idempotency.service");

const PROVIDER_BRIDGE_URL =
  process.env.PROVIDER_BRIDGE_URL || "http://localhost:5003";

/**
 * Execute order through Provider Bridge
 */
async function executeProviderOrder({
  symbol,
  side,
  volume,
  stopLoss = null,
  takeProfit = null,
}) {
  const providerUrl = PROVIDER_BRIDGE_URL + "/internal/orders";

  let response;

  try {
    response = await fetch(providerUrl, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "x-provider-secret": process.env.PROVIDER_INTERNAL_SECRET,
      },

      body: JSON.stringify({
        symbol: String(symbol).toUpperCase(),
        side: String(side).toUpperCase(),
        volume: Number(volume),
        stopLoss,
        takeProfit,
      }),
    });
  } catch (error) {
    const providerError = new Error(
      `Provider Bridge unavailable at ${providerUrl}. Start the Provider Bridge and try again. ${error.message}`,
    );

    providerError.statusCode = 503;
    throw providerError;
  }

  let result;

  try {
    result = await response.json();
  } catch (error) {
    throw new Error("Invalid response from Provider Bridge.");
  }

  if (!response.ok || !result.success) {
    throw new Error(
      result.message ||
        "Provider execution failed with HTTP " + response.status,
    );
  }

  const providerResult = result.data;

  if (!providerResult) {
    throw new Error("Provider Bridge returned empty execution data.");
  }

  if (providerResult.status !== "filled") {
    throw new Error(
      "Provider order was not filled. Status: " + providerResult.status,
    );
  }

  return providerResult;
}

/**
 * Execute Market Order
 */
async function executeMarketOrder({
  userId,
  symbol,
  side,
  volume,
  stopLoss = null,
  takeProfit = null,
  idempotencyKey,
}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // =====================================================
    // 1. Normalize Idempotency Key
    // =====================================================

    const normalizedIdempotencyKey =
      normalizeIdempotencyKey(idempotencyKey);

    // =====================================================
    // 2. Create Request Hash
    // =====================================================

    const requestHash = createRequestHash({
      symbol,
      side,
      volume,
      stopLoss,
      takeProfit,
    });

    // =====================================================
    // 3. Lock Trading Account
    // =====================================================

    // IMPORTANT:
    // Do NOT filter by status here.
    // We need to distinguish:
    // - account not found
    // - account inactive
    // - account suspended
    // - account closed

    const accountResult = await client.query(
      [
        "SELECT *",
        "FROM accounts",
        "WHERE user_id = $1",
        "FOR UPDATE",
        "LIMIT 1",
      ].join(" "),
      [userId],
    );

    if (!accountResult.rows.length) {
      throw new Error("Trading account not found");
    }

    const account = accountResult.rows[0];

    // =====================================================
    // 3.1 Account Status Validation
    // =====================================================

    if (account.status !== "active") {
      throw new Error(
        `Trading account is ${account.status} and cannot place orders.`,
      );
    }

    // =====================================================
    // 4. Idempotency Check
    // =====================================================

    let idempotencyRecord = null;

    if (normalizedIdempotencyKey) {
      idempotencyRecord = await getIdempotencyRecord({
        client,
        accountId: account.id,
        idempotencyKey: normalizedIdempotencyKey,
      });

      if (idempotencyRecord) {
        if (idempotencyRecord.request_hash !== requestHash) {
          throw new Error(
            "Idempotency-Key has already been used with a different order request.",
          );
        }

        if (idempotencyRecord.status === "completed") {
          const replayedResponse =
            idempotencyRecord.response_body;

          await client.query("COMMIT");

          return {
            ...(replayedResponse || {}),
            idempotent: true,
            replayed: true,
          };
        }

        if (idempotencyRecord.status === "processing") {
          throw new Error(
            "This order request is already being processed.",
          );
        }
      }
    }

    // =====================================================
// 5. Lock Symbol
// =====================================================

const symbolResult = await client.query(
  [
    "SELECT *",
    "FROM symbols",
    "WHERE UPPER(symbol) = UPPER($1)",
    "FOR UPDATE",
    "LIMIT 1",
  ].join(" "),
  [symbol],
);

if (!symbolResult.rows.length) {
  throw new Error("Symbol not found");
}

const instrument = symbolResult.rows[0];

// =====================================================
// 5.1 Market Availability Validation
// =====================================================

if (!instrument.is_active) {
  throw new Error(
    `Symbol ${instrument.symbol} is currently unavailable for trading.`,
  );
}

    // =====================================================
    // 6. Side Validation
    // =====================================================

    const normalizedSide = String(side || "")
      .trim()
      .toLowerCase();

    if (normalizedSide !== "buy" && normalizedSide !== "sell") {
      throw new Error("side must be BUY or SELL.");
    }

    // =====================================================
    // 7. Volume Validation
    // =====================================================

    const normalizedVolume = Number(volume);

    if (
      !Number.isFinite(normalizedVolume) ||
      normalizedVolume <= 0
    ) {
      throw new Error("Volume must be a positive number.");
    }

    const minLot = Number(instrument.min_lot);
    const maxLot = Number(instrument.max_lot);

    if (!Number.isFinite(minLot) || minLot <= 0) {
      throw new Error(
        "Invalid symbol minimum lot configuration.",
      );
    }

    if (!Number.isFinite(maxLot) || maxLot < minLot) {
      throw new Error(
        "Invalid symbol maximum lot configuration.",
      );
    }

    if (
      normalizedVolume < minLot ||
      normalizedVolume > maxLot
    ) {
      throw new Error(
        "Volume must be between " +
          minLot +
          " and " +
          maxLot +
          ".",
      );
    }

    // =====================================================
    // 8. Lot Step Validation
    // =====================================================

    const lotStep = Number(instrument.lot_step);

    if (!Number.isFinite(lotStep) || lotStep <= 0) {
      throw new Error(
        "Invalid symbol lot step configuration.",
      );
    }

    const lotStepRatio = normalizedVolume / lotStep;
    const lotStepTolerance = 0.000001;

    if (
      Math.abs(
        lotStepRatio - Math.round(lotStepRatio),
      ) > lotStepTolerance
    ) {
      throw new Error(
        "Volume must be in increments of " +
          lotStep +
          ".",
      );
    }

    // =====================================================
    // 9. Current Execution Price
    // =====================================================

    let executionPrice;

    if (normalizedSide === "buy") {
      executionPrice = Number(instrument.ask);
    } else {
      executionPrice = Number(instrument.bid);
    }

    if (
      !Number.isFinite(executionPrice) ||
      executionPrice <= 0
    ) {
      throw new Error("Invalid execution price.");
    }

    // =====================================================
    // 10. Normalize SL / TP
    // =====================================================

    let normalizedStopLoss = null;
    let normalizedTakeProfit = null;

    if (
      stopLoss !== null &&
      stopLoss !== undefined &&
      stopLoss !== ""
    ) {
      normalizedStopLoss = Number(stopLoss);
    }

    if (
      takeProfit !== null &&
      takeProfit !== undefined &&
      takeProfit !== ""
    ) {
      normalizedTakeProfit = Number(takeProfit);
    }

    // =====================================================
    // 11. SL Numeric Validation
    // =====================================================

    if (
      normalizedStopLoss !== null &&
      !Number.isFinite(normalizedStopLoss)
    ) {
      throw new Error("Invalid stop loss.");
    }

    // =====================================================
    // 12. TP Numeric Validation
    // =====================================================

    if (
      normalizedTakeProfit !== null &&
      !Number.isFinite(normalizedTakeProfit)
    ) {
      throw new Error("Invalid take profit.");
    }

    // =====================================================
    // 13. Stop Loss Validation
    // =====================================================

    if (normalizedStopLoss !== null) {
      if (normalizedStopLoss <= 0) {
        throw new Error(
          "Stop loss must be greater than 0.",
        );
      }

      if (
        normalizedSide === "buy" &&
        normalizedStopLoss >= executionPrice
      ) {
        throw new Error(
          "For BUY orders, stop loss must be below the execution price.",
        );
      }

      if (
        normalizedSide === "sell" &&
        normalizedStopLoss <= executionPrice
      ) {
        throw new Error(
          "For SELL orders, stop loss must be above the execution price.",
        );
      }
    }

    // =====================================================
    // 14. Take Profit Validation
    // =====================================================

    if (normalizedTakeProfit !== null) {
      if (normalizedTakeProfit <= 0) {
        throw new Error(
          "Take profit must be greater than 0.",
        );
      }

      if (
        normalizedSide === "buy" &&
        normalizedTakeProfit <= executionPrice
      ) {
        throw new Error(
          "For BUY orders, take profit must be above the execution price.",
        );
      }

      if (
        normalizedSide === "sell" &&
        normalizedTakeProfit >= executionPrice
      ) {
        throw new Error(
          "For SELL orders, take profit must be below the execution price.",
        );
      }
    }

    // =====================================================
    // 15. Risk Limits
    // =====================================================

    const riskResult = await validateRiskLimits({
      client,
      account,
      instrument,
      volume: normalizedVolume,
      executionPrice,
    });

    console.log("[RISK] All risk limits passed:", {
      openPositions:
        riskResult.openPositions.openPositions,

      maxOpenPositions:
        riskResult.openPositions.maxOpenPositions,

      orderVolume:
        riskResult.orderVolume.volume,

      maxOrderVolume:
        riskResult.orderVolume.maxOrderVolume,

      newOrderExposure:
        riskResult.totalExposure.newOrderExposure,

      totalExposure:
        riskResult.totalExposure.totalExposure,

      maxTotalExposure:
        riskResult.totalExposure.maxTotalExposure,

      exposureLeverage:
        riskResult.accountExposure.exposureLeverage,

      maxExposureLeverage:
        riskResult.accountExposure.maxExposureLeverage,
    });

    // =====================================================
    // 16. Margin Calculation
    // =====================================================

    const contractSize =
      Number(instrument.contract_size);

    const leverage = Number(account.leverage);

    if (
      !Number.isFinite(contractSize) ||
      contractSize <= 0
    ) {
      throw new Error("Invalid contract size.");
    }

    if (!Number.isFinite(leverage) || leverage <= 0) {
      throw new Error("Invalid account leverage.");
    }

    const marginRequired =
      (normalizedVolume *
        contractSize *
        executionPrice) /
      leverage;

    const freeMargin = Number(account.free_margin);

    if (!Number.isFinite(marginRequired)) {
      throw new Error("Invalid margin calculation.");
    }

    if (marginRequired > freeMargin) {
      throw new Error(
        "Insufficient free margin. Required: " +
          marginRequired.toFixed(2) +
          ", Available: " +
          freeMargin.toFixed(2),
      );
    }

    // =====================================================
    // 17. Create Idempotency Record
    // =====================================================

    if (normalizedIdempotencyKey) {
      idempotencyRecord =
        await createIdempotencyRecord({
          client,
          accountId: account.id,
          idempotencyKey:
            normalizedIdempotencyKey,
          requestHash,
        });
    }

    // =====================================================
    // 18. Create Pending Order
    // =====================================================

    const orderResult = await client.query(
      [
        "INSERT INTO orders (",
        "account_id,",
        "symbol_id,",
        "side,",
        "order_type,",
        "volume,",
        "price,",
        "stop_loss,",
        "take_profit,",
        "status",
        ")",
        "VALUES (",
        "$1,",
        "$2,",
        "$3,",
        "'market',",
        "$4,",
        "$5,",
        "$6,",
        "$7,",
        "'pending'",
        ")",
        "RETURNING *",
      ].join(" "),
      [
        account.id,
        instrument.id,
        normalizedSide,
        normalizedVolume,
        executionPrice,
        normalizedStopLoss,
        normalizedTakeProfit,
      ],
    );

    const order = orderResult.rows[0];

    // =====================================================
    // 19. Provider Execution
    // =====================================================

    const providerResult =
      await executeProviderOrder({
        symbol: instrument.symbol,
        side: normalizedSide,
        volume: normalizedVolume,
        stopLoss: normalizedStopLoss,
        takeProfit: normalizedTakeProfit,
      });

    const providerOrderId =
      providerResult.providerOrderId || null;

    // =====================================================
    // 20. Provider Filled Price
    // =====================================================

    const providerFilledPrice = Number(
      providerResult.filledPrice ??
        providerResult.executionPrice ??
        executionPrice,
    );

    if (
      !Number.isFinite(providerFilledPrice) ||
      providerFilledPrice <= 0
    ) {
      throw new Error(
        "Provider returned invalid filled price.",
      );
    }

    // =====================================================
    // 21. Fill Order
    // =====================================================

    const filledOrderResult = await client.query(
      [
        "UPDATE orders",
        "SET",
        "status = 'filled',",
        "filled_price = $1,",
        "filled_volume = $2,",
        "provider_order_id = $3,",
        "updated_at = NOW()",
        "WHERE id = $4",
        "RETURNING *",
      ].join(" "),
      [
        providerFilledPrice,
        normalizedVolume,
        providerOrderId,
        order.id,
      ],
    );

    if (!filledOrderResult.rows.length) {
      throw new Error("Failed to fill order.");
    }

    const filledOrder =
      filledOrderResult.rows[0];

    // =====================================================
    // 22. Create Position
    // =====================================================

    const positionResult = await client.query(
      [
        "INSERT INTO positions (",
        "account_id,",
        "symbol_id,",
        "side,",
        "volume,",
        "entry_price,",
        "current_price,",
        "stop_loss,",
        "take_profit,",
        "unrealized_pnl,",
        "margin_used,",
        "status",
        ")",
        "VALUES (",
        "$1,",
        "$2,",
        "$3,",
        "$4,",
        "$5,",
        "$5,",
        "$6,",
        "$7,",
        "0,",
        "$8,",
        "'open'",
        ")",
        "RETURNING *",
      ].join(" "),
      [
        account.id,
        instrument.id,
        normalizedSide,
        normalizedVolume,
        providerFilledPrice,
        normalizedStopLoss,
        normalizedTakeProfit,
        marginRequired,
      ],
    );

    const position =
      positionResult.rows[0];

    // =====================================================
    // 23. Create Trade
    // =====================================================

    const tradeResult = await client.query(
      [
        "INSERT INTO trades (",
        "order_id,",
        "account_id,",
        "symbol_id,",
        "side,",
        "volume,",
        "execution_price,",
        "commission,",
        "swap,",
        "realized_pnl",
        ")",
        "VALUES (",
        "$1,",
        "$2,",
        "$3,",
        "$4,",
        "$5,",
        "$6,",
        "0,",
        "0,",
        "0",
        ")",
        "RETURNING *",
      ].join(" "),
      [
        filledOrder.id,
        account.id,
        instrument.id,
        normalizedSide,
        normalizedVolume,
        providerFilledPrice,
      ],
    );

    const trade =
      tradeResult.rows[0];

    // =====================================================
    // 24. Update Account Margin
    // =====================================================

    const newMargin =
      Number(account.margin) +
      marginRequired;

    const newFreeMargin =
      Number(account.free_margin) -
      marginRequired;

    const updatedAccountResult =
      await client.query(
        [
          "UPDATE accounts",
          "SET",
          "margin = $1,",
          "free_margin = $2,",
          "updated_at = NOW()",
          "WHERE id = $3",
          "RETURNING *",
        ].join(" "),
        [
          newMargin,
          newFreeMargin,
          account.id,
        ],
      );

    const updatedAccount =
      updatedAccountResult.rows[0];

    // =====================================================
    // 25. Response
    // =====================================================

    const responseData = {
      order: filledOrder,

      position,

      trade,

      provider: {
        provider: providerResult.provider,
        providerOrderId,
        status: providerResult.status,
      },

      marginRequired,

      account: {
        margin: Number(
          updatedAccount.margin,
        ),

        freeMargin: Number(
          updatedAccount.free_margin,
        ),
      },
    };

    // =====================================================
    // 26. Complete Idempotency
    // =====================================================

    if (idempotencyRecord) {
      await completeIdempotencyRecord({
        client,
        idempotencyId:
          idempotencyRecord.id,
        responseStatus: 201,
        responseBody: responseData,
      });
    }

    // =====================================================
    // 27. Commit
    // =====================================================

    await client.query("COMMIT");

    console.log(
      "[TRADING ENGINE] Market order completed:",
      {
        orderId: filledOrder.id,
        positionId: position.id,
        tradeId: trade.id,
        providerOrderId,
        symbol: instrument.symbol,
        side: normalizedSide,
        volume: normalizedVolume,
      },
    );

    return responseData;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error(
        "[TRADING ENGINE] Rollback failed:",
        rollbackError.message,
      );
    }

    console.error(
      "[TRADING ENGINE] Order execution failed:",
      error.message,
    );

    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  executeMarketOrder,
};