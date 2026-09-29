/**
 * ============================================================
 * TRADEX - RISK LIMIT SERVICE
 * PHASE 15.4 - RISK LIMITS
 * ============================================================
 *
 * Covers:
 *
 * 15.4.1 Maximum Open Positions
 * 15.4.2 Maximum Total Exposure
 * 15.4.3 Maximum Order Volume
 * 15.4.4 Symbol Volume Limits
 * 15.4.5 Account Exposure / Leverage Limit
 * 15.4.6 Central Risk Validation
 * 15.4.7 Risk Error Handling
 *
 * IMPORTANT:
 * All database validations must use the transaction client
 * passed from trading.service.js.
 * ============================================================
 */


/**
 * ============================================================
 * 15.4.1 MAXIMUM OPEN POSITIONS
 * ============================================================
 */

function getMaxOpenPositions() {
  const limit = Number(
    process.env.MAX_OPEN_POSITIONS || 10,
  );

  if (
    !Number.isInteger(limit) ||
    limit <= 0
  ) {
    throw new Error(
      "Invalid MAX_OPEN_POSITIONS configuration.",
    );
  }

  return limit;
}


async function validateMaxOpenPositions({
  client,
  accountId,
}) {
  if (!client) {
    throw new Error(
      "Database transaction client is required.",
    );
  }

  if (!accountId) {
    throw new Error(
      "Account ID is required.",
    );
  }

  const maxOpenPositions =
    getMaxOpenPositions();

  const result = await client.query(
    `
    SELECT COUNT(*) AS open_positions
    FROM positions
    WHERE account_id = $1
      AND status = 'open'
    `,
    [accountId],
  );

  const openPositions = Number(
    result.rows[0].open_positions,
  );

  if (
    openPositions >=
    maxOpenPositions
  ) {
    throw new Error(
      `Maximum open positions limit reached. ` +
      `Limit: ${maxOpenPositions}`,
    );
  }

  return {
    allowed: true,
    openPositions,
    maxOpenPositions,
    remaining:
      maxOpenPositions -
      openPositions,
  };
}


/**
 * ============================================================
 * 15.4.2 MAXIMUM TOTAL EXPOSURE
 * ============================================================
 *
 * Exposure = volume × contract_size × price
 *
 * Existing open positions + new order exposure
 * must remain below MAX_TOTAL_EXPOSURE.
 * ============================================================
 */

function getMaxTotalExposure() {
  const limit = Number(
    process.env.MAX_TOTAL_EXPOSURE ||
      1000000,
  );

  if (
    !Number.isFinite(limit) ||
    limit <= 0
  ) {
    throw new Error(
      "Invalid MAX_TOTAL_EXPOSURE configuration.",
    );
  }

  return limit;
}


function calculateExposure({
  volume,
  contractSize,
  price,
}) {
  const normalizedVolume =
    Number(volume);

  const normalizedContractSize =
    Number(contractSize);

  const normalizedPrice =
    Number(price);

  if (
    !Number.isFinite(
      normalizedVolume,
    ) ||
    normalizedVolume <= 0
  ) {
    throw new Error(
      "Invalid exposure volume.",
    );
  }

  if (
    !Number.isFinite(
      normalizedContractSize,
    ) ||
    normalizedContractSize <= 0
  ) {
    throw new Error(
      "Invalid exposure contract size.",
    );
  }

  if (
    !Number.isFinite(
      normalizedPrice,
    ) ||
    normalizedPrice <= 0
  ) {
    throw new Error(
      "Invalid exposure price.",
    );
  }

  return (
    normalizedVolume *
    normalizedContractSize *
    normalizedPrice
  );
}


