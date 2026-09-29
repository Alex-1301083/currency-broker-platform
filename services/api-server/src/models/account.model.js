const { pool } = require("../config/database");

async function findAccountByUserId(userId) {
  const result = await pool.query(
    `
    SELECT
      id,
      user_id,
      account_number,
      currency,
      balance,
      equity,
      margin,
      free_margin,
      leverage,
      status,
      created_at,
      updated_at
    FROM accounts
    WHERE user_id = $1
    ORDER BY created_at ASC
    LIMIT 1
    `,
    [userId]
  );

  return result.rows[0] || null;
}

async function findAccountById(accountId, userId) {
  const result = await pool.query(
    `
    SELECT
      id,
      user_id,
      account_number,
      currency,
      balance,
      equity,
      margin,
      free_margin,
      leverage,
      status,
      created_at,
      updated_at
    FROM accounts
    WHERE id = $1
      AND user_id = $2
    LIMIT 1
    `,
    [accountId, userId]
  );

  return result.rows[0] || null;
}

async function findAccountsBySymbol(symbol) {
  const result = await pool.query(
    `
    SELECT DISTINCT
      a.id,
      a.user_id,
      a.account_number,
      a.currency,
      a.balance,
      a.equity,
      a.margin,
      a.free_margin,
      a.leverage,
      a.status,
      a.created_at,
      a.updated_at
    FROM accounts a
    JOIN positions p
      ON p.account_id = a.id
    JOIN symbols s
      ON s.id = p.symbol_id
    WHERE UPPER(s.symbol) = UPPER($1)
      AND p.status = 'open'
    ORDER BY a.created_at ASC
    `,
    [symbol]
  );

  return result.rows;
}

async function createAccount({
  userId,
  accountNumber,
  currency = "USD",
  initialBalance = 10000,
  leverage = 100
}) {
  const result = await pool.query(
    `
    INSERT INTO accounts (
      user_id,
      account_number,
      currency,
      balance,
      equity,
      margin,
      free_margin,
      leverage,
      status
    )
    VALUES (
      $1,
      $2,
      $3,
      $4,
      $4,
      0,
      $4,
      $5,
      'active'
    )
    RETURNING
      id,
      user_id,
      account_number,
      currency,
      balance,
      equity,
      margin,
      free_margin,
      leverage,
      status,
      created_at,
      updated_at
    `,
    [
      userId,
      accountNumber,
      currency,
      initialBalance,
      leverage
    ]
  );

  return result.rows[0];
}

module.exports = {
  findAccountByUserId,
  findAccountById,
  createAccount,
  findAccountsBySymbol
};