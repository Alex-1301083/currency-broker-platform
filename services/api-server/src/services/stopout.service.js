const { pool } = require("../config/database");
const {
  calculateMarginLevel,
  getStopOutLevel,
} = require("./risk.service");
const { createLedgerEntry } = require("./ledger.service");
const { calculateUnrealizedPnl } = require("./position.service");
const { createAuditLog } = require("../models/audit-log.model");

async function executeStopOut({ accountId }) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    /*
      1. Lock account
    */
    const accountResult = await client.query(
      `
      SELECT *
      FROM accounts
      WHERE id = $1
        AND status = 'active'
      FOR UPDATE
      `,
      [accountId],
    );

    if (!accountResult.rows.length) {
      throw new Error("Active trading account not found");
    }

    let account = accountResult.rows[0];

    /*
      2. Check current margin level
    */
    let marginLevel = calculateMarginLevel({
      equity: account.equity,
      margin: account.margin,
    });

    const stopOutLevel = getStopOutLevel();

    /*
      No margin means nothing to stop out.
    */
    if (marginLevel === null || marginLevel > stopOutLevel) {
      await client.query("COMMIT");

      return {
        triggered: false,
        reason: "Stop-Out threshold not reached",
        marginLevel,
        stopOutLevel,
        account,
        closedPositions: [],
      };
    }

    /*
      3. Get open positions.

      Highest margin position is processed first.
      This releases the largest margin amount first.
    */
    const positionsResult = await client.query(
      `
      SELECT
        p.*,
        s.symbol,
        s.name,
        s.bid,
        s.ask,
        s.contract_size,
        s.digits
      FROM positions p
      JOIN symbols s
        ON s.id = p.symbol_id
      WHERE p.account_id = $1
        AND p.status = 'open'
      ORDER BY p.margin_used DESC
      FOR UPDATE
      `,
      [account.id],
    );

    if (!positionsResult.rows.length) {
      await client.query("COMMIT");

      return {
        triggered: true,
        reason: "Stop-Out triggered but no open positions found",
        marginLevel,
        stopOutLevel,
        account,
        closedPositions: [],
      };
    }

    const closedPositions = [];

    /*
      4. Close positions until margin level
         returns above the Stop-Out level.
    */
    for (const position of positionsResult.rows) {
      if (marginLevel > stopOutLevel) {
        break;
      }

      /*
        Determine closing price.

        BUY  -> close at BID
        SELL -> close at ASK
      */
      const closingPrice =
        position.side.toLowerCase() === "buy"
          ? Number(position.bid)
          : Number(position.ask);

      /*
        Calculate realized P/L
      */
      const realizedPnl = calculateUnrealizedPnl({
        side: position.side,
        entryPrice: position.entry_price,
        currentBid: position.bid,
        currentAsk: position.ask,
        volume: position.volume,
        contractSize: position.contract_size,
      });

      /*
        Create closing trade
      */
      const tradeResult = await client.query(
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
        VALUES (
          NULL,
          $1,
          $2,
          $3,
          $4,
          $5,
          0,
          0,
          $6
        )
        RETURNING *
        `,
        [
          account.id,
          position.symbol_id,
          position.side,
          position.volume,
          closingPrice,
          realizedPnl,
        ],
      );

      const closingTrade = tradeResult.rows[0];

      /*
        Close position
      */
      const closedPositionResult = await client.query(
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
        [closingPrice, position.id],
      );

      if (!closedPositionResult.rows.length) {
        throw new Error(
          `Failed to close position ${position.id}`,
        );
      }

      const closedPosition = closedPositionResult.rows[0];

      /*
        Release margin
      */
      const oldMargin = Number(account.margin);
      const positionMargin = Number(position.margin_used);

      const newMargin = Math.max(
        0,
        oldMargin - positionMargin,
      );

      /*
        Update balance with realized P/L
      */
      const oldBalance = Number(account.balance);
      const newBalance = oldBalance + realizedPnl;

      /*
        Create ledger entry
      */
      const ledgerEntry = await createLedgerEntry({
        client,
        accountId: account.id,
        entryType:
          realizedPnl >= 0
            ? "trade_profit"
            : "trade_loss",
        amount: realizedPnl,
        balanceBefore: oldBalance,
        balanceAfter: newBalance,
        referenceType: "trade",
        referenceId: closingTrade.id,
        description:
          `Stop-Out closing ${position.symbol} ` +
          `${position.side.toUpperCase()} position`,
      });

      /*
        Calculate remaining unrealized P/L
      */
      const remainingPnlResult = await client.query(
        `
        SELECT
          COALESCE(
            SUM(unrealized_pnl),
            0
          ) AS total_unrealized_pnl
        FROM positions
        WHERE account_id = $1
          AND status = 'open'
        `,
        [account.id],
      );

      const remainingUnrealizedPnl = Number(
        remainingPnlResult.rows[0]
          .total_unrealized_pnl,
      );

      /*
        Recalculate account
      */
      const newEquity =
        newBalance + remainingUnrealizedPnl;

      const newFreeMargin =
        newEquity - newMargin;

      /*
        Update account
      */
      const updatedAccountResult = await client.query(
        `
        UPDATE accounts
        SET
          balance = $1,
          equity = $2,
          margin = $3,
          free_margin = $4,
          updated_at = NOW()
        WHERE id = $5
        RETURNING *
        `,
        [
          newBalance,
          newEquity,
          newMargin,
          newFreeMargin,
          account.id,
        ],
      );

      account = updatedAccountResult.rows[0];

      /*
        Recalculate margin level
      */
      marginLevel = calculateMarginLevel({
        equity: account.equity,
        margin: account.margin,
      });

      /*
        Create Stop-Out audit log.

        IMPORTANT:
        This happens after all required variables
        have been initialized.

        Because we use the same transaction client,
        the audit record will rollback if Stop-Out
        transaction fails.
      */
      const auditLog = await createAuditLog({
        client,
        userId: null,
        action: "STOP_OUT_EXECUTED",
        entityType: "position",
        entityId: closedPosition.id,
        metadata: {
          accountId: account.id,
          positionId: closedPosition.id,
          tradeId: closingTrade.id,
          symbol: position.symbol,
          side: position.side,
          volume: Number(position.volume),
          closingPrice,
          realizedPnl,
          releasedMargin: positionMargin,
          marginLevelAfterClose: marginLevel,
          stopOutLevel,
        },
      });

      /*
        Store Stop-Out result
      */
      closedPositions.push({
        position: {
          ...closedPosition,
          symbol: position.symbol,
          name: position.name,
        },
        trade: closingTrade,
        ledger: ledgerEntry,
        audit: auditLog,
        realizedPnl,
        releasedMargin: positionMargin,
        marginLevelAfterClose: marginLevel,
      });
    }

    /*
      5. Commit Stop-Out transaction
    */
    await client.query("COMMIT");

    return {
      triggered: true,
      stopOutLevel,
      marginLevel,
      account,
      closedPositions,
    };
  } catch (error) {
    /*
      Rollback everything if any part fails.
    */
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  executeStopOut,
};