async function getOpenExposure({
  client,
  accountId,
}) {
  if (!client) {
    throw new Error(
      "Database transaction client is required.",
    );
  }

  if (!accountId) {
    throw new Error(
      "Account ID is required.",
    );
  }

  const result = await client.query(
    `
    SELECT
      p.id,
      p.side,
      p.volume,
      p.entry_price,
      p.current_price,
      s.symbol,
      s.contract_size,
      s.bid,
      s.ask
    FROM positions p
    JOIN symbols s
      ON s.id = p.symbol_id
    WHERE p.account_id = $1
      AND p.status = 'open'
    FOR UPDATE
    `,
    [accountId],
  );

  let totalExposure = 0;

  const positions =
    result.rows.map(
      (position) => {
        const side =
          String(
            position.side,
          ).toLowerCase();

        const currentPrice =
          side === "buy"
            ? Number(position.bid)
            : Number(position.ask);

        const exposure =
          calculateExposure({
            volume:
              position.volume,
            contractSize:
              position.contract_size,
            price:
              currentPrice,
          });

        totalExposure +=
          exposure;

        return {
          positionId:
            position.id,
          symbol:
            position.symbol,
          side,
          volume:
            Number(position.volume),
          price:
            currentPrice,
          exposure,
        };
      },
    );

  return {
    totalExposure,
    positions,
  };
}


async function validateMaxTotalExposure({
  client,
  accountId,
  volume,
  contractSize,
  price,
}) {
  if (!client) {
    throw new Error(
      "Database transaction client is required.",
    );
  }

  if (!accountId) {
    throw new Error(
      "Account ID is required.",
    );
  }

  const maxTotalExposure =
    getMaxTotalExposure();

  const existingExposure =
    await getOpenExposure({
      client,
      accountId,
    });

  const newOrderExposure =
    calculateExposure({
      volume,
      contractSize,
      price,
    });

  const totalExposure =
    existingExposure.totalExposure +
    newOrderExposure;

  if (
    totalExposure >
    maxTotalExposure
  ) {
    throw new Error(
      `Maximum total exposure limit exceeded. ` +
      `Limit: ${maxTotalExposure.toFixed(2)}, ` +
      `Current: ${existingExposure.totalExposure.toFixed(2)}, ` +
      `New order: ${newOrderExposure.toFixed(2)}`,
    );
  }

  return {
    allowed: true,

    maxTotalExposure,

    existingExposure:
      existingExposure.totalExposure,

    newOrderExposure,

    totalExposure,

    remainingExposure:
      maxTotalExposure -
      totalExposure,
  };
}


/**
 * ============================================================
 * 15.4.3 MAXIMUM ORDER VOLUME
 * ============================================================
 */

function getMaxOrderVolume() {
  const limit = Number(
    process.env.MAX_ORDER_VOLUME ||
      10,
  );

  if (
    !Number.isFinite(limit) ||
    limit <= 0
  ) {
    throw new Error(
      "Invalid MAX_ORDER_VOLUME configuration.",
    );
  }

  return limit;
}


function validateMaxOrderVolume({
  volume,
}) {
  const normalizedVolume =
    Number(volume);

  if (
    !Number.isFinite(
      normalizedVolume,
    ) ||
    normalizedVolume <= 0
  ) {
    throw new Error(
      "Invalid order volume.",
    );
  }

  const maxOrderVolume =
    getMaxOrderVolume();

  if (
    normalizedVolume >
    maxOrderVolume
  ) {
    throw new Error(
      `Maximum order volume exceeded. ` +
      `Limit: ${maxOrderVolume}`,
    );
  }

  return {
    allowed: true,
    volume:
      normalizedVolume,
    maxOrderVolume,
    remaining:
      maxOrderVolume -
      normalizedVolume,
  };
}


/**
 * ============================================================
 * 15.4.4 SYMBOL VOLUME LIMIT
 * ============================================================
 *
 * Two protections:
 *
 * 1. Symbol's own database max_lot
 * 2. Account-level cumulative volume per symbol
 *
 * Example:
 * XAUUSD cumulative volume limit = 10 lots
 * ============================================================
 */

function getMaxSymbolVolume() {
  const limit = Number(
    process.env.MAX_SYMBOL_VOLUME ||
      10,
  );

  if (
    !Number.isFinite(limit) ||
    limit <= 0
  ) {
    throw new Error(
      "Invalid MAX_SYMBOL_VOLUME configuration.",
    );
  }

  return limit;
}


