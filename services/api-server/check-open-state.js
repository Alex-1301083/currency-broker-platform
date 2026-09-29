require("dotenv").config({
  path: require("path").resolve(process.cwd(), "../../.env"),
});

const { pool } = require("./src/config/database");

async function checkOpenState() {
  try {
    const accountId =
      "ad401a26-8aef-45b4-ba03-5e9ef4a2969b";

    const result = await pool.query(
      `
      SELECT
        COUNT(*) AS open_positions,
        COALESCE(SUM(margin_used), 0) AS total_margin,
        COALESCE(SUM(unrealized_pnl), 0) AS total_unrealized_pnl
      FROM positions
      WHERE account_id = $1
        AND status = 'open'
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

checkOpenState();