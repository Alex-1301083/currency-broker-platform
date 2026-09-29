require("dotenv").config({
  path: require("path").resolve(process.cwd(), "../../.env"),
});

const { pool } = require("./src/config/database");

async function restoreAccount() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const accountId =
      "ad401a26-8aef-45b4-ba03-5e9ef4a2969b";

    const result = await client.query(
      `
      UPDATE accounts
      SET
        balance = 9987.95,
        equity = 9987.35,
        margin = 68.003,
        free_margin = 9919.347,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        account_number,
        balance,
        equity,
        margin,
        free_margin,
        status
      `,
      [accountId]
    );

    if (!result.rows.length) {
      throw new Error("Test account not found.");
    }

    await client.query("COMMIT");

    console.log("\n========== ACCOUNT RESTORED ==========");
    console.table(result.rows);
    console.log("=======================================\n");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("RESTORE FAILED:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

restoreAccount();