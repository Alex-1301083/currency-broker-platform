const { pool } = require("../config/database");

async function createTrade({
  orderId,
  accountId,
  symbolId,
  side,
  volume,
  executionPrice,
  commission = 0,
  swap = 0,
  realizedPnl = 0
}) {
  const result = await pool.query(
    `
    INSERT INTO trades (
      order_id,
      account_id,
      symbol_id,
      side,
      volume,
      execution_price,
      commission,
      swap,
      realized_pnl
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
    `,
    [
      orderId,
      accountId,
      symbolId,
      side,
      volume,
      executionPrice,
      commission,
      swap,
      realizedPnl
    ]
  );

  return result.rows[0];
}

async function getTradesByAccount(accountId) {
  const result = await pool.query(
    `
    SELECT
      t.*,
      s.symbol,
      s.name
    FROM trades t
    JOIN symbols s
      ON s.id = t.symbol_id
    WHERE t.account_id = $1
    ORDER BY t.executed_at DESC
    `,
    [accountId]
  );

  return result.rows;
}


async function getTradeHistory(accountId) {
  const result = await pool.query(
    `
    SELECT
      t.id,
      t.order_id,
      t.account_id,
      t.symbol_id,
      s.symbol,
      s.name,
      t.side,
      t.volume,
      t.execution_price,
      t.commission,
      t.swap,
      t.realized_pnl,
      t.executed_at
    FROM trades t
    JOIN symbols s
      ON s.id = t.symbol_id
    WHERE t.account_id = $1
    ORDER BY t.executed_at DESC
    `,
    [accountId]
  );

  return result.rows;
}

module.exports = {
  createTrade,
  getTradesByAccount,
  getTradeHistory
};