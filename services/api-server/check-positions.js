require("dotenv").config({
  path: require("path").resolve(process.cwd(), "../../.env"),
});

const { pool } = require("./src/config/database");

async function checkPositions() {
  try {
    const accountId =
      "ad401a26-8aef-45b4-ba03-5e9ef4a2969b";

    const result = await pool.query(
      `
      SELECT
        id,
        symbol_id,
        side,
        volume,
        entry_price,
        current_price,
        unrealized_pnl,
        margin_used,
        status,
        closed_at
      FROM positions
      WHERE account_id = $1
      ORDER BY opened_at
      `,
      [accountId]
    );

    console.table(result.rows);
  } catch (error) {
    console.error("ERROR:", error);
  } finally {
    await pool.end();
  }
}

checkPositions();