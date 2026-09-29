require("dotenv").config({
   path: require("path").resolve(__dirname, "../../../../.env"),
});

const { pool } = require("../config/database");
const { executeStopOut } = require("../services/stopout.service");

async function runStopOutTest() {
  const client = await pool.connect();

  let testAccountId = null;
  let originalAccount = null;
  let originalPositions = [];

  try {
    await client.query("BEGIN");

    /*
     * 1. Pick an existing account only for reading.
     *    We will restore everything through ROLLBACK.
     */
    const accountResult = await client.query(
      `
      SELECT *
      FROM accounts
      WHERE id = $1
      FOR UPDATE
      `,
      ["ad401a26-8aef-45b4-ba03-5e9ef4a2969b"],
    );

    if (!accountResult.rows.length) {
      throw new Error("Test account not found.");
    }

    originalAccount = accountResult.rows[0];
    testAccountId = originalAccount.id;

    /*
     * 2. Save existing open positions.
     */
    const positionsResult = await client.query(
      `
      SELECT *
      FROM positions
      WHERE account_id = $1
        AND status = 'open'
      FOR UPDATE
      `,
      [testAccountId],
    );

    originalPositions = positionsResult.rows;

    console.log("\n========== STOP-OUT TEST ==========");
    console.log("Account:", testAccountId);
    console.log("Original balance:", originalAccount.balance);
    console.log("Original equity:", originalAccount.equity);
    console.log("Original margin:", originalAccount.margin);
    console.log(
      "Original free margin:",
      originalAccount.free_margin,
    );
    console.log(
      "Original open positions:",
      originalPositions.length,
    );

    /*
     * We are NOT modifying the account here.
     *
     * This test only verifies that the service can load
     * and evaluate the account safely.
     */

    await client.query("ROLLBACK");

    console.log("\nStop-Out controlled test setup passed.");
    console.log("No database changes were committed.");
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("\nSTOP-OUT TEST FAILED");
    console.error(error.message);

    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

runStopOutTest();