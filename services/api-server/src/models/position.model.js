const { pool } = require("../config/database");

async function createPosition({
  accountId,
  symbolId,
  side,
  volume,
  entryPrice,
  currentPrice,
  stopLoss,
  takeProfit,
  marginUsed
}) {
  const result = await pool.query(
    `
    INSERT INTO positions (
      account_id,
      symbol_id,
      side,
      volume,
      entry_price,
      current_price,
      stop_loss,
      take_profit,
      unrealized_pnl,
      margin_used,
      status
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
      0,
      $9,
      'open'
    )
    RETURNING *
    `,
    [
      accountId,
      symbolId,
      side,
      volume,
      entryPrice,
      currentPrice,
      stopLoss,
      takeProfit,
      marginUsed
    ]
  );

  return result.rows[0];
}

async function getOpenPositions(accountId) {
  const result = await pool.query(
    `
    SELECT
      p.*,
      s.symbol,
      s.name,
      s.contract_size,
      s.digits
    FROM positions p
    JOIN symbols s
      ON s.id = p.symbol_id
    WHERE p.account_id = $1
      AND p.status = 'open'
    ORDER BY p.opened_at DESC
    `,
    [accountId]
  );

  return result.rows;
}

async function getPositionById(positionId, accountId) {
  const result = await pool.query(
    `
    SELECT
      p.*,
      s.symbol,
      s.name,
      s.contract_size,
      s.digits
    FROM positions p
    JOIN symbols s
      ON s.id = p.symbol_id
    WHERE p.id = $1
      AND p.account_id = $2
    LIMIT 1
    `,
    [positionId, accountId]
  );

  return result.rows[0] || null;
}

async function getOpenPositionsBySymbol(symbol) {
  const result = await pool.query(
    `
    SELECT
      p.*,
      s.symbol,
      s.name,
      s.contract_size,
      s.digits
    FROM positions p
    JOIN symbols s
      ON s.id = p.symbol_id
    WHERE UPPER(s.symbol) = UPPER($1)
      AND p.status = 'open'
    ORDER BY p.opened_at DESC
    `,
    [symbol]
  );

  return result.rows;
}

async function getPositionHistory(accountId) {
  const result = await pool.query(
    `
    SELECT
      p.id,
      p.account_id,
      p.symbol_id,
      s.symbol,
      s.name,
      p.side,
      p.volume,
      p.entry_price,
      p.current_price,
      p.stop_loss,
      p.take_profit,
      p.unrealized_pnl,
      p.margin_used,
      p.status,
      p.opened_at,
      p.updated_at,
      p.closed_at
    FROM positions p
    JOIN symbols s
      ON s.id = p.symbol_id
    WHERE p.account_id = $1
    ORDER BY p.opened_at DESC
    `,
    [accountId]
  );

  return result.rows;
}

async function updatePositionPrice({
  positionId,
  currentPrice,
  unrealizedPnl
}) {
  const result = await pool.query(
    `
    UPDATE positions
    SET
      current_price = $1,
      unrealized_pnl = $2,
      updated_at = NOW()
    WHERE id = $3
      AND status = 'open'
    RETURNING *
    `,
    [
      currentPrice,
      unrealizedPnl,
      positionId
    ]
  );

  return result.rows[0] || null;
}

async function closePosition({
  positionId,
  closePrice,
  realizedPnl
}) {
  const result = await pool.query(
    `
    UPDATE positions
    SET
      current_price = $1,
      unrealized_pnl = 0,
      status = 'closed',
      closed_at = NOW(),
      updated_at = NOW()
    WHERE id = $2
      AND status = 'open'
    RETURNING *
    `,
    [
      closePrice,
      positionId
    ]
  );

  return result.rows[0] || null;
}

module.exports = {
  createPosition,
  getOpenPositions,
  getOpenPositionsBySymbol,
  getPositionById,
  updatePositionPrice,
  closePosition,
  getPositionHistory
};