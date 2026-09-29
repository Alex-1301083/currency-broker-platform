const { pool } = require("../config/database");

async function createOrder({
  accountId,
  symbolId,
  side,
  orderType,
  volume,
  price,
  stopLoss,
  takeProfit
}) {
  const result = await pool.query(
    `
    INSERT INTO orders (
      account_id,
      symbol_id,
      side,
      order_type,
      volume,
      price,
      stop_loss,
      take_profit,
      status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
    RETURNING *
    `,
    [
      accountId,
      symbolId,
      side,
      orderType,
      volume,
      price,
      stopLoss,
      takeProfit
    ]
  );

  return result.rows[0];
}

async function fillOrder({
  orderId,
  filledPrice,
  filledVolume
}) {
  const result = await pool.query(
    `
    UPDATE orders
    SET
      status = 'filled',
      filled_price = $1,
      filled_volume = $2,
      updated_at = NOW()
    WHERE id = $3
    RETURNING *
    `,
    [
      filledPrice,
      filledVolume,
      orderId
    ]
  );

  return result.rows[0];
}

async function rejectOrder({
  orderId,
  reason
}) {
  const result = await pool.query(
    `
    UPDATE orders
    SET
      status = 'rejected',
      reject_reason = $1,
      updated_at = NOW()
    WHERE id = $2
    RETURNING *
    `,
    [
      reason,
      orderId
    ]
  );

  return result.rows[0];
}

async function getOrdersByAccount(accountId) {
  const result = await pool.query(
    `
    SELECT
      o.*,
      s.symbol,
      s.name
    FROM orders o
    JOIN symbols s
      ON s.id = o.symbol_id
    WHERE o.account_id = $1
    ORDER BY o.created_at DESC
    `,
    [accountId]
  );

  return result.rows;
}

async function getOrderHistory(accountId) {
  const result = await pool.query(
    `
    SELECT
      o.id,
      o.account_id,
      o.symbol_id,
      s.symbol,
      s.name,
      o.side,
      o.order_type,
      o.volume,
      o.price,
      o.stop_loss,
      o.take_profit,
      o.status,
      o.filled_price,
      o.filled_volume,
      o.reject_reason,
      o.created_at,
      o.updated_at
    FROM orders o
    JOIN symbols s
      ON s.id = o.symbol_id
    WHERE o.account_id = $1
    ORDER BY o.created_at DESC
    `,
    [accountId]
  );

  return result.rows;
}

module.exports = {
  createOrder,
  fillOrder,
  rejectOrder,
  getOrdersByAccount,
  getOrderHistory
};