async function validateSymbolVolumeLimit({
  client,
  accountId,
  symbolId,
  volume,
  symbolMaxLot,
}) {
  if (!client) {
    throw new Error(
      "Database transaction client is required.",
    );
  }

  if (!accountId) {
    throw new Error(
      "Account ID is required.",
    );
  }

  if (!symbolId) {
    throw new Error(
      "Symbol ID is required.",
    );
  }

  const normalizedVolume =
    Number(volume);

  if (
    !Number.isFinite(
      normalizedVolume,
    ) ||
    normalizedVolume <= 0
  ) {
    throw new Error(
      "Invalid symbol volume.",
    );
  }

  // Database-defined symbol limit
  if (
    symbolMaxLot !== undefined &&
    symbolMaxLot !== null
  ) {
    const databaseMaxLot =
      Number(symbolMaxLot);

    if (
      Number.isFinite(
        databaseMaxLot,
      ) &&
      normalizedVolume >
        databaseMaxLot
    ) {
      throw new Error(
        `Volume exceeds symbol maximum lot size. ` +
        `Limit: ${databaseMaxLot}`,
      );
    }
  }

  // Account cumulative symbol volume
  const maxSymbolVolume =
    getMaxSymbolVolume();

  const result = await client.query(
    `
    SELECT
      COALESCE(
        SUM(volume),
        0
      ) AS symbol_volume
    FROM positions
    WHERE account_id = $1
      AND symbol_id = $2
      AND status = 'open'
    `,
    [
      accountId,
      symbolId,
    ],
  );

  const existingSymbolVolume =
    Number(
      result.rows[0]
        .symbol_volume,
    );

  const totalSymbolVolume =
    existingSymbolVolume +
    normalizedVolume;

  if (
    totalSymbolVolume >
    maxSymbolVolume
  ) {
    throw new Error(
      `Maximum symbol volume exceeded. ` +
      `Limit: ${maxSymbolVolume}, ` +
      `Current: ${existingSymbolVolume}, ` +
      `New order: ${normalizedVolume}`,
    );
  }

  return {
    allowed: true,

    existingSymbolVolume,

    newOrderVolume:
      normalizedVolume,

    totalSymbolVolume,

    maxSymbolVolume,

    remaining:
      maxSymbolVolume -
      totalSymbolVolume,
  };
}


/**
 * ============================================================
 * 15.4.5 ACCOUNT EXPOSURE / LEVERAGE LIMIT
 * ============================================================
 *
 * Exposure / Equity = effective exposure leverage
 *
 * Example:
 *
 * Exposure = $100,000
 * Equity   = $10,000
 *
 * Exposure leverage = 10x
 *
 * ============================================================
 */

function getMaxExposureLeverage() {
  const limit = Number(
    process.env.MAX_EXPOSURE_LEVERAGE ||
      100,
  );

  if (
    !Number.isFinite(limit) ||
    limit <= 0
  ) {
    throw new Error(
      "Invalid MAX_EXPOSURE_LEVERAGE configuration.",
    );
  }

  return limit;
}


async function validateAccountExposureLeverage({
  client,
  accountId,
  equity,
  newOrderExposure,
}) {
  if (!client) {
    throw new Error(
      "Database transaction client is required.",
    );
  }

  if (!accountId) {
    throw new Error(
      "Account ID is required.",
    );
  }

  const normalizedEquity =
    Number(equity);

  if (
    !Number.isFinite(
      normalizedEquity,
    ) ||
    normalizedEquity <= 0
  ) {
    throw new Error(
      "Account equity must be greater than zero.",
    );
  }

  const normalizedNewExposure =
    Number(newOrderExposure);

  if (
    !Number.isFinite(
      normalizedNewExposure,
    ) ||
    normalizedNewExposure < 0
  ) {
    throw new Error(
      "Invalid new order exposure.",
    );
  }

  const openExposure =
    await getOpenExposure({
      client,
      accountId,
    });

  const totalExposure =
    openExposure.totalExposure +
    normalizedNewExposure;

  const exposureLeverage =
    totalExposure /
    normalizedEquity;

  const maxExposureLeverage =
    getMaxExposureLeverage();

  if (
    exposureLeverage >
    maxExposureLeverage
  ) {
    throw new Error(
      `Account exposure leverage limit exceeded. ` +
      `Limit: ${maxExposureLeverage}x, ` +
      `Current: ${exposureLeverage.toFixed(2)}x`,
    );
  }

  return {
    allowed: true,

    equity:
      normalizedEquity,

    existingExposure:
      openExposure.totalExposure,

    newOrderExposure:
      normalizedNewExposure,

    totalExposure,

    exposureLeverage,

    maxExposureLeverage,

    remainingExposureLeverage:
      Math.max(
        0,
        maxExposureLeverage -
          exposureLeverage,
      ),
  };
}


