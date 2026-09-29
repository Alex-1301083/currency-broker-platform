require("dotenv").config({
  path: require("path").resolve(__dirname, "../../../../.env"),
});

const { pool } = require("../config/database");
const { executeStopOut } = require("../services/stopout.service");

const TEST_ACCOUNT_ID =
  "ad401a26-8aef-45b4-ba03-5e9ef4a2969b";

async function runStopOutExecutionTest() {
  const client = await pool.connect();

  let accountSnapshot;
  let positionSnapshots = [];
  let createdTradeIds = [];
  let createdLedgerIds = [];

  try {
    console.log("\n========== SAFE STOP-OUT EXECUTION TEST ==========");

    // ==================================================
    // 1. Take snapshot
    // ==================================================

    const accountResult = await client.query(
      `
      SELECT *
      FROM accounts
      WHERE id = $1
      `,
      [TEST_ACCOUNT_ID],
    );

    if (!accountResult.rows.length) {
      throw new Error("Test account not found.");
    }

    accountSnapshot = accountResult.rows[0];

    const positionsResult = await client.query(
      `
      SELECT *
      FROM positions
      WHERE account_id = $1
        AND status = 'open'
      ORDER BY id
      `,
      [TEST_ACCOUNT_ID],
    );

    positionSnapshots = positionsResult.rows;

    console.log("\n--- SNAPSHOT ---");
    console.log("Account:", accountSnapshot.id);
    console.log("Balance:", accountSnapshot.balance);
    console.log("Equity:", accountSnapshot.equity);
    console.log("Margin:", accountSnapshot.margin);
    console.log("Free Margin:", accountSnapshot.free_margin);
    console.log(
      "Open Positions:",
      positionSnapshots.length,
    );

    if (!positionSnapshots.length) {
      throw new Error(
        "No open positions available for Stop-Out test.",
      );
    }

    // ==================================================
    // 2. Force temporary Stop-Out condition
    // ==================================================

    await client.query(
      `
      UPDATE accounts
      SET
        equity = 20,
        margin = 1000,
        free_margin = -980,
        updated_at = NOW()
      WHERE id = $1
      `,
      [TEST_ACCOUNT_ID],
    );

    console.log("\nTemporary Stop-Out condition created.");
    console.log("Equity: 20");
    console.log("Margin: 1000");
    console.log("Margin Level: 2%");

    // IMPORTANT:
    // Commit temporary setup because executeStopOut()
    // uses a separate PostgreSQL connection/transaction.

    await client.query("COMMIT");

    // ==================================================
    // 3. Execute Stop-Out
    // ==================================================

    const result = await executeStopOut({
      accountId: TEST_ACCOUNT_ID,
    });

    console.log("\n--- STOP-OUT RESULT ---");

    console.log("Triggered:", result.triggered);
    console.log("Stop-Out Level:", result.stopOutLevel);
    console.log(
      "Closed Positions:",
      result.closedPositions.length,
    );

    if (!result.triggered) {
      throw new Error(
        "Stop-Out should have triggered.",
      );
    }

    if (!result.closedPositions.length) {
      throw new Error(
        "Stop-Out triggered but no position was closed.",
      );
    }

    // ==================================================
    // 4. Validate each closed position
    // ==================================================

    for (const closed of result.closedPositions) {
      console.log("\nPosition closed:");
      console.log("Position ID:", closed.position.id);
      console.log("Symbol:", closed.position.symbol);
      console.log("Side:", closed.position.side);
      console.log("Volume:", closed.position.volume);
      console.log("Realized P/L:", closed.realizedPnl);
      console.log(
        "Released Margin:",
        closed.releasedMargin,
      );

      if (!closed.trade?.id) {
        throw new Error(
          "Closing trade was not created.",
        );
      }

      if (!closed.ledger?.id) {
        throw new Error(
          "Ledger entry was not created.",
        );
      }

      createdTradeIds.push(closed.trade.id);
      createdLedgerIds.push(closed.ledger.id);
    }

    // ==================================================
    // 5. Read account after Stop-Out
    // ==================================================

    const afterAccountResult = await client.query(
      `
      SELECT *
      FROM accounts
      WHERE id = $1
      `,
      [TEST_ACCOUNT_ID],
    );

    const afterAccount = afterAccountResult.rows[0];

    console.log("\n--- ACCOUNT AFTER STOP-OUT ---");
    console.log("Balance:", afterAccount.balance);
    console.log("Equity:", afterAccount.equity);
    console.log("Margin:", afterAccount.margin);
    console.log("Free Margin:", afterAccount.free_margin);

    // ==================================================
    // 6. Verify positions
    // ==================================================

    const afterPositionsResult = await client.query(
      `
      SELECT
        p.id,
        p.status,
        p.margin_used,
        p.unrealized_pnl,
        s.symbol
      FROM positions p
      JOIN symbols s
        ON s.id = p.symbol_id
      WHERE p.account_id = $1
      ORDER BY p.id
      `,
      [TEST_ACCOUNT_ID],
    );

    console.log("\n--- POSITIONS AFTER STOP-OUT ---");

    for (const position of afterPositionsResult.rows) {
      console.log(
        position.id,
        "|",
        position.symbol,
        "|",
        position.status,
        "| margin:",
        position.margin_used,
      );
    }

    // ==================================================
    // 7. Verify trades
    // ==================================================

    const tradesResult = await client.query(
      `
      SELECT *
      FROM trades
      WHERE id = ANY($1::uuid[])
      `,
      [createdTradeIds],
    );

    console.log(
      "\nCreated Stop-Out trades:",
      tradesResult.rows.length,
    );

    if (
      tradesResult.rows.length !==
      createdTradeIds.length
    ) {
      throw new Error(
        "Trade verification failed.",
      );
    }

    // ==================================================
    // 8. Verify ledger
    // ==================================================

    const ledgerResult = await client.query(
      `
      SELECT *
      FROM ledger_entries
      WHERE id = ANY($1::uuid[])
      `,
      [createdLedgerIds],
    );

    console.log(
      "Created Stop-Out ledger entries:",
      ledgerResult.rows.length,
    );

    if (
      ledgerResult.rows.length !==
      createdLedgerIds.length
    ) {
      throw new Error(
        "Ledger verification failed.",
      );
    }

    console.log(
      "\nSTOP-OUT EXECUTION LOGIC PASSED.",
    );

    // ==================================================
    // 9. RESTORE ACCOUNT SNAPSHOT
    // ==================================================

    console.log("\n--- RESTORING ORIGINAL STATE ---");

    await client.query("BEGIN");

    await client.query(
      `
      UPDATE accounts
      SET
        balance = $1,
        equity = $2,
        margin = $3,
        free_margin = $4,
        leverage = $5,
        status = $6,
        updated_at = $7
      WHERE id = $8
      `,
      [
        accountSnapshot.balance,
        accountSnapshot.equity,
        accountSnapshot.margin,
        accountSnapshot.free_margin,
        accountSnapshot.leverage,
        accountSnapshot.status,
        accountSnapshot.updated_at,
        accountSnapshot.id,
      ],
    );

    // Restore positions
    for (const position of positionSnapshots) {
      await client.query(
        `
        UPDATE positions
        SET
          current_price = $1,
          unrealized_pnl = $2,
          status = $3,
          updated_at = $4,
          closed_at = $5
        WHERE id = $6
        `,
        [
          position.current_price,
          position.unrealized_pnl,
          position.status,
          position.updated_at,
          position.closed_at,
          position.id,
        ],
      );
    }

    // Remove test trades
    if (createdTradeIds.length) {
      await client.query(
        `
        DELETE FROM trades
        WHERE id = ANY($1::uuid[])
        `,
        [createdTradeIds],
      );
    }

    // Remove test ledger entries
    if (createdLedgerIds.length) {
      await client.query(
        `
        DELETE FROM ledger_entries
        WHERE id = ANY($1::uuid[])
        `,
        [createdLedgerIds],
      );
    }

    await client.query("COMMIT");

    console.log(
      "Original account state restored.",
    );

    // ==================================================
    // 10. Final verification
    // ==================================================

    const finalAccountResult = await client.query(
      `
      SELECT
        balance,
        equity,
        margin,
        free_margin
      FROM accounts
      WHERE id = $1
      `,
      [TEST_ACCOUNT_ID],
    );

    const finalAccount =
      finalAccountResult.rows[0];

    console.log("\n--- FINAL VERIFICATION ---");

    console.log(
      "Balance restored:",
      finalAccount.balance ===
        accountSnapshot.balance,
    );

    console.log(
      "Equity restored:",
      finalAccount.equity ===
        accountSnapshot.equity,
    );

    console.log(
      "Margin restored:",
      finalAccount.margin ===
        accountSnapshot.margin,
    );

    console.log(
      "Free margin restored:",
      finalAccount.free_margin ===
        accountSnapshot.free_margin,
    );

    console.log(
      "\n========== SAFE STOP-OUT TEST COMPLETE ==========",
    );
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {}

    console.error(
      "\nSTOP-OUT EXECUTION TEST FAILED",
    );
    console.error(error);

    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

runStopOutExecutionTest();