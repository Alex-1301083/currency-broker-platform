const { pool } = require("../config/database");

async function getAllSymbols() {
  const result = await pool.query(`
    SELECT
      id,
      symbol,
      name,
      base_currency,
      quote_currency,
      asset_type,
      bid,
      ask,
      spread,
      digits,
      contract_size,
      min_lot,
      max_lot,
      is_active,
      created_at,
      updated_at
    FROM symbols
    WHERE is_active = true
    ORDER BY symbol ASC
  `);

  return result.rows;
}

async function getSymbolByName(symbol) {
  const result = await pool.query(
    `
    SELECT
      id,
      symbol,
      name,
      base_currency,
      quote_currency,
      asset_type,
      bid,
      ask,
      spread,
      digits,
      contract_size,
      min_lot,
      max_lot,
      is_active,
      created_at,
      updated_at
    FROM symbols
    WHERE UPPER(symbol) = UPPER($1)
    LIMIT 1
    `,
    [symbol]
  );

  return result.rows[0] || null;
}

async function createSymbol({
  symbol,
  name,
  baseCurrency,
  quoteCurrency,
  assetType = "forex",
  bid,
  ask,
  digits = 5,
  contractSize = 100000,
  minLot = 0.01,
  maxLot = 100
}) {
  const spread =
    bid !== undefined && ask !== undefined
      ? Number(ask) - Number(bid)
      : null;

  const result = await pool.query(
    `
    INSERT INTO symbols (
      symbol,
      name,
      base_currency,
      quote_currency,
      asset_type,
      bid,
      ask,
      spread,
      digits,
      contract_size,
      min_lot,
      max_lot
    )
    VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8,
      $9,
      $10,
      $11,
      $12
    )
    RETURNING
      id,
      symbol,
      name,
      base_currency,
      quote_currency,
      asset_type,
      bid,
      ask,
      spread,
      digits,
      contract_size,
      min_lot,
      max_lot,
      is_active,
      created_at,
      updated_at
    `,
    [
      symbol.toUpperCase(),
      name,
      baseCurrency,
      quoteCurrency,
      assetType,
      bid,
      ask,
      spread,
      digits,
      contractSize,
      minLot,
      maxLot
    ]
  );

  return result.rows[0];
}

async function updateSymbolPrice({
  symbol,
  bid,
  ask
}) {
  const spread = Number(ask) - Number(bid);

  const result = await pool.query(
    `
    UPDATE symbols
    SET
      bid = $1,
      ask = $2,
      spread = $3,
      updated_at = NOW()
    WHERE UPPER(symbol) = UPPER($4)
    RETURNING
      id,
      symbol,
      name,
      base_currency,
      quote_currency,
      asset_type,
      bid,
      ask,
      spread,
      digits,
      contract_size,
      min_lot,
      max_lot,
      is_active,
      created_at,
      updated_at
    `,
    [
      bid,
      ask,
      spread,
      symbol
    ]
  );

  return result.rows[0] || null;
}

module.exports = {
  getAllSymbols,
  getSymbolByName,
  createSymbol,
  updateSymbolPrice
};