/**
 * ============================================================
 * 15.4.6 CENTRAL RISK VALIDATION
 * ============================================================
 *
 * This function allows trading.service.js to perform
 * all risk checks through one function.
 *
 * IMPORTANT:
 * Account row must already be locked with:
 *
 * SELECT ... FOR UPDATE
 *
 * before calling this function.
 * ============================================================
 */

async function validateRiskLimits({
  client,
  account,
  instrument,
  volume,
  executionPrice,
}) {
  if (!client) {
    throw new Error(
      "Database transaction client is required.",
    );
  }

  if (!account) {
    throw new Error(
      "Trading account is required.",
    );
  }

  if (!instrument) {
    throw new Error(
      "Trading instrument is required.",
    );
  }

  const normalizedVolume =
    Number(volume);

  const normalizedPrice =
    Number(executionPrice);

  if (
    !Number.isFinite(
      normalizedVolume,
    ) ||
    normalizedVolume <= 0
  ) {
    throw new Error(
      "Invalid order volume.",
    );
  }

  if (
    !Number.isFinite(
      normalizedPrice,
    ) ||
    normalizedPrice <= 0
  ) {
    throw new Error(
      "Invalid execution price.",
    );
  }

  // ----------------------------------------------------------
  // 1. Maximum open positions
  // ----------------------------------------------------------

  const openPositionRisk =
    await validateMaxOpenPositions({
      client,
      accountId:
        account.id,
    });

  // ----------------------------------------------------------
  // 2. Maximum order volume
  // ----------------------------------------------------------

  const orderVolumeRisk =
    validateMaxOrderVolume({
      volume:
        normalizedVolume,
    });

  // ----------------------------------------------------------
  // 3. Symbol volume
  // ----------------------------------------------------------

  const symbolVolumeRisk =
    await validateSymbolVolumeLimit({
      client,
      accountId:
        account.id,
      symbolId:
        instrument.id,
      volume:
        normalizedVolume,
      symbolMaxLot:
        instrument.max_lot,
    });

  // ----------------------------------------------------------
  // 4. New order exposure
  // ----------------------------------------------------------

  const newOrderExposure =
    calculateExposure({
      volume:
        normalizedVolume,
      contractSize:
        instrument.contract_size,
      price:
        normalizedPrice,
    });

  // ----------------------------------------------------------
  // 5. Maximum total exposure
  // ----------------------------------------------------------

  const totalExposureRisk =
    await validateMaxTotalExposure({
      client,
      accountId:
        account.id,
      volume:
        normalizedVolume,
      contractSize:
        instrument.contract_size,
      price:
        normalizedPrice,
    });

  // ----------------------------------------------------------
  // 6. Account exposure / leverage
  // ----------------------------------------------------------

  const accountLeverageRisk =
    await validateAccountExposureLeverage({
      client,
      accountId:
        account.id,
      equity:
        account.equity,
      newOrderExposure,
    });

  return {
    allowed: true,

    openPositions:
      openPositionRisk,

    orderVolume:
      orderVolumeRisk,

    symbolVolume:
      symbolVolumeRisk,

    totalExposure:
      totalExposureRisk,

    accountExposure:
      accountLeverageRisk,
  };
}


/**
 * ============================================================
 * 15.4.7 RISK ERROR HANDLING
 * ============================================================
 *
 * Converts known risk errors into a structured object.
 * Trading service can use this for clean API responses/logs.
 * ============================================================
 */

function createRiskError({
  code,
  message,
  details = null,
}) {
  const error =
    new Error(message);

  error.name =
    "RiskLimitError";

  error.code =
    code;

  error.details =
    details;

  return error;
}


module.exports = {
  // 15.4.1
  getMaxOpenPositions,
  validateMaxOpenPositions,

  // 15.4.2
  getMaxTotalExposure,
  calculateExposure,
  getOpenExposure,
  validateMaxTotalExposure,

  // 15.4.3
  getMaxOrderVolume,
  validateMaxOrderVolume,

  // 15.4.4
  getMaxSymbolVolume,
  validateSymbolVolumeLimit,

  // 15.4.5
  getMaxExposureLeverage,
  validateAccountExposureLeverage,

  // 15.4.6
  validateRiskLimits,

  // 15.4.7
  createRiskError,
};