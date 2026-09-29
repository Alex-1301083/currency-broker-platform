require("dotenv").config({
  path: require("path").resolve(__dirname, "../../../../.env"),
});

const { pool } = require("../config/database");
const { executeStopOut } = require("../services/stopout.service");

const ACCOUNT_ID =
  "ad401a26-8aef-45b4-ba03-5e9ef4a2969b";

async function runConcurrencyTest() {
  const client = await pool.connect();

  let accountSnapshot = null;
  let positionSnapshots = [];

  let createdTradeIds = [];
  let createdLedgerIds = [];
  let createdAuditIds = [];

  try {
    console.log(
      "\n========== REAL STOP-OUT CONCURRENCY TEST ==========\n"
    );

    // --------------------------------------------------
    // 1. SNAPSHOT ACCOUNT
    // --------------------------------------------------

    const accountResult = await client.query(
      `
      SELECT *
      FROM accounts
      WHERE id = $1
      `,
      [ACCOUNT_ID]
    );

    if (!accountResult.rows.length) {
      throw new Error("Test account not found.");
    }

    accountSnapshot = accountResult.rows[0];

    console.log("Account before test:", {
      balance: accountSnapshot.balance,
      equity: accountSnapshot.equity,
      margin: accountSnapshot.margin,
      free_margin: accountSnapshot.free_margin,
      status: accountSnapshot.status,
    });

    // --------------------------------------------------
    // 2. SNAPSHOT POSITIONS
    // --------------------------------------------------

    const positionsResult = await client.query(
      `
      SELECT *
      FROM positions
      WHERE account_id = $1
      ORDER BY opened_at
      `,
      [ACCOUNT_ID]
    );

    positionSnapshots = positionsResult.rows;

    const openPositions = positionSnapshots.filter(
      (position) => position.status === "open"
    );

    console.log(
      "\nOpen positions before test:",
      openPositions.length
    );

    if (openPositions.length === 0) {
      throw new Error(
        "Concurrency test requires at least one open position."
      );
    }

    // --------------------------------------------------
    // 3. CREATE TEMPORARY STOP-OUT CONDITION
    // --------------------------------------------------

    await client.query("BEGIN");

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
      [ACCOUNT_ID]
    );

    await client.query("COMMIT");

    console.log(
      "\nTemporary Stop-Out condition created."
    );

    console.log("Equity: 20");
    console.log("Margin: 1000");
    console.log("Margin Level: 2%");
    console.log("Stop-Out Level: 50%");

    // --------------------------------------------------
    // 4. TWO SIMULTANEOUS STOP-OUT REQUESTS
    // --------------------------------------------------

    console.log(
      "\nStarting two simultaneous Stop-Out requests..."
    );

    const results = await Promise.allSettled([
      executeStopOut({
        accountId: ACCOUNT_ID,
      }),
      executeStopOut({
        accountId: ACCOUNT_ID,
      }),
    ]);

    // --------------------------------------------------
    // 5. PROCESS RESULTS
    // --------------------------------------------------

    console.log("\n--- RESULTS ---");

    results.forEach((result, index) => {
      console.log(`\nRequest ${index + 1}:`);

      if (result.status === "fulfilled") {
        console.log("Status: fulfilled");
        console.log(
          "Triggered:",
          result.value.triggered
        );

        console.log(
          "Closed positions:",
          result.value.closedPositions.length
        );

        console.log(
          "Margin level:",
          result.value.marginLevel
        );

        for (const closedPosition of result.value
          .closedPositions) {
          if (closedPosition.trade?.id) {
            createdTradeIds.push(
              closedPosition.trade.id
            );
          }

          if (closedPosition.ledger?.id) {
            createdLedgerIds.push(
              closedPosition.ledger.id
            );
          }

          if (closedPosition.audit?.id) {
            createdAuditIds.push(
              closedPosition.audit.id
            );
          }
        }
      } else {
        console.log("Status: rejected");
        console.log(
          "Error:",
          result.reason?.message
        );
      }
    });

    // --------------------------------------------------
    // 6. REMOVE DUPLICATE IDS
    // --------------------------------------------------

    createdTradeIds = [
      ...new Set(createdTradeIds),
    ];

    createdLedgerIds = [
      ...new Set(createdLedgerIds),
    ];

    createdAuditIds = [
      ...new Set(createdAuditIds),
    ];

    // --------------------------------------------------
    // 7. CHECK POSITION STATE
    // --------------------------------------------------

    const positionStateResult = await client.query(
      `
      SELECT
        COUNT(*) FILTER (
          WHERE status = 'open'
        ) AS open_positions,

        COUNT(*) FILTER (
          WHERE status = 'closed'
        ) AS closed_positions

      FROM positions
      WHERE account_id = $1
      `,
      [ACCOUNT_ID]
    );

    const positionState =
      positionStateResult.rows[0];

    console.log(
      "\nPosition state after test:",
      positionState
    );

    // --------------------------------------------------
    // 8. VERIFY EXACTLY ONE LIQUIDATION
    // --------------------------------------------------

    console.log("\n--- CONCURRENCY ASSERTIONS ---");

    if (createdTradeIds.length !== 1) {
      throw new Error(
        `Expected exactly 1 Stop-Out trade, got ${createdTradeIds.length}`
      );
    }

    console.log(
      "✓ Exactly 1 Stop-Out trade created."
    );

    if (createdLedgerIds.length !== 1) {
      throw new Error(
        `Expected exactly 1 Stop-Out ledger entry, got ${createdLedgerIds.length}`
      );
    }

    console.log(
      "✓ Exactly 1 Stop-Out ledger entry created."
    );

    if (createdAuditIds.length !== 1) {
      throw new Error(
        `Expected exactly 1 Stop-Out audit entry, got ${createdAuditIds.length}`
      );
    }

    console.log(
      "✓ Exactly 1 Stop-Out audit entry created."
    );

    if (results.filter(
      (result) =>
        result.status === "fulfilled" &&
        result.value.closedPositions.length > 0
    ).length !== 1) {
      throw new Error(
        "Expected exactly one request to perform liquidation."
      );
    }

    console.log(
      "✓ Only one request performed liquidation."
    );

    // --------------------------------------------------
    // 9. SUCCESS
    // --------------------------------------------------

    console.log(
      "\n=============================================="
    );

    console.log(
      "STOP-OUT CONCURRENCY LOGIC PASSED."
    );

    console.log(
      "Two simultaneous Stop-Out requests did NOT double-close the same position."
    );

    console.log(
      "==============================================\n"
    );

  } catch (error) {
    console.error(
      "\nSTOP-OUT CONCURRENCY TEST FAILED:"
    );

    console.error(error);

    process.exitCode = 1;

  } finally {
    // --------------------------------------------------
    // 10. RESTORE ORIGINAL STATE
    // --------------------------------------------------

    console.log(
      "\n--- RESTORING ORIGINAL STATE ---"
    );

    try {
      await client.query("BEGIN");

      // Restore account
      if (accountSnapshot) {
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
            created_at = $7,
            updated_at = $8
          WHERE id = $9
          `,
          [
            accountSnapshot.balance,
            accountSnapshot.equity,
            accountSnapshot.margin,
            accountSnapshot.free_margin,
            accountSnapshot.leverage,
            accountSnapshot.status,
            accountSnapshot.created_at,
            accountSnapshot.updated_at,
            ACCOUNT_ID,
          ]
        );
      }

      // Restore every position
      for (const position of positionSnapshots) {
        await client.query(
          `
          UPDATE positions
          SET
            account_id = $1,
            symbol_id = $2,
            side = $3,
            volume = $4,
            entry_price = $5,
            current_price = $6,
            stop_loss = $7,
            take_profit = $8,
            unrealized_pnl = $9,
            margin_used = $10,
            status = $11,
            opened_at = $12,
            updated_at = $13,
            closed_at = $14
          WHERE id = $15
          `,
          [
            position.account_id,
            position.symbol_id,
            position.side,
            position.volume,
            position.entry_price,
            position.current_price,
            position.stop_loss,
            position.take_profit,
            position.unrealized_pnl,
            position.margin_used,
            position.status,
            position.opened_at,
            position.updated_at,
            position.closed_at,
            position.id,
          ]
        );
      }

      // Delete test audit records
      if (createdAuditIds.length > 0) {
        await client.query(
          `
          DELETE FROM audit_logs
          WHERE id = ANY($1::uuid[])
          `,
          [createdAuditIds]
        );
      }

      // Delete test ledger records
      if (createdLedgerIds.length > 0) {
        await client.query(
          `
          DELETE FROM ledger_entries
          WHERE id = ANY($1::uuid[])
          `,
          [createdLedgerIds]
        );
      }

      // Delete test trades
      if (createdTradeIds.length > 0) {
        await client.query(
          `
          DELETE FROM trades
          WHERE id = ANY($1::uuid[])
          `,
          [createdTradeIds]
        );
      }

      await client.query("COMMIT");

      console.log(
        "Original account restored."
      );

      console.log(
        "Original positions restored."
      );

      console.log(
        "Test trades removed."
      );

      console.log(
        "Test ledger entries removed."
      );

      console.log(
        "Test audit entries removed."
      );

      console.log(
        "\n========== REAL CONCURRENCY TEST COMPLETE ==========\n"
      );

    } catch (restoreError) {
      await client.query("ROLLBACK");

      console.error(
        "\n!!! RESTORE FAILED !!!"
      );

      console.error(restoreError);

      process.exitCode = 1;
    }

    client.release();
    await pool.end();
  }
}

runConcurrencyTest();